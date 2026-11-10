// Compares every maqam-sourced article in the corpus with the live page.
// Run on a machine with internet access:  npm run law:verify
// A mismatch means the retyped text differs from the source: fix the corpus, then update the fingerprint.
import { ARTICLES } from "../src/data/law/index.js";

const strip = (s) =>
  s
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");

// Remove diacritics, tatweel, zero-width marks and all whitespace so layout never causes false alarms.
export const normalize = (s) =>
  s
    .replace(/[\u064B-\u065F\u0670\u0640\u200B-\u200F\u202A-\u202E]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/\s+/g, "");

export function appearsIn(articleText, pageHtml) {
  return normalize(strip(pageHtml)).includes(normalize(articleText));
}

async function main() {
  let bad = 0;
  for (const a of Object.values(ARTICLES)) {
    if (!a.url.includes("maqam.najah.edu")) {
      console.log(`skip ${a.id} (not on maqam: check by hand)`);
      continue;
    }
    const res = await fetch(a.url);
    if (!res.ok) {
      console.log(`ERR  ${a.id} HTTP ${res.status}`);
      bad++;
      continue;
    }
    const ok = appearsIn(a.text, await res.text());
    console.log(`${ok ? "ok  " : "DIFF"} ${a.id}`);
    if (!ok) bad++;
  }
  process.exit(bad ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
