"""Words where our text (Tesseract) disagreed with the third reading and OURS was the misreading.
Decided from Arabic (a non-word such as «يتتصف», «استثذانها», «الووصل») or, for pairs of real words, BY EYE on the
page image (hn 123, 346, 491: look/amb-hn-*.png). Then removes the diacritics Tesseract invents (keeps tanween fath,
which the law prints). Usage: word_fixes.py <scratch>   (idempotent)
"""
import json
import re
import sys

SCR = sys.argv[1]
FIX = {
    "hn": {53: [("استثذانها", "استئذانها"), ("استثيذنها", "استئذنها"), ("واستثمارها", "واستئمارها")],
           71: [("مهاا", "مهرا")], 86: [("يتتصف", "يتنصف")], 106: [("المثتل", "المثل")],
           123: [("فتتصرت", "فتنصرت")], 224: [("وتتقضي", "وتنقضي")], 226: [("والباثن", "والبائن")],
           266: [("التلث", "الثلث")], 303: [("تتقص", "تنقص")], 325: [("بلوخ", "بلوغ")],
           328: [("استثنافها", "استئنافها")], 346: [("مدخلا", "مدخولا")], 359: [("استثذان", "استئذان")],
           387: [("امتتعت", "امتنعت")], 390: [("المتل", "المثل")], 424: [("البلوخ", "البلوغ")],
           491: [("يقتي", "يفتي")], 515: [("الموايع", "الموانع")], 561: [("والاستثجار", "والاستئجار")],
           575: [("الووصل", "الواصل")]},
    "sp": {2: [("ترتقب", "ترتب")], 20: [("وحينثيذ", "وحينئذ")], 141: [("الاستتكاف", "الاستنكاف")],
           177: [("مطقا", "مطلقا")], 185: [("بعضهاء", "بعضها")], 197: [("المستايف", "المستأنف")],
           199: [("المتتاقضان", "المتناقضان")], 211: [("طارثا", "طارئا")], 222: [("واقتتعت", "واقتنعت")],
           231: [("مسيلا", "مسئولا")], 238: [("مسيلا", "مسئولا")], 243: [("اثمايها", "أثمانها")],
           244: [("يووخذ", "يؤخذ")]},
}
HAMZA = str.maketrans("أإآؤئ", "اااوي")
norm = lambda w: re.sub("[ً-ْ]", "", w).translate(HAMZA)
OTHER_DIAC = re.compile("[ٌ-ْٰ]")  # all harakat except tanween fath (U+064B)
for law in ("hn", "sp"):
    p = f"{SCR}/gaza/{law}.final.json"
    d = json.load(open(p, encoding="utf-8"))
    n_fix = 0
    for k, v in d.items():
        t = OTHER_DIAC.sub("", v["text"])
        for bad, good in FIX[law].get(int(k), []):
            toks = t.split(" ")
            for i, tok in enumerate(toks):
                core = re.sub(r"[ً.،:؛()]+$", "", tok)
                if norm(core) == norm(bad):
                    toks[i] = good + tok[len(core):]  # keep tanween / punctuation glued to the word
                    n_fix += 1
            t = " ".join(toks)
        if int(k) in FIX[law]:
            v.setdefault("notes", []).append("word(s) corrected: see word_fixes.py")
        v["text"] = t
    json.dump(d, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    missing = [(k, b) for k, pairs in FIX[law].items() for b, g in pairs
               if any(norm(re.sub(r"[ً.،:؛()]+$", "", w)) == norm(b) for w in d[str(k)]["text"].split(" "))]
    print(law, "words fixed:", n_fix, "| still present (check!):", missing)
