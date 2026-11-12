// Runs realistic multi-turn conversations through the app's answerer (offline path, no network).
const root = process.argv[2];
const { createAnswerer } = await import(`${root}/src/ai/answerer.js`);

const show = (a) => {
  if (!a) return "   [لا رد: شاشة «ما عندي جواب أكيد»]";
  const parts = [`   [${a.kind || "law"}${a.sos ? " sos" : ""}${a.cites?.length ? ` cites:${a.cites.join(",")}` : ""}]`, `   ${a.lead}`];
  for (const o of a.options || []) parts.push(`   • ${o}`);
  for (const s of a.steps || []) parts.push(`   - ${s}`);
  if (a.note) parts.push(`   (ملاحظة) ${a.note}`);
  for (const s of a.scope || []) parts.push(`   (نطاق) ${s}`);
  if (a.ask) parts.push(`   ؟ ${a.ask}`);
  if (a.safetyAsk) parts.push(`   ؟ ${a.safetyAsk}`);
  return parts.join("\n");
};

const PERSONAS = {
  "1 مخنوقة بدها تفضفض": [
    "مرحبا",
    "تعبانة كتير ومخنوقة",
    "جوزي كل يوم بيصرخ علي قدام الولاد وبيهينني",
    "من سنتين هيك",
    "ما بعرف شو بدي، بس بدي حدا يسمعني",
    "بحس حالي ولا إشي",
  ],
  "2 مبتزة وخايفة": [
    "في شب معه صوري وبدّه 500 شيكل وإلا بنشرهم",
    "ما بقدر أحكي لأهلي، بيقتلوني",
    "طيب شو أعمل؟ ما معي مصاري",
    "وإذا نشرهم؟",
    "شكراً",
  ],
  "3 مطلقة وبدها حقوقها": [
    "طلقني وطردني من البيت وأخد الولاد",
    "شو حقي بالنفقة؟",
    "وبضل الولاد معي؟",
    "شو بتقول المادة 154؟",
  ],
  "4 بنت 16 بدهم يجوزوها": ["عمري 16", "أهلي جايبين عريس وأنا مش بدي", "آه", "ما بقدر أحكي لحدا بالمدرسة"],
  "5 خطر هلأ": ["جوزي هلأ عم يكسر الباب وأنا بالحمام", "لا"],
  "6 أفكار إيذاء نفس": ["ما في فايدة من إشي", "الكل أحسن بدوني", "لا", "بس تعبانة من كل شي"],
  "7 تصحيح ومتابعة": ["جوزي ما بيصرف علي", "لا قصدي أخوي مش جوزي، هو اللي ماسك المصاري", "كل شهر هيك", "شو بعمل؟"],
  "8 صاحبتها بخطر": ["صاحبتي جوزها بيضربها كل يوم، كيف بساعدها؟", "هي خايفة تحكي لحدا"],
};

for (const [name, msgs] of Object.entries(PERSONAS)) {
  const a = createAnswerer({
    emergencyNumbers: () => ({ police: "100", ambulance: "101" }),
    available: () => ({ lawyer: false, contacts: true }),
  });
  console.log(`\n================ ${name} ================`);
  for (const m of msgs) {
    console.log(`هي: ${m}`);
    console.log(show(await a.answer(m, { country: "ps-wb" })));
  }
}
