/**
 * BOX «wb-nizami»: laws applied by the REGULAR (nizami) courts in the WEST BANK. EMPTY until the lawyer gives and
 * reviews the texts (expected: penal code 16/1960 and the regular-court laws with their West Bank amendments).
 *
 * Rules for this box (checked by tests/law-separation.test.js):
 *  - its own id prefixes, starting with "w" (e.g. "wpc:" for the penal code 1960), never one used in Gaza;
 *  - never import or re-export a Gaza file: a law that exists in both regions gets its own copy here;
 *  - `marks`: words or years that name this law and no Gaza law (e.g. "1960", "الاردني").
 * Steps: docs/LAW-INTAKE.md.
 * @type {import("../../index.js").LawEntry[]}
 */
export const LAWS = [];
