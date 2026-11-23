import { FAMILY_GAZA_1954, FAMILY_GAZA_NAME } from "./family-rights-gaza-1954.js";
import { HANAFI_NAME, HANAFI_PERSONAL_STATUS } from "./hanafi-personal-status.js";
import { EXECUTION_NAME, SHARIA_EXECUTION_2021 } from "./sharia-execution-2021.js";
import { SHARIA_PROCEDURE_1965, SHARIA_PROCEDURE_NAME } from "./sharia-procedure-1965.js";

/**
 * BOX «gaza-sharia»: laws applied by the SHARIA courts in the GAZA STRIP. Region and court come from the box
 * (src/data/law/corpora.js), never from an entry. See src/data/law/index.js for the fields.
 * @type {import("../../index.js").LawEntry[]}
 */
export const LAWS = [
  {
    key: "family-gaza-1954",
    name: FAMILY_GAZA_NAME,
    prefix: "gz:",
    articles: FAMILY_GAZA_1954,
    hints: ["حقوق العائله", "العائله"],
    marks: ["1954", "حقوق العائله"],
    conflicts: [
      {
        with: "hanafi-personal-status",
        note: "إذا اختلف النصين، المحامية بتقدر تحكيلك أي واحد بتطبقه المحكمة.",
      },
    ],
    source: "PDF from the owner's lawyer, 2026-11-18 («قانون-حقوق-العائلة-معدل.pdf»)",
    scope: [
      "Applied by the sharia courts in the Gaza Strip.",
      "The PDF is titled «معدل» (amended) but has no amendment notes: a lawyer must confirm it is the current text.",
    ],
    review: { status: "pending", by: "", at: "" },
  },
  {
    key: "hanafi-personal-status",
    name: HANAFI_NAME,
    prefix: "hn:",
    articles: HANAFI_PERSONAL_STATUS,
    hints: ["الاحوال الشخصيه", "احوال شخصيه", "ابي حنيفه"],
    marks: [],
    source: "PDF from the owner's lawyer, 2026-11-18; transcribed from the page images (see the file header)",
    scope: [
      "The detailed personal-status rules (Hanafi school) applied by the sharia courts in Gaza.",
      "Where it and the 1954 family-rights law differ, which one the court applies is a question for the lawyer.",
      "Transcribed from images and checked three ways; the lawyer is reviewing it through the app (2026-11-19).",
    ],
    review: { status: "pending", by: "", at: "" },
  },
  {
    key: "sharia-procedure-1965",
    name: SHARIA_PROCEDURE_NAME,
    prefix: "sp:",
    articles: SHARIA_PROCEDURE_1965,
    hints: ["اصول المحاكمات", "المحاكمات الشرعيه"],
    marks: ["1965"],
    source: "PDF from the owner's lawyer, 2026-11-18; transcribed from the page images (see the file header)",
    scope: [
      "How a case is brought and decided in the sharia courts of Gaza (procedure, evidence, appeal).",
      "Transcribed from images and checked three ways; the lawyer is reviewing it through the app (2026-11-19).",
    ],
    review: { status: "pending", by: "", at: "" },
  },
  {
    key: "sharia-execution-2021",
    name: EXECUTION_NAME,
    prefix: "ex:",
    articles: SHARIA_EXECUTION_2021,
    hints: ["التنفيذ الشرعي", "قانون التنفيذ"],
    marks: [],
    source:
      "PDF from the owner's lawyer, 2026-11-18 (Palestinian Gazette no. 102); text transcribed from the page images",
    scope: [
      "Passed by the Legislative Council and issued in Gaza City (14/10/2021): applied by the sharia courts in Gaza.",
      "How a sharia judgment (maintenance, mahr, custody, visits) is enforced when the other side does not comply.",
    ],
    review: { status: "pending", by: "", at: "" },
  },
];
