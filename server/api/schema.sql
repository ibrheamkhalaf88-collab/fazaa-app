-- D1 schema. Apply with:  npx wrangler d1 execute sanad --file=schema.sql
-- Privacy: no IPs or user agents are stored. Message bodies and the user's name/phone are
-- encrypted by the Worker (AES-GCM) before they reach these tables. PINs are salted PBKDF2 hashes.

CREATE TABLE IF NOT EXISTS cases (
  id            TEXT PRIMARY KEY,
  token_hash    TEXT NOT NULL DEFAULT '',
  user_id       TEXT NOT NULL DEFAULT '',   -- the signed-in woman who asked
  topic         TEXT NOT NULL,
  region        TEXT NOT NULL,          -- ps-wb | ps-gaza
  status        TEXT NOT NULL DEFAULT 'open',   -- open | claimed | closed
  lawyer_email  TEXT,
  created_at    INTEGER NOT NULL,
  claimed_at    INTEGER,
  closed_at     INTEGER,
  last_activity INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status, created_at);
CREATE INDEX IF NOT EXISTS idx_cases_lawyer ON cases(lawyer_email, status);

CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id    TEXT NOT NULL,
  sender     TEXT NOT NULL,             -- user | lawyer
  iv         TEXT NOT NULL,
  body       TEXT NOT NULL,             -- encrypted
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_case ON messages(case_id, id);

CREATE TABLE IF NOT EXISTS staff (
  email      TEXT PRIMARY KEY,
  role       TEXT NOT NULL,             -- lawyer | developer
  name       TEXT NOT NULL DEFAULT '',  -- first name shown to the woman
  created_at INTEGER NOT NULL,
  code       TEXT NOT NULL DEFAULT '',  -- stable staff ID, e.g. S-007 (never reused)
  active     INTEGER NOT NULL DEFAULT 1 -- 0 = suspended: cannot sign in, history kept
);
-- Existing database? Run once:
--   ALTER TABLE staff ADD COLUMN code TEXT NOT NULL DEFAULT '';
--   ALTER TABLE staff ADD COLUMN active INTEGER NOT NULL DEFAULT 1;

-- Staff sign-in: email + password. Only a salted PBKDF2 hash is stored. 5 wrong passwords lock the
-- account for 15 minutes. must_change = 1 for a temporary password set by the owner (first login / reset).
CREATE TABLE IF NOT EXISTS staff_auth (
  email        TEXT PRIMARY KEY,
  pw_salt      TEXT NOT NULL,
  pw_hash      TEXT NOT NULL,
  must_change  INTEGER NOT NULL DEFAULT 1,
  fails        INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0,
  changed_at   INTEGER NOT NULL
);
-- Staff sessions: only the SHA-256 of the cookie token is stored.
CREATE TABLE IF NOT EXISTS staff_sessions (
  token_hash TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_staff_sessions_email ON staff_sessions(email);

-- A lawyer's private note on her own case (encrypted like messages; deleted with the case).
CREATE TABLE IF NOT EXISTS case_notes (
  case_id    TEXT PRIMARY KEY,
  iv         TEXT NOT NULL,
  body       TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Who did what, never what was said. For developers and accountability. Kept 90 days.
CREATE TABLE IF NOT EXISTS audit (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  at     INTEGER NOT NULL,
  actor  TEXT NOT NULL,
  action TEXT NOT NULL,   -- claim | close | staff-add | staff-remove | purge
  target TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit(at);

-- Anonymous per-day totals so the charts survive the deletion of old cases.
CREATE TABLE IF NOT EXISTS daily_counts (
  day           TEXT PRIMARY KEY,        -- YYYY-MM-DD (UTC)
  created       INTEGER NOT NULL DEFAULT 0,
  closed        INTEGER NOT NULL DEFAULT 0,
  claimed       INTEGER NOT NULL DEFAULT 0,
  claim_wait_ms INTEGER NOT NULL DEFAULT 0
);

-- Anonymous usage counters (no user id, no IP, no text). One row per day x event x region.
CREATE TABLE IF NOT EXISTS events_daily (
  day    TEXT NOT NULL,
  event  TEXT NOT NULL,
  region TEXT NOT NULL,         -- ps-wb | ps-gaza | none
  n      INTEGER NOT NULL DEFAULT 0,
  ms_sum INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, event, region)
);

-- Staff sign-in activity (staff only; women are never identified).
CREATE TABLE IF NOT EXISTS staff_seen (
  email      TEXT PRIMARY KEY,
  first_seen INTEGER NOT NULL,
  last_seen  INTEGER NOT NULL,
  sessions   INTEGER NOT NULL DEFAULT 1
);

-- Per-lawyer daily work counters (counts only).
CREATE TABLE IF NOT EXISTS lawyer_daily (
  day     TEXT NOT NULL,
  email   TEXT NOT NULL,
  claimed INTEGER NOT NULL DEFAULT 0,
  closed  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, email)
);

-- Women who asked for a lawyer: alias + PIN login. Name and phone are encrypted (AES-GCM) and
-- only the lawyer who claimed her case can read them. Deleted on request or after inactivity.
CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,
  username     TEXT NOT NULL UNIQUE,     -- alias, lower-case
  pin_salt     TEXT NOT NULL,
  pin_hash     TEXT NOT NULL,
  contact_iv   TEXT NOT NULL,
  contact_body TEXT NOT NULL,            -- encrypted {name, phone}
  region       TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  last_login   INTEGER,
  fails        INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,           -- SHA-256 of the session token
  user_id    TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_cases_user ON cases(user_id);

-- Developer-managed settings. The AI provider/model/key live here, encrypted (AES-GCM) with
-- MESSAGE_KEY. The key can be replaced or deleted from the dashboard but never read back.
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  iv         TEXT NOT NULL,
  body       TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL
);

-- AI answers kept for lawyer review and for improving the model. Only the ANSWER is stored: never the
-- question, never an account, IP or device. Personal details are scrubbed first. Deleted after 90 days.
CREATE TABLE IF NOT EXISTS ai_answers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  at          INTEGER NOT NULL,
  region      TEXT NOT NULL,
  provider    TEXT NOT NULL,
  model       TEXT NOT NULL,
  body        TEXT NOT NULL,            -- JSON {lead, steps, note, cites, sos, topic}
  verdict     TEXT,                     -- NULL (not reviewed) | 'good' | 'bad'
  reviewed_by TEXT,
  reviewed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_ai_answers_at ON ai_answers(at);
