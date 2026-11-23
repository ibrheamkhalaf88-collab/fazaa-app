/**
 * The law CORPORA: one box per (region, court). Every law lives in exactly one box, and the box (not the law)
 * decides where it applies and which court applies it. Gaza and the West Bank apply different laws, and the
 * sharia and regular (nizami) courts apply different laws, so nothing is ever shared between boxes: a law that
 * exists in both regions (e.g. a 2001 procedure law with different amendments in each) gets one copy per box,
 * each with its own id prefix and its own lawyer review.
 *
 * Folder = box: src/data/law/<folder>/index.js lists that box's laws. tests/law-separation.test.js checks that
 * every law sits in the box its folder says, that ids never collide, and that no region or court sees another
 * box's texts.
 *
 * status:
 *   "active"          texts are in the app and reach users of that region
 *   "awaiting-texts"  the box is ready but empty: the lawyer's files have not arrived or are not reviewed yet
 *
 * Opening the West Bank to users is a separate, product-level switch (src/core/state.js country, the AI
 * proxy's COUNTRIES): filling a West Bank box does not by itself show its texts to anyone.
 *
 * @typedef {import("./types.js").Region} Region
 * @typedef {import("./types.js").Court} Court
 * @typedef {{key:string, region:Region, court:Court, folder:string, status:"active"|"awaiting-texts",
 *            label:string, note:string}} Corpus
 */

/** @type {Corpus[]} */
export const CORPORA = [
  {
    key: "gaza-sharia",
    region: "ps-gaza",
    court: "sharia",
    folder: "gaza/sharia",
    status: "active",
    label: "قطاع غزة: المحاكم الشرعية",
    note: "The lawyer's files of 2026-11-18 (family rights 1954, Hanafi personal status, sharia procedure 1965, sharia execution 6/2021).",
  },
  {
    key: "gaza-nizami",
    region: "ps-gaza",
    court: "nizami",
    folder: "gaza/nizami",
    status: "active",
    note: "The cyber-crimes decree-law, the penal code 74/1936 with its amendments to 1984, and criminal procedure 3/2001 (2026-11-23). The other regular-court laws wait for the lawyer's review (Desktop folder «نظامي», 2026-11-20).",
    label: "قطاع غزة: المحاكم النظامية",
  },
  {
    key: "gaza-general",
    region: "ps-gaza",
    court: "general",
    folder: "gaza/general",
    status: "active",
    label: "قطاع غزة: قواعد عامة",
    note: "General rules not tied to one court (Majalla, book 14). Whether Gaza's civil law 4/2012 replaced the Majalla is a question for the lawyer.",
  },
  {
    key: "wb-sharia",
    region: "ps-wb",
    court: "sharia",
    folder: "wb/sharia",
    status: "awaiting-texts",
    label: "الضفة الغربية: المحاكم الشرعية",
    note: "Empty until the lawyer gives and reviews the West Bank sharia texts (personal status 61/1976, sharia procedure 31/1959, ...).",
  },
  {
    key: "wb-nizami",
    region: "ps-wb",
    court: "nizami",
    folder: "wb/nizami",
    status: "awaiting-texts",
    label: "الضفة الغربية: المحاكم النظامية",
    note: "Empty until the lawyer gives and reviews the West Bank regular-court texts (penal code 16/1960, ...).",
  },
];

/** @param {string} key */
export const corpusByKey = (key) => CORPORA.find((c) => c.key === key);

/** The boxes of one region that hold texts the app may use. @param {string} region */
export const activeCorpora = (region) => CORPORA.filter((c) => c.region === region && c.status === "active");
