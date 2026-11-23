"""Penal code 1936 PDF -> lines in logical order, with bold flag. Fixes reversed lam-alef and stray spaces."""
import sys, re, json, pymupdf
ALEFS = set("اأإآ")
LTR = re.compile(r"[0-9A-Za-z\u0660-\u0669]+(?:[./:,\-][0-9A-Za-z\u0660-\u0669]+)*")
def page_lines(pg):
    chars = []
    for b in pg.get_text("rawdict")["blocks"]:
        for l in b.get("lines", []):
            for s in l["spans"]:
                bold = bool(s["flags"] & 16) or "Bold" in s["font"]
                for c in s["chars"]:
                    x0, y0, x1, y1 = c["bbox"]
                    chars.append([c["c"], x0, x1, (y0 + y1) / 2, s["size"], bold])
    chars.sort(key=lambda c: c[3])
    lines, cur, cy = [], [], None
    for c in chars:
        if cy is None or abs(c[3] - cy) <= max(2.5, c[4] * 0.35):
            cur.append(c); cy = c[3] if cy is None else (cy * (len(cur) - 1) + c[3]) / len(cur)
        else:
            lines.append(cur); cur, cy = [c], c[3]
    if cur: lines.append(cur)
    out = []
    for ln in lines:
        letters = [c for c in ln if not c[0].isspace()]
        keep = []
        for c in ln:
            if c[0].isspace():
                host = next((o for o in letters if o[1] + 0.2 < (c[1] + c[2]) / 2 < o[2] - 0.2), None)
                if host is not None:
                    # a "space" drawn over a final alef is its tanween fath; over anything else it is noise
                    if host[0] == "ا" and not host[-1:] == ["T"]:
                        host.append("T")
                    continue
            keep.append(c)
        ln = keep
        ln.sort(key=lambda c: -((c[1] + c[2]) / 2))
        i = 0
        while i < len(ln) - 1:
            # a zero-width alef is the second half of a lam-alef ligature: put it right after its lam
            if ln[i][0] in ALEFS and abs(ln[i][2] - ln[i][1]) < 0.3:
                j = next((k for k in range(i + 1, min(i + 3, len(ln))) if ln[k][0] == "ل"), None)
                if j is not None and all(not ln[k][0].isspace() for k in range(i + 1, j)):
                    a = ln.pop(i); ln.insert(j, a); i = j + 1; continue
            i += 1
        t = "".join(c[0] + ("ً" if c[-1] == "T" else "") for c in ln)
        t = LTR.sub(lambda m: m.group(0)[::-1], t)
        t = re.sub(r"\s+", " ", t).strip()
        if not t: continue
        nb = sum(1 for c in letters if c[5]); 
        out.append({"t": t, "bold": nb > len(letters) / 2, "size": round(max(c[4] for c in ln), 1), "y": round(ln[0][3])})
    out.sort(key=lambda r: r["y"])
    return out
if __name__ == "__main__":
    d = pymupdf.open(sys.argv[1]); res = []
    for i in range(d.page_count):
        for r in page_lines(d[i]): r["page"] = i + 1; res.append(r)
    json.dump(res, open(sys.argv[2], "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    print(len(res), "lines")
