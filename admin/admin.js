import { api } from "./api.js";
import { aiSettingsView } from "./ai-settings.js";
import { answersView } from "./answers.js";
import { auditView, overviewView, teamView } from "./developer.js";
import { lawyerView } from "./lawyer.js";
import { aiView, usageView, usersView } from "./usage.js";
import { workView } from "./work.js";
import { el, ROLE } from "./util.js";

/**
 * Staff dashboard shell. Sign-in is done by Cloudflare Access before this page loads; the API
 * says who we are and which role we have, and we show only that role's sections. (The API
 * enforces the permissions; hiding a section here is just convenience.)
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

(async () => {
  let me;
  try {
    me = await api("/me");
  } catch {
    $("boot").textContent = "ما عندك صلاحية دخول. تواصلي مع المسؤول ليضيف بريدك.";
    return;
  }
  $("boot").hidden = true;
  $("shell").hidden = false;
  $("me-name").textContent = me.name || "مرحباً";
  $("me-mail").textContent = me.email;
  $("me-role").textContent = ROLE[me.role];

  const sections =
    me.role === "lawyer"
      ? [
          ["cases", "الحالات", lawyerView],
          ["work", "لوحة العمل", workView],
          ["answers", "مراجعة أجوبة الذكاء", answersView],
        ]
      : [
          ["overview", "نظرة عامة", overviewView],
          ["usage", "الزوّار والاستخدام", usageView],
          ["users", "المستخدمات", usersView],
          ["ai", "الذكاء الاصطناعي", aiView],
          ["answers", "مراجعة أجوبة الذكاء", answersView],
          ["ai-settings", "إعدادات الذكاء", aiSettingsView],
          ["team", "الفريق", teamView],
          ["audit", "سجل العمليات", auditView],
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
    const [, , build] = sections.find(([s]) => s === id);
    for (const b of $("nav").children) b.setAttribute("aria-current", b.dataset.id === id ? "page" : "false");
    active = build(ctx);
  }

  $("nav").replaceChildren(
    ...sections.map(([id, label]) => {
      const b = el("button", null, label);
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
  show(sections[0][0]);
})();
