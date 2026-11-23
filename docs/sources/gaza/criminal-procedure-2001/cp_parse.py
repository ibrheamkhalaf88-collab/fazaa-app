"""Criminal procedure 3/2001 lines -> articles. Fixes the PDF's broken ligatures that survive extraction."""
import json, re, sys

L = json.load(open(sys.argv[1], encoding="utf-8"))
ART = re.compile(r"^مادة \[\s*(\d+)\s*\]$")
STRUCT = re.compile(r"^(?:الكتاب|الباب|الفصل)\b")


def fix(t):
    t = re.sub(r"\s+", " ", t).strip()
    # «...ل Yاا» is a lam-alef ligature split around a justification gap: «خل لاا» = «خلال», «البطل ناا» = «البطلان»
    # (also with hamza: «لل حأأكام» = «للأحكام»)
    t = re.sub(r"ل (\S?)([اأإآ])\2", r"ل\2\1", t)
    # «المتهمي نن» = «المتهمين» (the yeh-noon ligature split the same way)
    t = re.sub(r"ي نن(?=$|[\s،.:؛)\]])", "ين", t)
    # a lone «لا» whose ligature came apart as «ا ل» (art. 430)
    t = re.sub(r"(?<=\s)ا ل(?=\s)", "لا", t)
    t = t.replace("‌", "")
    # tanween drawn after the punctuation that follows its alef
    t = re.sub(r"([.،:؛])ً", r"ً\1", t)
    t = re.sub(r"\[\s*(\d+)\s*\]", r"[\1]", t)
    return t


arts, cur, topic, title_mode = [], None, "", False
for r in L:
    if r["page"] < 8:
        continue
    t = r["t"].strip()
    if re.fullmatch(r"-\d+-", t):
        continue
    if t.startswith("صدر بمدينة غزة"):
        break
    m = ART.match(t)
    if m:
        if cur:
            arts.append(cur)
        cur = {"printed": int(m.group(1)), "topic": topic, "lines": [], "page": r["page"]}
        title_mode = False
        continue
    if r["bold"] and r["size"] >= 14:
        if cur:
            arts.append(cur)
            cur = None
        if STRUCT.match(t):
            title_mode = False  # the next bold line starts a new title
            if ":" in t:
                topic = t.split(":", 1)[1].strip()
                title_mode = True
            continue
        part = re.sub(r"^\[\s*|\s*\]$", "", t).strip()
        # a title printed over two lines continues the one before it
        topic = f"{topic} {part}" if title_mode else part
        title_mode = True
        continue
    if cur is None:
        continue
    cur["lines"].append(t)
if cur:
    arts.append(cur)
for a in arts:
    a["text"] = fix(" ".join(a.pop("lines")))
json.dump(arts, open(sys.argv[2], "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("articles:", len(arts))
prev = 0
for a in arts:
    if a["printed"] != prev + 1:
        print("SEQ", prev, "->", a["printed"], "p", a["page"], a["text"][:60])
    prev = a["printed"]
for a in arts:
    if len(a["text"]) < 20 or len(a["topic"]) <= 3:
        print("SHORT/NOTOPIC", a["printed"], repr(a["topic"]), a["text"][:80])
