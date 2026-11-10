/**
 * Regenerates the PNG app icons from the SVG sources in scripts/icon-src/.
 * Needs Playwright (npm i): `node scripts/make-icons.mjs`
 *   favicon.svg  -> rounded icon  (192, 512)
 *   maskable.svg -> full-bleed icon for Android masks (512) and the iOS home-screen icon (180)
 */
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const src = (name) => readFileSync(new URL(`./icon-src/${name}`, import.meta.url), "utf8");
const out = (name) => new URL(`../assets/icons/${name}`, import.meta.url).pathname;

const JOBS = [
  ["favicon.svg", "icon-192.png", 192],
  ["favicon.svg", "icon-512.png", 512],
  ["maskable.svg", "icon-maskable-512.png", 512],
  ["maskable.svg", "apple-touch-icon.png", 180],
];

const browser = await chromium.launch();
for (const [source, file, size] of JOBS) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const svg = src(source).replace("<svg ", `<svg width="${size}" height="${size}" `);
  await page.setContent(`<body style="margin:0;background:transparent">${svg}</body>`);
  await page.screenshot({ path: out(file), omitBackground: true });
  await page.close();
}
await browser.close();
console.log("icons written to assets/icons/");
