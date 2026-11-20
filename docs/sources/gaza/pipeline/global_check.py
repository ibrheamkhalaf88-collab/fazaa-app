"""Whole-law check: align the final text of ALL articles (with their section titles) against the whole text
layer, so a title that sits on a different side of an article boundary no longer counts as a gap. Every gap of
6+ reliable letters is mapped back to the article it falls in. Usage: global_check.py <scratch> <law>"""
import difflib, json, sys, bisect
O, LAW = sys.argv[1], sys.argv[2]
sys.path.insert(0, O); import verify3 as v3
v3.LAW["name"] = LAW; sys.stdout.reconfigure(encoding="utf-8")
S = O + "/gaza"
f = json.load(open(f"{S}/{LAW}.final.json", encoding="utf-8"))
A = json.load(open(f"{S}/{LAW}.verified.json", encoding="utf-8"))
sp = json.load(open(f"{S}/{LAW}.split.json", encoding="utf-8"))
stream = v3.sk(sp["head"] + " " + " ".join(sp["texts"]), False)
parts, bounds, pos = [], [], 0
for k in sorted(f, key=int):
    t = f[k].get("caption", "") + " " + f[k]["text"] + " " + " ".join(A.get(k, {}).get("heading_after", []))
    s = v3.sk(t, True); parts.append(s); bounds.append(pos); pos += len(s)
mine = "".join(parts); keys = sorted(f, key=int)
sm = difflib.SequenceMatcher(None, mine, stream, autojunk=False)
gaps = {}
for op, i1, i2, j1, j2 in sm.get_opcodes():
    if op != "equal" and max(i2 - i1, j2 - j1) >= 6:
        k = keys[max(0, bisect.bisect_right(bounds, i1) - 1)]
        gaps.setdefault(k, []).append((op, mine[i1:i2][:40], stream[j1:j2][:40], j2 - j1, i2 - i1))
# (2026-11-19) results go to a SEPARATE file: this check never rewrites the text (an old run once overwrote fixes)
status = {k: {"global_gaps": gaps.get(k, []), "status2": "review" if gaps.get(k) else "ok"} for k in f}
json.dump(status, open(f"{S}/{LAW}.status.json", "w", encoding="utf-8"), ensure_ascii=False, indent=0)
rev = [k for k in keys if status[k]["status2"] == "review"]
print(LAW, "ratio", round(sm.ratio(), 4), "articles with a real gap or open word:", len(rev), rev)
