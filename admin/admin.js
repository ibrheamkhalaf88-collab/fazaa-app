import { api } from "./api.js";
import { aiSettingsView } from "./ai-settings.js";
import { contactsView } from "./contacts.js";
import { answersView } from "./answers.js";
import { auditView, healthView, overviewView, teamView } from "./developer.js";
import { conversationsView, lawyerView } from "./lawyer.js";
import { aiView, usageView, usersView } from "./usage.js";
import { workView } from "./work.js";
import { el, icon, initial, ROLE } from "./util.js";

/**
 * Staff dashboard shell. Staff sign in here with email + password; a temporary password must be
 * changed before anything else. The API says who we are and which role we have, and we show only
 * that role's sections. (The API enforces the permissions; hiding a section here is convenience.)
 * All text is inserted with textContent, never innerHTML.
 */
const $ = (id) => document.getElementById(id);
const store = {
  get: (k) => {
    try {
      return localStorage.getItem(`admin:${k}`);
    } catch {
      return null;
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(`admin:${k}`, v);
    } catch {
      /* private mode: preferences just don't persist */
    }
  },
};

/* ---------- theme: auto -> light -> dark ---------- */
const THEMES = [
  ["auto", "المظهر: تلقائي"],
  ["light", "المظهر: فاتح"],
  ["dark", "المظهر: داكن"],
];
function applyTheme(mode) {
  const dark = mode === "dark" || (mode === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  $("theme").textContent = THEMES.find(([m]) => m === mode)[1];
}
let themeMode = THEMES.some(([m]) => m === store.get("theme")) ? store.get("theme") : "auto";
$("theme").addEventListener("click", () => {
  themeMode = THEMES[(THEMES.findIndex(([m]) => m === themeMode) + 1) % THEMES.length][0];
  store.set("theme", themeMode);
  applyTheme(themeMode);
});
applyTheme(themeMode);

/* ---------- alerts for new waiting cases: tab title + optional soft chime ---------- */
const baseTitle = document.title;
let soundOn = store.get("sound") === "1";
function chime() {
  if (!soundOn) return;
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 660;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.65);
  } catch {
    /* audio blocked until the user interacts with the page */
  }
}
function setSoundLabel() {
  $("sound").textContent = soundOn ? "تنبيه صوتي: شغّال" : "تنبيه صوتي: مطفي";
  $("sound").setAttribute("aria-pressed", String(soundOn));
}
$("sound").addEventListener("click", () => {
  soundOn = !soundOn;
  store.set("sound", soundOn ? "1" : "0");
  setSoundLabel();
  chime();
});

/* ---------- shell ---------- */
const banner = (msg) => {
  $("banner").textContent = msg || "";
  $("banner").hidden = !msg;
};

/* ---------- sign-in, change password, sign-out ---------- */
const screens = ["boot", "login", "pw", "shell"];
const only = (id) => screens.forEach((s) => ($(s).hidden = s !== id));
const formError = (id, msg) => {
  $(id).textContent = msg || "";
  $(id).hidden = !msg;
};

const LOGIN_ERRORS = {
  401: "البريد أو كلمة السر غلط.",
  429: "محاولات غلط كتيرة. الحساب مقفول 15 دقيقة.",
};
$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  formError("login-error");
  try {
    await api("/login", {
      method: "POST",
      body: { email: $("login-email").value.trim(), password: $("login-password").value },
    });
    $("login-password").value = "";
    location.reload();
  } catch (err) {
    formError("login-error", LOGIN_ERRORS[err.status] || "في مشكلة بالاتصال. جرّبي كمان شوي.");
  }
});

const PW_ERRORS = {
  "wrong-password": "كلمة السر الحالية غلط.",
  "password-too-short": "كلمة السر الجديدة لازم تكون 10 أحرف على الأقل.",
  "password-too-long": "كلمة السر الجديدة طويلة كتير.",
  "password-too-simple": "كلمة السر الجديدة سهلة كتير. استعملي أحرف مختلفة.",
  "password-is-email": "ما بصير كلمة السر تكون نفس البريد.",
  "password-unchanged": "اختاري كلمة سر غير المؤقتة.",
};
function showPasswordForm(forced) {
  $("pw-why").textContent = forced
    ? "هاي كلمة سر مؤقتة. اختاري كلمة سر جديدة إلك لحالك قبل ما تكمّلي."
    : "بعد الحفظ بتنطلعي من كل الأجهزة التانية.";
  $("pw-cancel").hidden = forced;
  for (const id of ["pw-current", "pw-next", "pw-again"]) $(id).value = "";
  formError("pw-error");
  only("pw");
  $("pw-current").focus();
}
$("pw-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if ($("pw-next").value !== $("pw-again").value)
    return formError("pw-error", "الكلمتين الجديدتين مش متطابقتين.");
  try {
    await api("/password", {
      method: "POST",
      body: { current: $("pw-current").value, next: $("pw-next").value },
    });
    location.reload();
  } catch (err) {
    const { error } = err.body ? await err.body() : {};
    formError("pw-error", PW_ERRORS[error] || "ما زبط الحفظ. جرّبي كمان مرة.");
  }
});
$("pw-cancel").addEventListener("click", () => only("shell"));
$("change-pw").addEventListener("click", () => showPasswordForm(false));
$("logout").addEventListener("click", async () => {
  try {
    await api("/logout", { method: "POST" });
  } finally {
    location.reload();
  }
});

(async () => {
  let me;
  try {
    me = await api("/me");
  } catch (err) {
    if (err.status === 401) {
      only("login");
      $("login-email").focus();
    } else $("boot").textContent = "في مشكلة بالاتصال. حدّثي الصفحة كمان شوي.";
    return;
  }
  if (me.mustChange) return showPasswordForm(true);
  only("shell");
  $("me-name").textContent = me.name || me.email.split("@")[0];
  $("me-mail").textContent = me.email;
  $("me-role").textContent = ROLE[me.role];
  $("me-avatar").textContent = initial(me.name || me.email);

  // [id, label, view, icon, full-height page]
  const sections =
    me.role === "lawyer"
      ? [
          ["cases", "المحادثات", lawyerView, "chat", true],
          ["work", "لوحة العمل", workView, "chart"],
          ["answers", "مراجعة أجوبة الذكاء", answersView, "check"],
        ]
      : [
          ["overview", "نظرة عامة", overviewView, "chart"],
          ["conversations", "المحادثات", conversationsView, "chat", true],
          ["health", "حالة النظام", healthView, "pulse"],
          ["users", "المستخدمات", usersView, "users"],
          ["usage", "الزوّار والاستخدام", usageView, "list"],
          ["ai", "الذكاء الاصطناعي", aiView, "spark"],
          ["answers", "مراجعة أجوبة الذكاء", answersView, "check"],
          ["ai-settings", "إعدادات الذكاء", aiSettingsView, "gear"],
          ["contacts", "أرقام التواصل", contactsView, "list"],
          ["team", "الفريق", teamView, "team"],
          ["audit", "سجل العمليات", auditView, "inbox"],
        ];
  if (me.role === "lawyer") {
    $("sound").hidden = false;
    setSoundLabel();
  }

  let active = null;
  const ctx = {
    me,
    view: $("view"),
    banner,
    notify: {
      count: (n) => {
        document.title = n ? `(${n}) ${baseTitle}` : baseTitle;
        const badge = document.querySelector("#nav .badge");
        if (badge) {
          badge.textContent = String(n);
          badge.hidden = !n;
        }
      },
      ping: chime,
    },
  };

  function show(id) {
    active?.destroy();
    banner();
    const [, , build, , full] = sections.find(([s]) => s === id);
    $("main").classList.toggle("full", Boolean(full));
    for (const b of $("nav").children) b.setAttribute("aria-current", b.dataset.id === id ? "page" : "false");
    store.set("page", id);
    active = build(ctx);
  }

  $("nav").replaceChildren(
    ...sections.map(([id, label, , ic]) => {
      const b = el("button");
      b.type = "button";
      b.append(icon(ic), el("span", "label", label));
      b.dataset.id = id;
      if (id === "cases") b.append(Object.assign(el("span", "badge", "0"), { hidden: true }));
      b.addEventListener("click", () => show(id));
      return b;
    }),
  );
  // the badge only makes sense on the lawyer's case list
  if (me.role !== "lawyer")
    $("nav")
      .querySelectorAll(".badge")
      .forEach((n) => n.remove());
  const last = store.get("page");
  show(sections.some(([s]) => s === last) ? last : sections[0][0]);
})();
