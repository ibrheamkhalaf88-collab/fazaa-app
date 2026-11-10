// Give a team member (normally the owner) a TEMPORARY dashboard password, straight in the database.
// Use it for the very first developer, or if every developer is locked out. Everyone else is managed
// from the dashboard (Team tab).
//
//   node scripts/staff-password.mjs --email you@example.com            (live database)
//   node scripts/staff-password.mjs --email you@example.com --local    (local wrangler database)
//
// The password is NOT printed: it is written to a file on your Desktop. Sign in, change it, then
// delete the file. The member's role is set to developer only if they are not on the team yet.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tempPassword } from "../server/api/auth.js";
import { hashPin, newSalt } from "../server/api/crypto.js";

const args = process.argv.slice(2);
const email = (args[args.indexOf("--email") + 1] || "").trim().toLowerCase();
if (!args.includes("--email") || !/^[^@\s'"]+@[^@\s'"]+\.[^@\s'"]+$/.test(email)) {
  console.error("Usage: node scripts/staff-password.mjs --email you@example.com [--local]");
  process.exit(1);
}

const password = tempPassword();
const salt = newSalt();
const hash = await hashPin(password, salt);
const now = Date.now();

// base64 and a validated email only: nothing here can break out of the SQL strings
const sql = `
INSERT INTO staff (email, role, name, created_at, code)
  SELECT '${email}', 'developer', '', ${now},
         'S-' || printf('%03d', COALESCE(MAX(CAST(SUBSTR(code, 3) AS INTEGER)), 0) + 1)
  FROM staff WHERE code LIKE 'S-%'
  ON CONFLICT(email) DO UPDATE SET active = 1;
INSERT INTO staff_auth (email, pw_salt, pw_hash, must_change, fails, locked_until, changed_at)
  VALUES ('${email}', '${salt}', '${hash}', 1, 0, 0, ${now})
  ON CONFLICT(email) DO UPDATE SET pw_salt = excluded.pw_salt, pw_hash = excluded.pw_hash,
    must_change = 1, fails = 0, locked_until = 0, changed_at = excluded.changed_at;
DELETE FROM staff_sessions WHERE email = '${email}';
INSERT INTO audit (at, actor, action, target) VALUES (${now}, 'script', 'staff-password-reset', '${email}');
`;

const dir = mkdtempSync(join(tmpdir(), "fazaa-"));
const file = join(dir, "set-password.sql");
writeFileSync(file, sql);
const apiDir = join(dirname(fileURLToPath(import.meta.url)), "..", "server", "api");
const run = spawnSync(
  "npx",
  ["wrangler", "d1", "execute", "sanad", args.includes("--local") ? "--local" : "--remote", "--yes", `--file=${file}`],
  { cwd: apiDir, stdio: ["ignore", "ignore", "inherit"], shell: process.platform === "win32" },
);
rmSync(dir, { recursive: true, force: true });
if (run.status !== 0) {
  console.error("The database update failed (see above). Nothing was changed.");
  process.exit(1);
}

const out = join(homedir(), "Desktop", "FAZAA-ADMIN-TEMP-PASSWORD.txt");
writeFileSync(
  out,
  `Fazaa dashboard\r\nEmail: ${email}\r\nTemporary password: ${password}\r\n\r\n` +
    "Sign in, choose your own password (the dashboard asks you to), then DELETE this file.\r\n",
);
console.log(`Done. The temporary password for ${email} is in: ${out}`);
