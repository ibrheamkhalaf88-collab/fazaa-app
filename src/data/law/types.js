/**
 * Shapes shared by every law file in src/data/law.
 *
 * @typedef {{id:string, number?:string, topic:string, url:string, amended:string, text:string,
 *            keywords?:string}} Article
 *   `amended` is empty when the text is the original; otherwise it names the law that gave this wording.
 *   Always store the LATEST text in force, never an older wording.
 *
 * @typedef {"ps-wb" | "ps-gaza"} Region
 * @typedef {"sharia" | "nizami" | "general"} Court  sharia = المحاكم الشرعية (family matters), nizami = المحاكم النظامية,
 *   general = general rules not tied to one court (Majalla)
 */

export {};
