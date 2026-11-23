/**
 * BOX «wb-sharia»: laws applied by the SHARIA courts in the WEST BANK. EMPTY until the lawyer gives and reviews
 * the texts (expected: personal status 61/1976, sharia procedure 31/1959, and their amendments).
 *
 * Rules for this box (checked by tests/law-separation.test.js):
 *  - its own id prefixes, starting with "w" (e.g. "wps:" for personal status 1976), never one used in Gaza;
 *  - never import or re-export a Gaza file: a law that exists in both regions gets its own copy here;
 *  - `marks`: words or years that name this law and no Gaza law (e.g. "1976"), so a Gaza reply that names it
 *    is rejected.
 * Steps: docs/LAW-INTAKE.md.
 * @type {import("../../index.js").LawEntry[]}
 */
export const LAWS = [];
