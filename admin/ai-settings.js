import { api, errorText } from "./api.js";
import { dateTime, el, pill } from "./util.js";

const SOURCE = {
  dashboard: ["good", "محفوظ من هون"],
  secret: ["", "من إعدادات الخادم"],
  none: ["wait", "غير مفعّل"],
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
          body: { provider: provider.value, model: model.value, apiKey: key.value },
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

    const form = el("section", "card");
    form.append(
      status,
      field("المزوّد", provider),
      field("النموذج (اختياري)", model),
      field("مفتاح الـ API", key),
      actions,
      note,
      el(
        "p",
        "hint",
        "الذكاء بيجاوب بس من المواد القانونية الموجودة بالتطبيق، وأي جواب فيه استشهاد غير موجود بيتحذف. النسخ المجانية عند بعض المزوّدين ممكن تستخدم النصوص المرسلة لتحسين منتجاتهم.",
      ),
    );
    body.replaceChildren(head, form);
  }

  async function problemText(e) {
    return PROBLEM[(await e.body?.())?.error] || errorText(e);
  }

  load();
  return { destroy() {} };
}
