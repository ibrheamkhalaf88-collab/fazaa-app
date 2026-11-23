import json, re, sys
L = json.load(open(sys.argv[1], encoding="utf-8"))
ART = re.compile(r"^(?:ال)?مادة\s*\(?(\d+)\)?\s*(.*)$")
SEC = re.compile(r"^(?:الباب|الفصل|القسم|الجزء)\s")
arts, cur, section, pending_sec, sec_title_mode = [], None, "", "", False
for r in L:
    t = r["t"]
    m = ART.match(t)
    if m and len(t) < 40:
        if cur: arts.append(cur)
        cur = {"number": m.group(1), "extra": m.group(2).strip(), "section": section, "title": None, "lines": [], "page": r["page"]}
        sec_title_mode = False
        continue
    if SEC.match(t) and len(t.split()) <= 6:
        if cur: arts.append(cur); cur = None
        section = t; sec_title_mode = True
        continue
    if sec_title_mode:
        section = section + " - " + t if section.count(" - ") < 1 else section + " " + t
        continue
    if cur is None:
        continue
    if cur["title"] is None and not cur["lines"]:
        cur["title"] = t; continue
    cur["lines"].append(t)
if cur: arts.append(cur)
for a in arts:
    a["text"] = " ".join(a.pop("lines"))
json.dump(arts, open(sys.argv[2], "w", encoding="utf-8"), ensure_ascii=False, indent=1)
nums = [a["number"] for a in arts]
print("articles:", len(arts), "first", nums[0], "last", nums[-1])
prev = 0
for a in arts:
    n = int(a["number"])
    if n != prev + 1: print("SEQ", prev, "->", n, a["extra"], "p", a["page"])
    prev = n
for a in arts:
    if a["extra"]: print("EXTRA", a["number"], a["extra"])
    if a["title"] and (len(a["title"].split()) > 9 or a["title"].endswith((".", ":", "،"))): print("LONGTITLE", a["number"], a["title"][:80])
    if len(a["text"]) < 25: print("SHORT", a["number"], repr(a["title"]), repr(a["text"]))
