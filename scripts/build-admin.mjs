// Builds server/api/public/: the public app AND the staff dashboard, served by the `fazaa` Worker on ONE
// origin (https://fazaa.<subdomain>.workers.dev): the app at /, the dashboard at /admin/, the API at /api/.
// One origin keeps the CSP strict (connect-src 'self') and the staff cookie simple.
// Run automatically by deploy-fazaa.ps1; or by hand:  node scripts/build-admin.mjs
import { cpSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "server", "api", "public");

rmSync(out, { recursive: true, force: true });
// the app (same files as the sw.js precache list) + its security headers, which also cover /admin/*
for (const f of ["index.html", "sw.js", "manifest.webmanifest", "_headers"]) cpSync(join(root, f), join(out, f));
for (const d of ["src", "styles", "assets"]) cpSync(join(root, d), join(out, d), { recursive: true });
// the staff dashboard (it uses ../src/core/dom.js and ../styles/fonts.css from the app)
cpSync(join(root, "admin"), join(out, "admin"), { recursive: true });
console.log("App + dashboard copied to", out);
