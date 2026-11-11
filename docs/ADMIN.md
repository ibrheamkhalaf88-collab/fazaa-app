# Staff dashboard (lawyers + developers)

`/admin/` is a separate page for staff. Two roles only:

|                                                                      | Lawyer (`lawyer`)         | Developer (`developer`) |
| -------------------------------------------------------------------- | ------------------------- | ----------------------- |
| See the waiting queue (topic + region, **no message text**)          | yes                       | no                      |
| Claim a case, read and answer **her own** cases, close               | yes                       | **no**                  |
| System counts (open/claimed/closed, lawyers, messages, longest wait) | no                        | yes                     |
| Add/remove staff and set roles                                       | no                        | yes                     |
| Read any case content                                                | only the case she claimed | **read-only, audited**  |
| See her name and phone                                               | only the case she claimed | never                   |

Permissions are enforced in the API (`server/api/worker.js`), not by hiding buttons; `tests/api.test.js` proves each rule.

**Owner's decision (2026-11-11):** developers can read every conversation ("المحادثات" tab), read-only. Each time a
developer opens a conversation the audit log records it (`dev-read-case`), and the sign-up form in the app tells the
woman that Fazaa's technical team can read her messages. A lawyer should review this wording before launch.

**Sign-in (2026-11-11):** email + password, checked by the Worker (Cloudflare Access is no longer used). The owner adds a
member in "الفريق" and gets a temporary password once; the member must change it at first sign-in. "كلمة سر جديدة"
resets a forgotten one. Lockout: 5 wrong tries, 15 minutes. If every developer is locked out:
`node scripts/staff-password.mjs --email you@example.com` (writes a temporary password to a file on the Desktop).

## How it fits together

```
woman's phone (anonymous, token on device) --\
                                              +--> /api/*  Worker (server/api)  --> D1 database (encrypted bodies)
lawyer / developer --> Cloudflare Access login --> /admin/ + /api/v1/staff/*
```

- **Sign-in:** Cloudflare Access (free up to 50 users). Staff get an email one-time PIN. The Worker verifies the signed
  JWT; there are no passwords in our code or database.
- **Her privacy:** no name, phone, IP or user agent is stored. The case secret is random and only its hash is stored.
  Message bodies are encrypted (AES-GCM) with a Worker secret before they touch the database.
- **Retention (assumption, change if needed):** closed cases are deleted after 7 days; any case idle 30 days is deleted.
  Daily cron. Set `RETENTION_CLOSED_DAYS` / `RETENTION_IDLE_DAYS` in `server/api/wrangler.toml`.
- **Cost:** Workers + D1 + Access fit the free tiers at small scale; the paid Workers plan is about $5/month.

## What the dashboard gives each role

- **Lawyer:** waiting queue with calm urgency colours (green < 15 min, amber < 1 h, solid amber after), region filter,
  one-click "take the case", live conversation (auto-refresh, Enter to send), private notes (auto-saved), six editable
  quick replies, tab-title counter and an optional soft chime when a new case arrives, light/dark mode.
- **Developer:** overview (KPIs, 14-day chart, region and status split, retention policy), team management
  (add, change role, remove; cannot remove yourself), audit log (kept 90 days).
- Palette: sage-grey ground, warm-white cards, steel-blue primary, amber for "waiting", never red; dark mode for night shifts.

Upgrading an existing database: re-run `schema.sql` (it only creates what is missing).

## Run locally (no Cloudflare needed)

```bash
DEV_STAFF_EMAIL=dev@local SEED=1 node scripts/dev-server.mjs     # http://localhost:8787/admin/  (SEED=1 adds demo data)
```

Memory-only, signs you in as that email (add header `x-dev-staff` to act as another). **Never deploy this script.**

## Deploy

1. `cd server/api && npx wrangler d1 create fazaa`, put the returned id in `wrangler.toml`, then
   `npx wrangler d1 execute fazaa --remote --file=schema.sql`.
2. `openssl rand -base64 32 | npx wrangler secret put MESSAGE_KEY` (**back it up**: without it stored messages are unreadable).
3. Put the Worker on the same domain as the site: `routes = [{ pattern = "yourdomain/api/*", ... }]`.
   (Same origin keeps the app's CSP strict and lets Access cookies reach the API.)
4. Cloudflare Zero Trust -> Access -> Applications -> add **two** self-hosted apps on your domain:
   paths `/admin/*` and `/api/v1/staff/*`. Policy: allow emails you list. Copy the Application Audience (AUD) tag
   and your team domain into `ACCESS_AUD` / `ACCESS_TEAM_DOMAIN`.
5. Set `DEVELOPER_EMAILS` to your own email, `npx wrangler deploy`, open `/admin/`, add the lawyers' emails with role
   "محامية". Anyone not listed gets "no access".
6. Do NOT put `/api/v1/cases*` behind Access: that is the endpoint women use.

## Not connected yet

The women's lawyer chat inside the app is still the scripted demo (`src/features/chat/lawyer-session.js`).
The API for it exists (`POST /api/v1/cases`, `GET|POST /api/v1/cases/:id/messages` with `Authorization: Bearer <token>`).
Wiring it, plus a real lawyer-availability message, is the next step. Before launch: a legal review of what is stored,
a notice to women that a human reads their messages, and a written procedure for what lawyers do in an emergency.

## لوحات الإحصاءات (الزوّار والذكاء الاصطناعي ولوحة العمل)

| اللوحة             | مين بتشوفها | المصدر                                                                                                                       |
| ------------------ | ----------- | ---------------------------------------------------------------------------------------------------------------------------- |
| لوحة العمل (كبيرة) | المحامية    | `GET /v1/staff/work`: أرقام الفريق وأرقامها، الحالات يومياً، المنطقة، المواضيع، الزيارات                                     |
| الزوّار والاستخدام | المطوّر     | `GET /v1/staff/analytics?days=7..90`: زيارات جديدة/متكررة، تثبيتات، منطقة، ميزات، مواضيع، ومين سجّل دخول من الفريق           |
| الذكاء الاصطناعي   | المطوّر     | نفس المصدر: أسئلة يومية (ذكاء/قواعد/بدون جواب)، نسبة الأخطاء، متوسط الزمن                                                    |
| إعدادات الذكاء     | المطوّر     | اختيار المزوّد والنموذج ولصق مفتاح الـ API وتجربة الاتصال. المفتاح مشفّر ولا يظهر بعد الحفظ، وكل تعديل بيتسجّل بسجل العمليات |
| الفريق             | المطوّر     | أعمدة «آخر دخول» و«أيام الدخول»                                                                                              |

**خصوصية:** المستخدمات مجهولات. العدّادات مجمّعة (يوم × حدث × منطقة) بدون هوية ولا IP ولا نص. تسجيل الدخول المعروف هو للفريق فقط (عبر Cloudflare Access).
المنطقة = اللي اختارتها المستخدمة بالإعدادات، مش موقع جغرافي.

**تفعيلها:** العدّادات من التطبيق مطفية لحد ما تضبطي `TELEMETRY_ENDPOINT = "/api/v1/ping"` في `src/config.js` بعد نشر الـ API. المستخدمة تقدر تطفيها من الإعدادات («إحصاءات مجهولة»)، ولازم تظهر لها جملة توضيح. على قاعدة D1 موجودة شغّلي `schema.sql` مرة ثانية لإضافة الجداول الجديدة.

## حسابات المستخدمات (لطلب المحامية فقط)

- **بدون تسجيل:** الأسئلة والقوانين والطوارئ. **بتسجيل:** بس لما تطلب محامية.
- التسجيل: اسم مستعار + رمز 6 أرقام + اسم + رقم تواصل (إلزاميين) + المنطقة من إعداداتها.
- الرمز مخزّن كـ PBKDF2 مملّح. 5 محاولات غلط بتقفل الحساب 15 دقيقة. الجلسة 30 يوم على جهازها.
- الاسم والرقم مشفّرين (AES-GCM). **المحامية اللي تولّت الحالة فقط** بتشوفهم (`GET /v1/staff/cases/:id/client`) وكل فتح بيتسجّل في سجل العمليات («فتحت بيانات تواصل مستخدمة»). المطوّر ما بيشوفهم أبداً.
- لوحة «المستخدمات» للمطوّر: عدد الحسابات والنشطات والتسجيلات اليومية والمنطقة وآخر دخول، بدون أسماء ولا أرقام.
- الحذف: هي بتحذف حسابها من المحادثة («حذف حسابي»)، وبينحذف معه كل شي. وأي حساب بدون دخول 180 يوماً (`RETENTION_USER_DAYS`) بينحذف تلقائياً.
- **التفعيل:** في `src/config.js` اجعلي `API_BASE = "/api"` بعد نشر الـ API على نفس الدومين (فاضي = العرض التجريبي المكتوب سلفاً).
- **تنبيه:** رقم الهاتف الحقيقي بيخلّي الحساب أسهل للتتبّع لو انسرقت القاعدة أو المفتاح `MESSAGE_KEY`، ولو الجهاز مشترك فالرمز بيحمي المحادثات. لازم تظهر للمستخدمة جملة موافقة واضحة (موجودة بنموذج التسجيل)، ويُنصح بمراجعة قانونية لحماية البيانات.

## Staff IDs, suspension and the permissions table

- Every team member gets a stable ID (`S-001`, `S-002`, ...) when first added. It never changes and is never reused.
- **تعليق** suspends a member: they can no longer sign in, but their history stays. **تفعيل** restores them.
  Editing a member never re-activates a suspended one.
- You cannot suspend yourself or change your own role (so nobody locks themselves out).
- The "جدول الصلاحيات" under the team table is a read-only summary; the real rules are enforced on the server.
- Existing database? Run the two `ALTER TABLE staff` lines from `server/api/schema.sql` once.
