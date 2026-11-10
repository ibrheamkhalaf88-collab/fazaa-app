// Copies the staff dashboard into server/api/public/ so the API Worker can serve it
// on the SAME origin as /api (needed for Cloudflare Access and a strict CSP).
// Run automatically by deploy-sanad.ps1; or by hand:  node scripts/build-admin.mjs
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "server", "api", "public");

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "src", "core"), { recursive: true });
cpSync(join(root, "admin"), join(out, "admin"), { recursive: true });
cpSync(join(root, "src", "core", "dom.js"), join(out, "src", "core", "dom.js")); // the only shared module

writeFileSync(
  join(out, "_headers"),
  `/*
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
  Referrer-Policy: no-referrer
  X-Content-Type-Options: nosniff
  Cache-Control: no-store
  X-Robots-Tag: noindex, nofollow
`,
);
console.log("Dashboard copied to", out);
