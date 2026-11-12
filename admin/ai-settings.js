import { api, errorText } from "./api.js";
import { dateTime, el, pill } from "./util.js";

const SOURCE = {
  dashboard: ["good", "محفوظ من هون"],
  secret: ["", "من إعدادات الخادم"],
  none: ["wait", "غير مفعّل"],
};
/** Short reasons from the provider, in plain words. */
const KEY_PROBLEM = {
  "no-key": "ما في مفتاح محفوظ.",
  API_KEY_INVALID: "المفتاح مش صحيح (ممكن انحذف أو انسخ ناقص).",
  CONSUMER_SUSPENDED: "مشروع Google تبع المفتاح موقوف. اعملي مفتاح بمشروع جديد.",
  PERMISSION_DENIED: "المفتاح ما إله صلاحية على Gemini.",
  unreachable: "ما قدرنا نوصل للمزوّد. جرّبي كمان شوي.",
};
const MODEL_PROBLEM = (error = "", secs = "") => {
  if (/503|429|500|504/.test(error)) return `مضغوط هلأ · ${secs} ث`;
  if (/404/.test(error)) return "مش متاح لهالمفتاح";
  if (/unreachable/.test(error)) return `بطيء (أكتر من 20 ث)`;
  if (/no-tool-output|invalid-output/.test(error)) return "ردّ بس الجواب ما زبط";
  return error || "ما اشتغل";
};

const PROBLEM = {
  "bad-key": "المفتاح شكله غير صحيح. انسخيه كامل بدون مسافات.",
  "key-required": "ألصقي المفتاح أول مرة، أو لما تغيّري المزوّد.",
  "bad-model": "اسم النموذج فيه رموز غير مسموحة.",
  "bad-provider": "مزوّد غير معروف.",
};

/**
 * Developer-only page: choose the AI provider and model, and paste the API key.
 * The key is write-only: the server never sends it back, only its last 4 characters.
 * Text is inserted with textContent; the key field is cleared as soon as it is saved.
 */
export function aiSettingsView(ctx) {
  const body = el("div");
  ctx.view.replaceChildren(body);

  async function load() {
    try {
      render(await api("/ai-config"));
    } catch (e) {
      ctx.banner(errorText(e));
    }
  }

  function render(cfg) {
    ctx.banner();
    const head = el("div", "page-head");
    head.append(
      el("h1", null, "إعدادات الذكاء الاصطناعي"),
      el("span", "muted", "المفتاح بينحفظ مشفّراً ولا بيظهر لأي حدا بعد الحفظ"),
    );

    const [cls, label] = SOURCE[cfg.source];
    const status = el("p", "ai-status");
    status.append(pill(label, cls));
    if (cfg.hasKey) status.append(el("span", "muted", ` المفتاح الحالي: ${cfg.keyHint}`));
    if (cfg.updatedAt)
      status.append(el("span", "muted", ` · آخر تعديل ${dateTime(cfg.updatedAt)} (${cfg.updatedBy})`));

    status.append(el("span", "muted", ` · استهلاك اليوم: ${cfg.usedToday ?? 0} من ${cfg.dailyLimit ?? "—"}`));

    const provider = el("select");
    provider.id = "ai-provider";
    for (const p of cfg.providers) provider.append(new Option(p.label, p.id));
    provider.value = cfg.provider;

    const model = el("input");
    model.id = "ai-model";
    model.dir = "ltr";
    model.autocomplete = "off";
    const syncModel = () => {
      const p = cfg.providers.find((x) => x.id === provider.value);
      model.placeholder = `${p.defaultModel} (الافتراضي، الأخف والأرخص)`;
    };
    model.value = cfg.model;
    syncModel();
    provider.addEventListener("change", syncModel);

    // backup model: tried when the main one is busy (free tiers are often overloaded)
    const fallback = el("input");
    fallback.id = "ai-fallback";
    fallback.dir = "ltr";
    fallback.autocomplete = "off";
    fallback.value = cfg.fallbackModel || "";
    fallback.placeholder = "اختياري: نموذج بيتجرّب لما الأساسي يكون مضغوط";

    // the models this key can use, as suggestions for both fields
    const list = el("datalist");
    list.id = "ai-model-list";
    model.setAttribute("list", list.id);
    fallback.setAttribute("list", list.id);

    const key = el("input");
    key.id = "ai-key";
    key.type = "password";
    key.dir = "ltr";
    key.autocomplete = "new-password";
    key.spellcheck = false;
    key.placeholder = cfg.hasKey ? "اتركيه فاضي لتبقي المفتاح الحالي" : "ألصقي المفتاح هون";

    const field = (title, input) => {
      const label = el("label", "field");
      label.append(el("span", null, title), input);
      return label;
    };

    const note = el("p", "hint");
    const setNote = (text, bad = false) => {
      note.textContent = text;
      note.classList.toggle("bad", bad);
    };

    const save = el("button", "primary", "حفظ");
    save.addEventListener("click", async () => {
      save.disabled = true;
      try {
        const next = await api("/ai-config", {
          method: "PUT",
          body: {
            provider: provider.value,
            model: model.value,
            fallbackModel: fallback.value,
            apiKey: key.value,
          },
        });
        key.value = ""; // the key leaves the page as soon as it is saved
        render(next);
        setNote("انحفظ. جرّبي الاتصال للتأكد.");
      } catch (e) {
        setNote(await problemText(e), true);
      } finally {
        save.disabled = false;
      }
    });

    const test = el("button", "ghost", "جرّبي الاتصال");
    test.addEventListener("click", async () => {
      test.disabled = true;
      setNote("عم نجرّب…");
      try {
        const r = await api("/ai-config/test", { method: "POST" });
        setNote(
          r.ok
            ? `اشتغل. الجواب وصل خلال ${(r.ms / 1000).toFixed(1)} ثانية.`
            : `ما اشتغل (${r.error}). تأكدي من المفتاح والنموذج.`,
          !r.ok,
        );
      } catch (e) {
        setNote(errorText(e), true);
      } finally {
        test.disabled = false;
      }
    });

    const actions = el("div", "ai-actions");
    actions.append(save, test);
    if (cfg.source === "dashboard") {
      const clear = el("button", "ghost", "حذف المفتاح");
      clear.addEventListener("click", async () => {
        if (!confirm("بدك تحذفي المفتاح المحفوظ؟ الذكاء الاصطناعي رح يوقف لحد ما تضيفي مفتاح جديد.")) return;
        try {
          render(await api("/ai-config", { method: "DELETE" }));
        } catch (e) {
          setNote(errorText(e), true);
        }
      });
      actions.append(clear);
    }

    /* ---- check the key and try every model, one by one ---- */
    const checkBox = el("section", "card");
    const keyState = el("p", "ai-status");
    const table = el("div", "model-table");
    const checkKey = el("button", "ghost", "افحصي المفتاح وشو النماذج المتاحة");
    const tryAll = el("button", "ghost", "جرّبي النماذج وحدة وحدة");
    tryAll.disabled = true;
    let available = [];

    checkKey.addEventListener("click", async () => {
      checkKey.disabled = true;
      keyState.replaceChildren(el("span", "muted", "عم نفحص…"));
      try {
        const r = await api("/ai-models");
        if (!r.ok) {
          keyState.replaceChildren(
            pill("في مشكلة بالمفتاح", "wait"),
            el("span", "muted", ` ${KEY_PROBLEM[r.error] || r.error}`),
          );
          return;
        }
        available = r.models;
        list.replaceChildren(...available.map((m) => new Option(m.label || m.id, m.id)));
        keyState.replaceChildren(
          pill("المفتاح شغّال", "good"),
          el(
            "span",
            "muted",
            available.length
              ? ` · ${available.length} نموذج متاح. اختاري من القائمة بخانة النموذج، أو جرّبيهم تحت.`
              : " · هالمزوّد ما بيعطي قائمة نماذج، اكتبي اسم النموذج بإيدك.",
          ),
        );
        tryAll.disabled = !available.length;
      } catch (e) {
        keyState.replaceChildren(pill(errorText(e), "wait"));
      } finally {
        checkKey.disabled = false;
      }
    });

    tryAll.addEventListener("click", async () => {
      // the cheap, fast families first; at most 8 so the free quota is not burnt
      const rank = (id) => (/lite/.test(id) ? 0 : /flash/.test(id) ? 1 : 2);
      const picks = available
        .map((m) => m.id)
        .filter((id) => /flash/.test(id))
        .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
        .slice(0, 8);
      if (!confirm(`رح نجرّب ${picks.length} نماذج بسؤال تجربة لكل واحد (من الحد المجاني). نكمّل؟`)) return;
      tryAll.disabled = true;
      table.replaceChildren();
      for (const id of picks) {
        const row = el("div", "model-row");
        const verdict = el("span", "muted", "عم نجرّب…");
        const useMain = el("button", "ghost", "خليه الأساسي");
        const useBackup = el("button", "ghost", "خليه الاحتياطي");
        useMain.addEventListener("click", () => {
          model.value = id;
          setNote(`«${id}» صار بخانة النموذج. اضغطي «حفظ».`);
        });
        useBackup.addEventListener("click", () => {
          fallback.value = id;
          setNote(`«${id}» صار بخانة الاحتياطي. اضغطي «حفظ».`);
        });
        useMain.hidden = useBackup.hidden = true;
        row.append(el("code", null, id), verdict, useMain, useBackup);
        table.append(row);
        try {
          const r = await api("/ai-config/test", { method: "POST", body: { model: id } });
          const secs = (r.ms / 1000).toFixed(1);
          verdict.replaceChildren(
            r.ok ? pill(`شغّال · ${secs} ث`, "good") : pill(MODEL_PROBLEM(r.error, secs), "wait"),
          );
          useMain.hidden = useBackup.hidden = !r.ok;
        } catch (e) {
          verdict.replaceChildren(pill(errorText(e), "wait"));
        }
        await new Promise((resolve) => setTimeout(resolve, 2500)); // be gentle with the quota
      }
      tryAll.disabled = false;
    });

    const checkActs = el("div", "ai-actions");
    checkActs.append(checkKey, tryAll);
    checkBox.append(
      el("h2", null, "فحص المفتاح والنماذج"),
      el(
        "p",
        "hint",
        "بنسأل المزوّد بالمفتاح المحفوظ شو النماذج المتاحة، وبنجرّب كل واحد بسؤال واحد. «مضغوط» يعني المزوّد مشغول هلأ (بيصير كتير بالنسخة المجانية)، جرّبي بعد شوي.",
      ),
      keyState,
      checkActs,
      table,
    );

    const form = el("section", "card");
    form.append(
      status,
      field("المزوّد", provider),
      field("النموذج الأساسي (اختياري)", model),
      field("النموذج الاحتياطي", fallback),
      list,
      field("مفتاح الـ API", key),
      actions,
      note,
      el(
        "p",
        "hint",
        "الذكاء بيجاوب بس من المواد القانونية الموجودة بالتطبيق، وأي جواب فيه استشهاد غير موجود بيتحذف. النسخ المجانية عند بعض المزوّدين ممكن تستخدم النصوص المرسلة لتحسين منتجاتهم.",
      ),
    );
    body.replaceChildren(head, form, checkBox);
  }

  async function problemText(e) {
    return PROBLEM[(await e.body?.())?.error] || errorText(e);
  }

  load();
  return { destroy() {} };
}
