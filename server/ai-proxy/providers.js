/**
 * Model providers for the proxy. The worker asks for ONE thing (call the `give_answer`
 * tool with a JSON object) and each provider knows how to ask for it and how to read the
 * reply. Whatever comes back is untrusted and is validated by the worker afterwards, so
 * swapping provider can change answer quality but never the safety rules.
 *
 * Select with PROVIDER, then optionally FALLBACK_PROVIDERS (comma-separated).
 * Keys are Worker secrets. Model names can be set with MODEL or MODEL_<PROVIDER>.
 *
 * @typedef {{ system: string, user: string, tool: {name:string, description:string, input_schema:object}, env: Record<string,string> }} CallArgs
 * @typedef {{ keyName: string, label: string, defaultModel: string, build(a: CallArgs, key: string): {url:string, headers:Record<string,string>, body:object}, parse(data:any, toolName:string): object|undefined }} Provider
 */

const MAX_TOKENS = 700;
const PROVIDER_POLICY_VERSION = "2026-11-12";

/** Models sometimes wrap JSON in ```fences``` or add a sentence around it. */
export function extractJson(text) {
  if (typeof text !== "string") return undefined;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return undefined;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

/**
 * The conversation as role-tagged turns. A chat request passes `turns` (her messages and the app's
 * replies, oldest first, the last one hers); older single-message calls pass only `user`.
 * @returns {{role: "user"|"assistant", text: string}[]}
 */
export const turnsOf = ({ turns, user }) => (Array.isArray(turns) && turns.length ? turns : [{ role: "user", text: user }]);

/** @type {Provider} */
const anthropic = {
  keyName: "ANTHROPIC_API_KEY",
  label: "Anthropic Claude",
  defaultModel: "claude-sonnet-5-5",
  build({ system, user, turns, tool, env }, key) {
    return {
      url: "https://api.anthropic.com/v1/messages",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: {
        model: env.MODEL || anthropic.defaultModel,
        max_tokens: MAX_TOKENS,
        system,
        tools: [tool],
        tool_choice: { type: "tool", name: tool.name },
        messages: turnsOf({ turns, user }).map((t) => ({ role: t.role, content: t.text })),
      },
    };
  },
  parse: (data, name) => data.content?.find((b) => b.type === "tool_use" && b.name === name)?.input,
};

/** Google Gemini (generativelanguage REST). Free tier exists; see docs/AI.md for the privacy catch. */
/** @type {Provider} */
const gemini = {
  keyName: "GEMINI_API_KEY",
  label: "Google Gemini",
  defaultModel: "gemini-3.1-flash-lite",
  privacyUrl: "https://ai.google.dev/gemini-api/terms",
  privacySummary:
    "يُسمح بالإرسال فقط عند ربط المشروع بفوترة Google نشطة؛ عندها لا تستخدم Google الطلبات لتحسين منتجاتها، لكنها قد تحتفظ بها مؤقتاً للأمان والامتثال. لا نسمح بحصة Gemini المجانية غير المرتبطة بالفوترة لهذه المحادثات الحساسة.",
  policyVersion: PROVIDER_POLICY_VERSION,
  build({ system, user, turns, tool, env }, key) {
    const model = env.MODEL || gemini.defaultModel;
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      headers: { "x-goog-api-key": key },
      body: {
        systemInstruction: { parts: [{ text: system }] },
        // Gemini calls the assistant role "model"
        contents: turnsOf({ turns, user }).map((t) => ({ role: t.role === "assistant" ? "model" : "user", parts: [{ text: t.text }] })),
        tools: [
          {
            functionDeclarations: [
              { name: tool.name, description: tool.description, parameters: tool.input_schema },
            ],
          },
        ],
        toolConfig: { functionCallingConfig: { mode: "ANY", allowedFunctionNames: [tool.name] } },
        generationConfig: { maxOutputTokens: MAX_TOKENS, temperature: 0.2 },
      },
    };
  },
  parse(data, name) {
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const call = parts.find((p) => p.functionCall?.name === name)?.functionCall?.args;
    if (call) return call;
    return extractJson(parts.map((p) => p.text ?? "").join(""));
  },
};

/** NVIDIA NIM / build.nvidia.com: OpenAI-compatible chat completions. */
/** @type {Provider} */
const nvidia = {
  keyName: "NVIDIA_API_KEY",
  label: "NVIDIA NIM",
  defaultModel: "meta/llama-3.3-70b-instruct",
  privacyUrl: "https://www.nvidia.com/en-us/about-nvidia/privacy-policy/",
  privacySummary:
    "تختلف معالجة البيانات والاحتفاظ بها حسب شروط الخدمة والنموذج؛ راجعي الشروط الحالية قبل تفعيل هذا المزوّد.",
  policyVersion: PROVIDER_POLICY_VERSION,
  build({ system, user, turns, tool, env }, key) {
    return {
      url: "https://integrate.api.nvidia.com/v1/chat/completions",
      headers: { authorization: `Bearer ${key}` },
      body: {
        model: env.MODEL || nvidia.defaultModel,
        max_tokens: MAX_TOKENS,
        temperature: 0.2,
        messages: [{ role: "system", content: system }, ...turnsOf({ turns, user }).map((t) => ({ role: t.role, content: t.text }))],
        tools: [
          {
            type: "function",
            function: { name: tool.name, description: tool.description, parameters: tool.input_schema },
          },
        ],
        tool_choice: { type: "function", function: { name: tool.name } },
      },
    };
  },
  parse(data) {
    const msg = data.choices?.[0]?.message;
    const args = msg?.tool_calls?.[0]?.function?.arguments;
    if (typeof args === "string") return extractJson(args);
    // some NIM models ignore tools and answer in text: accept JSON from the text
    return extractJson(msg?.content);
  },
};

function openAiCompatible({
  keyName,
  label,
  defaultModel,
  endpoint,
  privacyUrl,
  privacySummary,
  extraHeaders,
  extraBody,
}) {
  return {
    keyName,
    label,
    defaultModel,
    privacyUrl,
    privacySummary,
    policyVersion: PROVIDER_POLICY_VERSION,
    build({ system, user, turns, tool, env }, key) {
      return {
        url: endpoint,
        headers: { authorization: `Bearer ${key}`, ...extraHeaders?.(env) },
        body: {
          model: env.MODEL || defaultModel,
          max_tokens: MAX_TOKENS,
          temperature: 0.2,
          messages: [{ role: "system", content: system }, ...turnsOf({ turns, user }).map((t) => ({ role: t.role, content: t.text }))],
          tools: [
            {
              type: "function",
              function: { name: tool.name, description: tool.description, parameters: tool.input_schema },
            },
          ],
          tool_choice: { type: "function", function: { name: tool.name } },
          ...extraBody,
        },
      };
    },
    parse(data, name) {
      const message = data.choices?.[0]?.message;
      const call = message?.tool_calls?.find((item) => item.function?.name === name)?.function?.arguments;
      if (call && typeof call === "object") return call;
      if (typeof call === "string") return extractJson(call);
      return extractJson(message?.content);
    },
  };
}

const openai = openAiCompatible({
  keyName: "OPENAI_API_KEY",
  label: "OpenAI API",
  defaultModel: "gpt-4.1-mini",
  endpoint: "https://api.openai.com/v1/chat/completions",
  privacyUrl: "https://developers.openai.com/api/docs/guides/your-data",
  privacySummary:
    "بيانات API لا تُستخدم لتدريب نماذج OpenAI افتراضياً؛ سجلات إساءة الاستخدام قد تحتفظ بالمحتوى حتى 30 يوماً افتراضياً. لا توجد حصة API مجانية عامة، والاستخدام مدفوع حسب الرموز.",
});

const openrouter = openAiCompatible({
  keyName: "OPENROUTER_API_KEY",
  label: "OpenRouter",
  defaultModel: "google/gemini-2.5-flash-lite:free",
  endpoint: "https://openrouter.ai/api/v1/chat/completions",
  privacyUrl: "https://openrouter.ai/privacy",
  privacySummary:
    "OpenRouter لا يستخدم المدخلات لتدريب نماذجه، لكنه يمررها إلى مزوّد النموذج المختار؛ سيُمنع مزودو النماذج الذين يجمعون البيانات، كما سيُعطّل التحويل التلقائي إلى مزوّد آخر.",
  extraHeaders: (env) => ({
    "HTTP-Referer": env.APP_URL || "https://fazaa.ibrheam-app.workers.dev",
    "X-OpenRouter-Title": "Fazaa",
  }),
  extraBody: { provider: { data_collection: "deny", allow_fallbacks: false } },
});

export const PROVIDERS = { anthropic, gemini, nvidia, openai, openrouter };
export const DEFAULT_PROVIDER = "gemini";

/** Resolve only configured, consent-disclosable providers in explicit fallback order. */
export function configuredProviders(env) {
  const primary = env.PROVIDER || DEFAULT_PROVIDER;
  const fallback = String(env.FALLBACK_PROVIDERS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return [...new Set([primary, ...fallback])]
    .slice(0, 3)
    .flatMap((id) => {
      const provider = PROVIDERS[id];
      if (!provider || !env[provider.keyName]) return [];
      if (id === "gemini" && env.GEMINI_PAID_PROJECT !== "true") return [];
      const model = env[`MODEL_${id.toUpperCase()}`] || (id === primary ? env.MODEL : "") || provider.defaultModel;
      return [{ id, label: provider.label, model, privacyUrl: provider.privacyUrl, privacySummary: provider.privacySummary }];
    });
}

/** Stable consent binding: changing provider, model, policy, or order requires fresh consent. */
export function providerConsentId(env) {
  return configuredProviders(env)
    .map(({ id, model }) => `${id}:${model}:${PROVIDERS[id].policyVersion}`)
    .join("|");
}
