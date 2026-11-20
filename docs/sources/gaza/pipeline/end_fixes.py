"""Article endings confirmed BY EYE on the page images (2026-11-19).

Tesseract drops a very short last line (one or two words) in both passes, so these articles ended mid-sentence.
Each ending below was read on the page image (scratchpad/look/group*.png, sp121-bottom.png, sp-bottom-*.png) or,
for hn 11 and hn 334, on the lawyer's PDF text layer. Usage: end_fixes.py <scratch>  (idempotent)
"""
import json
import sys

SCR = sys.argv[1]
APPEND = {
    "hn": {11: "للمرأة.", 135: "عشرة.", 180: "للبيع.", 220: "مجنون.", 250: "طلقات.", 260: "المرأة.", 334: "بينهما.",
           383: "للصغير.", 431: "تركته.", 444: "غيبته.", 488: "ضامن لها.", 562: "الثلث."},
    "sp": {10: "القضاة لتعيين المرجع.", 72: "شرعاً.", 83: "أشهد.", 85: "فقط.",
           97: "بشهود آخرين لا يقبل منه إلا فيما تسمع فيه الشهادة حسبة.", 109: "الموظفين.", 130: "ذلك.",
           172: "حكم عليه غيابياً.", 184: "الشرعية.", 199: "الثاني.", 245: "أن تحجز."},
}
STRIP_TAIL = {  # a chapter title that was glued to the end of the article
    "hn": {18: "موانع النكاح الشرعي", 130: "النكاح الغير الصحيح"},
    "sp": {178: "الاستئناف", 182: "اصول المحاكمات الاستئنافية"},
}
REPLACE = {"hn": {187: [("إلى حيث لا 2 نسو حم 1 .", "إلى حيث لا تستوحش.")]}, "sp": {53: [("التحقيق. حالتها كما تقدم.", "التحقيق. تسليم الورقة المقتضى تحقيقها في قلم كتاب المحكمة ممن هي تحت يده مع بيان حالتها كما تقدم.")], 121: [("إلى أن ادا", "إلى أن تنتهي.")], 138: [("في دعوى ما", "في دعوى ما.")]}}
CUT_AFTER = {"sp": {252: "في الجريدة الرسمية."}}  # signature and the explanatory memorandum follow the last article

for law in ("hn", "sp"):
    p = f"{SCR}/gaza/{law}.final.json"
    d = json.load(open(p, encoding="utf-8"))
    for n, tail in STRIP_TAIL[law].items():
        t = d[str(n)]["text"].rstrip()
        if t.endswith(tail):
            d[str(n)]["text"] = t[: -len(tail)].rstrip()
    for n, pairs in REPLACE.get(law, {}).items():
        for a, b in pairs:
            if b not in d[str(n)]["text"]:
                d[str(n)]["text"] = d[str(n)]["text"].replace(a, b)
    for n, mark in CUT_AFTER.get(law, {}).items():
        t = d[str(n)]["text"]
        if mark in t:
            d[str(n)]["text"] = t[: t.index(mark) + len(mark)]
    for n, add in APPEND[law].items():
        t = d[str(n)]["text"].rstrip()
        if not t.endswith(add):
            d[str(n)]["text"] = f"{t} {add}"
    for n in set(APPEND[law]) | set(STRIP_TAIL[law]) | set(REPLACE.get(law, {})) | set(CUT_AFTER.get(law, {})):
        d[str(n)].setdefault("notes", []).append("ending checked by eye on the page image (end_fixes.py)")
        d[str(n)]["eye_checked"] = True
    json.dump(d, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    print(law, "endings fixed")
