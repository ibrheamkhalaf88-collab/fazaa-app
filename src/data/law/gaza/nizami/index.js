import { CYBER_CRIMES, CYBER_NAME } from "./cyber-crimes-2018.js";
import { PENAL_CODE, PENAL_CODE_NAME } from "./penal-code-1936.js";
import { CRIMINAL_PROCEDURE, CRIMINAL_PROCEDURE_NAME } from "./criminal-procedure-2001.js";

/**
 * BOX «gaza-nizami»: laws applied by the REGULAR (nizami) courts and the public prosecution in the GAZA STRIP.
 * Region and court come from the box (src/data/law/corpora.js). See src/data/law/index.js for the fields.
 *
 * Penal code 74/1936 with the amendments in the lawyer's file (to 1984), and criminal procedure 3/2001, added
 * 2026-11-23. Waiting for the lawyer (Desktop folder «فزعة - مراجعة قانونية/نظامي», 2026-11-20): later Gaza
 * amendments to those two (if any), civil procedure 2/2001, execution 23/2005, evidence 4/2001, child
 * law 7/2004, and any law the Gaza Legislative Council passed after 2007. Ramallah decree-laws issued after 2007
 * go in only if the lawyer confirms the Gaza courts apply them, each with a caveat until then.
 * @type {import("../../index.js").LawEntry[]}
 */
export const LAWS = [
  {
    key: "cyber-2018",
    name: CYBER_NAME,
    prefix: "cy:",
    articles: CYBER_CRIMES,
    hints: ["الجرائم الالكترونيه", "الكترونيه", "الكتروني", "ابتزاز"],
    marks: [],
    caveat: "انتبهي: تطبيق قانون الجرائم الإلكترونية بغزة مش مؤكد، فاسألي محامية قبل ما تعتمدي عليه.",
    source: "PDFs from the owner's lawyer, 2026-11-18 (decree-law 10/2018 and decree-law 38/2021)",
    scope: [
      "Decree-law issued in Ramallah: whether the courts in Gaza apply it is NOT confirmed (question for the lawyer).",
      "Stored as amended by decree-law 38/2021 (new articles 31-50, renumbering of 31-57).",
      "Article 15 is the 2018 wording from the lawyer's file; a later amendment (decree-law 28/2020) is not in the lawyer's files.",
    ],
    review: { status: "pending", by: "", at: "" },
  },
  {
    key: "penal-code-1936",
    name: PENAL_CODE_NAME,
    prefix: "pc:",
    articles: PENAL_CODE,
    hints: ["قانون العقوبات", "العقوبات"],
    marks: [],
    caveat: "الغرامات بهالقانون مكتوبة بالجنيه الفلسطيني القديم، فاسألي محامية عن قيمتها اليوم.",
    source:
      "PDF approved by the owner's lawyer, 2026-11-23 (penal code 74/1936 and the amending laws in its appendix)",
    scope: [
      "The 1936 text with the amendments printed in the lawyer's file: Mandate laws 1937-1947, Gaza military orders 1968, 1982, 1984.",
      "Not applied (unclear in the source): the word «من» deleted from art. 60(1) by 59/1939; the 1939 change to art. 369.",
      "Art. 46 repealed by the probation law 42/1944. The table of art. 42 is not printed in the PDF.",
      "Later Gaza amendments, if any, are not in the lawyer's file (question for the lawyer).",
    ],
    review: { status: "pending", by: "", at: "" },
  },
  {
    key: "criminal-procedure-2001",
    name: CRIMINAL_PROCEDURE_NAME,
    prefix: "cp:",
    articles: CRIMINAL_PROCEDURE,
    hints: ["الاجراءات الجزائيه", "قانون الاجراءات"],
    // the same law also applies in the West Bank (with its own amendments): no year or word marks it as Gaza-only
    marks: [],
    caveat: "",
    source: "PDF approved by the owner's lawyer, 2026-11-23 (Palestinian Bar Association edition, 2013)",
    scope: [
      "The law as enacted in 2001; later amendments applied in Gaza, if any, are not in the lawyer's file (question for the lawyer).",
      "The PDF misprints the numbers of articles 165 (as 163) and 392 (as 388); the ids follow the sequence.",
    ],
    review: { status: "pending", by: "", at: "" },
  },
];
