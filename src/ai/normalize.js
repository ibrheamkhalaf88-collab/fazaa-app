/**
 * Arabic text normalisation shared by intent detection (browser) and retrieval (server).
 * Removes diacritics and tatweel, unifies alef / ya / ta-marbuta forms, so that
 * "إباحية" and "اباحيه" compare equal.
 */
export function normalize(text) {
  return text
    .replace(/[ً-ْـ]/g, "") // harakat + tatweel
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه");
}

/** Split into word tokens: Arabic letters and digits only. */
export function tokenize(text) {
  return normalize(text)
    .split(/[^ء-ي0-9٠-٩]+/)
    .filter(Boolean);
}
