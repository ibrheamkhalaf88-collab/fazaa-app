"""Turn the OCR pages of one law into articles and check each against the PDF's (broken) text layer.

Usage: ocr_split.py <scratch> <law: hn|sp|mj>
Writes gaza/<law>.verified.json  {number: {text, section, ok, diffs}}  (the format export_law.py reads).
The check compares the OCR text with the text layer through the "skeleton" (verify_garbled.py): two independent
readings of the same page (the image and the hidden text) must agree, or the article is flagged.
"""
import difflib
import glob
import json
import re
import sys

SCR, LAW = sys.argv[1], sys.argv[2]
OCRDIR = sys.argv[3] if len(sys.argv) > 3 else "ocr"
SUFFIX = "" if OCRDIR == "ocr" else "." + OCRDIR
sys.path.insert(0, SCR)
from verify_garbled import compare  # noqa: E402

sys.stdout.reconfigure(encoding="utf-8")
S = SCR + "/gaza"
AR_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")
HEADER = re.compile(r"^\s*(?:\S{1,2}\s+)?(?:ال)?ماد[ةه]\s*[\(\)]?\s*(\d{1,4})\s*[\(\)]?\s*$")
HEADING = re.compile(r"^(?:ال)?(?:باب|فصل|قسم|كتاب|فرع)\b")
NOTE = re.compile(r"(?:\d+\s*)?(?:حكم قضائي واحد|حكمان قضائيان|أحكام قضائية|حكما قضائيا)")
DIAC = re.compile("[ً-ْٰٖ-ٟـ]")

lines = []
for f in sorted(glob.glob(f"{SCR}/{OCRDIR}/{LAW}/p*.txt")):
    for line in open(f, encoding="utf-8").read().translate(AR_DIGITS).splitlines():
        line = line.strip()
        if not line or re.fullmatch(r"[-–\d\s.]+", line):  # page numbers
            continue
        lines.append(line)

# cut at article headers
arts, cur, pre = [], None, []
for line in lines:
    m = HEADER.match(line)
    loose = None if m else (len(line) <= 20 and re.match(r"^\s*(?:ال)?م(?:اد[ةه]|د)\s*[\(\)\d/lIوو]*\s*$", line))
    if m or loose:
        cur = {"number": int(m.group(1)) if m else -1, "lines": []}  # -1: unreadable number, set by position
        arts.append(cur)
    elif cur is None:
        pre.append(line)
    else:
        cur["lines"].append(line)

# article numbers run 1, 2, 3…: an OCR'd number that breaks the run is a misread digit (80 read as 50)
if LAW in ("hn", "sp"):
    prev = 0
    for a in arts:
        if a["number"] != prev + 1:
            a["ocr_number"] = a["number"]
            a["number"] = prev + 1
        prev = a["number"]

# headings: lines after the article's last full stop, before the next header, go to the NEXT article's section
section = ""
for a in arts:
    a["section"] = section
    body = a["lines"]
    # (fixed 2026-11-19) the article runs until a real chapter title line («القسم الثالث», «الباب الأول»…);
    # a last line without a full stop is still part of the article (it was wrongly cut before)
    cut = len(body)
    for j in range(1, len(body)):
        if HEADING.match(body[j]) and len(body[j].split()) <= 7:
            cut = j
            break
    if LAW == "sp" and len(body) > 1 and len(body[0].split()) <= 5 and not body[0].endswith((".", ":")):
        a["section"] = a["caption"] = body[0]  # the 1965 law prints a short caption under «مادة N»
        body = body[1:]
        cut -= 1
    tail = body[cut:]
    a["tail"] = tail
    a["text_lines"] = body[:cut]
    if tail:
        section = " / ".join(t for t in tail if not NOTE.fullmatch(t))[:120] or section
    a["text"] = re.sub(r"\s+", " ", " ".join(a["text_lines"])).strip()
    if LAW == "mj":
        a["text"] = DIAC.sub("", NOTE.sub(" ", a["text"])).strip()
        a["text"] = re.sub(r"\s+", " ", a["text"])

# the text layer, split the same way (by order of headers)
split = json.load(open(f"{S}/{LAW}.split.json", encoding="utf-8"))
if LAW == "mj":
    broken, seen = {}, set()
    for n, t in zip(split["nums"], split["texts"]):
        if n in seen:
            broken[n] += " " + t
        else:
            broken[n], _ = t, seen.add(n)
else:
    broken = {i + 1: t for i, t in enumerate(split["texts"])}


def mj_skeleton(t, clean):
    t = DIAC.sub("", NOTE.sub(" ", t))
    if clean:
        t = t.replace("لا", "ل").replace("لأ", "ل").replace("لإ", "ل").replace("لآ", "ل")
    t = re.sub(r"[^ء-ي]", "", t)
    return re.sub("[اأإآ]", "", t)


numbers = [a["number"] for a in arts]
expected = {"hn": range(1, 648), "mj": range(1616, 1771)}.get(LAW, range(1, len(broken) + 1))
missing = [n for n in expected if n not in numbers]
dupes = sorted({n for n in numbers if numbers.count(n) > 1})
out, bad = {}, []
for a in arts:
    n = a["number"]
    if n in out:
        continue
    raw = " ".join(a["lines"])  # compared WITH any heading lines: the text layer has them too
    b = re.sub(r"\s\d{1,3}\s*$", "", broken.get(n, ""))
    if LAW == "mj":
        x, y = mj_skeleton(raw, True), mj_skeleton(b, False)
        sm = difflib.SequenceMatcher(None, x, y, autojunk=False)
        diffs = [(op, x[i1:i2], y[j1:j2]) for op, i1, i2, j1, j2 in sm.get_opcodes() if op != "equal"]
    else:
        _, diffs = compare(raw, b)
    ok = not diffs
    out[n] = {"number": n, "section": a["section"], "caption": a.get("caption", ""), "text": a["text"], "heading_after": a["tail"], "ok": ok, "diffs": diffs}
    if not ok:
        bad.append(n)
if pre and LAW == "sp":
    out[0] = {"number": 0, "section": "الديباجة", "text": re.sub(r"\s+", " ", " ".join(pre)), "ok": None, "diffs": []}
json.dump(out, open(f"{S}/{LAW}.verified{SUFFIX}.json", "w", encoding="utf-8"), ensure_ascii=False, indent=0)
print(f"{LAW}: {len(out)} articles; missing {missing[:40]}; duplicates {dupes}")
print(f"{LAW}: {len(out) - len(bad)} match the PDF exactly; {len(bad)} flagged: {bad[:80]}")
