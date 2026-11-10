/**
 * Remove anything that could identify a person from text we keep (AI answers kept for review).
 * The answer is generated from law articles and normally holds no personal data, but a model can
 * echo what it was told, so contact details, links and account names are blanked before storing.
 */
const ARABIC_DIGITS = /[٠-٩]/g;
const toLatinDigits = (s) => s.replace(ARABIC_DIGITS, (d) => String(d.charCodeAt(0) - 0x660));

export function scrub(text) {
  return toLatinDigits(String(text ?? ""))
    .replace(/https?:\/\/\S+|www\.\S+/gi, "[رابط]")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[بريد]")
    .replace(/@[\w.]{2,}/g, "[حساب]")
    .replace(/\+?\d[\d\s().-]{5,}\d/g, "[رقم]");
}
