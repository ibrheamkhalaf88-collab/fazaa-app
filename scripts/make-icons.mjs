/**
 * Regenerates the app icons from the logo image in scripts/icon-src/logo.png.
 * Needs Playwright (npm i): `node scripts/make-icons.mjs`
 *   rounded white tile -> icon-192.png, icon-512.png, favicon.svg (logo embedded)
 *   full-bleed white   -> icon-maskable-512.png (logo inside the Android safe zone), apple-touch-icon.png
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const logo =
  "data:image/png;base64," + readFileSync(new URL("./icon-src/logo.png", import.meta.url)).toString("base64");
const out = (name) => fileURLToPath(new URL(`../assets/icons/${name}`, import.meta.url));

// rounded: corner radius as a share of the size; pad: empty margin around the logo as a share of the size
const svg = (rounded, pad) => {
  const inner = 512 * (1 - 2 * pad);
  const off = 512 * pad;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${rounded ? 112 : 0}" fill="#FFFFFF"/>
  <image href="${logo}" x="${off}" y="${off}" width="${inner}" height="${inner}"/>
</svg>
`;
};

const TILE = svg(true, 0.08);
const MASK = svg(false, 0.16);

const JOBS = [
  [TILE, "icon-192.png", 192],
  [TILE, "icon-512.png", 512],
  [MASK, "icon-maskable-512.png", 512],
  [MASK, "apple-touch-icon.png", 180],
];

const browser = await chromium.launch();
for (const [source, file, size] of JOBS) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(
    `<body style="margin:0;background:transparent">${source.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body>`,
  );
  await page.waitForFunction(() => document.querySelector("image") !== null);
  await page.screenshot({ path: out(file), omitBackground: true });
  await page.close();
}
await browser.close();
writeFileSync(out("favicon.svg"), TILE);
console.log("icons written to assets/icons/");
