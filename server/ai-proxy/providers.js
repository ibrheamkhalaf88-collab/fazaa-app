/**
 * Model providers for the proxy. The worker asks for ONE thing (call the `give_answer`
 * tool with a JSON object) and each provider knows how to ask for it and how to read the
 * reply. Whatever comes back is untrusted and is validated by the worker afterwards, so
 * swapping provider can change answer quality but never the safety rules.
 *
 * Select with the PROVIDER variable: "gemini" (default) | "nvidia" | "anthropic".
 * Keys are Worker secrets: GEMINI_API_KEY / NVIDIA_API_KEY / ANTHROPIC_API_KEY.
 * Model names change often; override with MODEL instead of editing code.
 *
 * @typedef {{ system: string, user: string, tool: {name:string, description:string, input_schema:object}, env: Record<string,string> }} CallArgs
 * @typedef {{ keyName: string, label: string, defaultModel: string, build(a: CallArgs, key: string): {url:string, headers:Record<string,string>, body:object}, parse(data:any, toolName:string): object|undefined }} Provider
 */

const MAX_TOKENS = 700;

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

/** @type {Provider} */
const anthropic = {
  keyName: "ANTHROPIC_API_KEY",
  label: "Anthropic Claude",
  defaultModel: "claude-sonnet-5-5",
  build({ system, user, tool, env }, key) {
    return {
      url: "https://api.anthropic.com/v1/messages",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: {
        model: env.MODEL || anthropic.defaultModel,
        max_tokens: MAX_TOKENS,
        system,
        tools: [tool],
        tool_choice: { type: "tool", name: tool.name },
        messages: [{ role: "user", content: user }],
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
  defaultModel: "gemini-flash-lite-latest", // an alias Google keeps current (fixed versions get retired)
  build({ system, user, tool, env }, key) {
    const model = env.MODEL || gemini.defaultModel;
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      headers: { "x-goog-api-key": key },
      body: {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
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
  build({ system, user, tool, env }, key) {
    return {
      url: "https://integrate.api.nvidia.com/v1/chat/completions",
      headers: { authorization: `Bearer ${key}` },
      body: {
        model: env.MODEL || nvidia.defaultModel,
        max_tokens: MAX_TOKENS,
        temperature: 0.2,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
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

export const PROVIDERS = { anthropic, gemini, nvidia };
export const DEFAULT_PROVIDER = "gemini";
