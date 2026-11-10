/**
 * The Amended Basic Law of 2003 (the interim constitution), in force in the West Bank and Gaza.
 * Text copied verbatim from maqam.najah.edu. Only the articles that protect a woman's rights in everyday
 * questions are included: equality (9), human rights (10), personal liberty (11), no coercion (13),
 * and the rule that any violation of personal liberties or private life is a crime without limitation (32).
 * Do NOT edit article text without checking the source; tests/law-integrity.test.js fingerprints it.
 */

/** @typedef {import("./cyber-crimes-2018.js").Article} Article */

export const BASIC_LAW_NAME = "القانون الأساسي المعدل لسنة 2003";

/** @type {Article[]} */
export const BASIC_LAW_2003 = [
  {
    id: "bl:9",
    topic: "المساواة أمام القانون والقضاء",
    url: "https://maqam.najah.edu/legislation/11/item/1170/",
    amended: "",
    text: "الفلسطينيون أمام القانون والقضاء سواء لا تمييز بينهم بسبب العرق أو الجنس أو اللون أو الدين أو الرأي السياسي أو الإعاقة.",
  },
  {
    id: "bl:10",
    topic: "حماية حقوق الإنسان",
    url: "https://maqam.najah.edu/legislation/11/item/1171/",
    amended:
      "حكمت المحكمة بموجب الدعوى الدستورية رقم(5/2017)بتفسير هذه المادة من القانون الأساسي المعدل لسنة2003",
    text: "1- حقوق الإنسان وحرياته الأساسية ملزمة وواجبة الاحترام.\n2- تعمل السلطة الوطنية الفلسطينية دون إبطاء على الانضمام إلى الإعلانات والمواثيق الإقليمية والدولية التي تحمي حقوق الإنسان.",
  },
  {
    id: "bl:11",
    topic: "الحرية الشخصية",
    url: "https://maqam.najah.edu/legislation/11/item/1172/",
    amended: "",
    text: "1- الحرية الشخصية حق طبيعي وهي مكفولة لا تمس.\n2- لا يجوز القبض على أحد أو تفتيشه أو حبسه أو تقييد حريته بأي قيد او منعه من التنقل إلا بأمر قضائي وفقاً لأحكام القانون، ويحدد القانون مدة الحبس الاحتياطي، ولا يجوز الحجز أو الحبس في غير الأماكن الخاضعة للقوانين الصادرة بتنظيم السجون.",
  },
  {
    id: "bl:13",
    topic: "حظر الإكراه أو التعذيب",
    url: "https://maqam.najah.edu/legislation/11/item/1174/",
    amended: "",
    text: "1- لا يجوز إخضاع أحد لأي إكراه أو تعذيب، ويعامل المتهمون وسائر المحرومين من حرياتهم معاملة لائقة.\n2- يقع باطلاً كل قول أو اعتراف صدر بالمخالفة لأحكام الفقرة الأولى من هذه المادة.",
  },
  {
    id: "bl:32",
    topic: "حظر الاعتداء على الحريات الشخصية وحرمة الحياة الخاصة",
    url: "https://maqam.najah.edu/legislation/11/item/1193/",
    amended: "",
    text: "كل اعتداء على أي من الحريات الشخصية أو حرمة الحياة الخاصة للإنسان وغيرها من الحقوق والحريات العامة التي يكفلها القانون الأساسي أو القانون، جريمة لا تسقط الدعوى الجنائية ولا المدنية الناشئة عنها بالتقادم، وتضمن السلطة الوطنية تعويضاً عادلاً لمن وقع عليه الضرر.",
  },
];
