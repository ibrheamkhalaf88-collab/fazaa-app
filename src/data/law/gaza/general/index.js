import { MAJALLA_CLAIMS, MAJALLA_NAME } from "./majalla-claims.js";

/**
 * BOX «gaza-general»: general rules in the GAZA STRIP that are not tied to one court, so replies name no court
 * for them. Region comes from the box (src/data/law/corpora.js). See src/data/law/index.js for the fields.
 * @type {import("../../index.js").LawEntry[]}
 */
export const LAWS = [
  {
    key: "majalla-claims",
    name: MAJALLA_NAME,
    prefix: "mj:",
    articles: MAJALLA_CLAIMS,
    hints: ["المجله", "مجله الاحكام"],
    marks: [],
    source: "maqam.najah.edu/legislation/158, checked against the lawyer's PDF (2026-11-18)",
    scope: [
      "Book 14 (claims, articles 1616-1770) only: the lawyer's file holds this book.",
      "maqam lists the Majalla as in force in the West Bank and Gaza; kept in the Gaza box only. A West Bank copy, if the lawyer wants one, goes in its own box with its own prefix.",
      "Whether Gaza's civil law 4/2012 replaced the Majalla in Gaza is a question for the lawyer (2026-11-20).",
    ],
    review: { status: "pending", by: "", at: "" },
  },
];
