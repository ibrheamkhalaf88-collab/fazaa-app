"""Hand corrections for words where the two OCR readings disagreed and the rules could not decide.
Each fix was decided by reading the context and, when needed, the lawyer's PDF text layer (see notes).
Usage: manual_fixes.py <scratch>  — applies to gaza/<law>.final.json and marks those articles «resolved».
"""
import json
import re
import sys

SCR = sys.argv[1]
FIX = {
    "hn": {
        7: [("لاايصح", "لا يصح")],
        18: [("تترقب", "تترتب")],
        20: [("النكا حَ", "النكاح")],
        33: [("فامقاً", "فاسقاً")],
        77: [("المماثئلة", "المماثلة")],
        174: [("أصناقاً", "أصنافاً")],
        175: [("بمقتضصى", "بمقتضى")],
        224: [("تتكح", "تنكح")],
        245: [("إيلاثئه", "إيلائه"), ("مؤقناً", "مؤقتاً")],
        301: [("يؤؤجل", "يؤجل")],
        303: [("ارد أحد", "ارتد أحد")],  # PDF: «ارتد»
        321: [("فولاً", "فوراً"), ("وتتقضي", "وتنقضي")],
        356: [("وبأثم", "ويأثم")],
        362: [("اثتنان", "اثنان"), ("اثتان", "اثنان")],
        364: [("يرقب", "يرتب")],
        403: [("لاايجب", "لا يجب")],
        411: [("لاايجب", "لا يجب"), ("لاا يجب", "لا يجب")],
        417: [("لااتجب", "لا تجب")],
        513: [("حجرةٍ", "حجرة")],  # PDF: «في حجرة قبضها»
        535: [("يبره", "يبرئه")],  # PDF: «يبرئو» = يبرئه
        552: [("تلثه", "ثلثه")],
        623: [("‎1‏ لأخ", "الأخ")],
        636: [("بين لأم", "بين الأم")],  # PDF: «بيف الأـ»
        309: [("وفي في العدة", "وهي في العدة"), ("وفي في الصحة", "وهي في الصحة")],  # PDF: «وىي»
        638: [("أ خ لأم", "أخ لأم")],
        646: [("وا لأعمام", "والأعمام")],
    },
    "sp": {
        5: [("الوقفيهة", "الوقفية")],
        7: [("واإنما", "وإنما"), ("وإاعطاء", "وإعطاء")],
        36: [("جراً", "جبراً")],
        51: [("ويترّب", "ويترتب")],
        73: [("ّ عوى", "الدعوى")],
        92: [("وراد", "وأراد")],
        112: [("موائع", "موانع")],
        150: [("جاباً", "جواباً")],
        226: [("أشمان", "أثمان")],
        248: [("يوؤخذ", "يؤخذ"), ("يوّخذ", "يؤخذ")],
    },
}
GLOBAL = {"sp": [("الاستثئناف", "الاستئناف"), ("استثئناف", "استئناف"), ("الاستثناف", "الاستئناف"),
                 ("استثناف", "استئناف"), ("والاستثئناف", "والاستئناف")],
          "hn": [("لاا ", "لا ")]}
for law in ("hn", "sp"):
    p = f"{SCR}/gaza/{law}.final.json"
    d = json.load(open(p, encoding="utf-8"))
    changed = 0
    for k, v in d.items():
        t = v["text"]
        for a, b in GLOBAL[law]:
            t = t.replace(a, b)
        for a, b in FIX[law].get(int(k), []):
            t = t.replace(a, b)
        if t != v["text"]:
            v["text"] = t
            changed += 1
        if int(k) in FIX[law] and not any(n.startswith("gap") for n in v["notes"]):
            v["status"] = "resolved"
            v["notes"].append("word disagreement decided by hand (scratchpad/manual_fixes.py)")
    json.dump(d, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    print(law, "texts changed:", changed)
