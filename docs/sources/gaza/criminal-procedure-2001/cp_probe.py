import sys, pymupdf
d = pymupdf.open(sys.argv[1])
pg = d[int(sys.argv[2]) - 1]
want = sys.argv[3:]
for b in pg.get_text("rawdict")["blocks"]:
    for l in b.get("lines", []):
        for s in l["spans"]:
            t = "".join(c["c"] for c in s["chars"])
            if any(w in t for w in want):
                print("SPAN:", repr(t[:80]), "| font:", s["font"], s["size"])
                for c in s["chars"][:45]:
                    x0, y0, x1, y1 = c["bbox"]
                    print(f"  {c['c']!r} U+{ord(c['c']):04X} x0={x0:.1f} x1={x1:.1f} y={(y0+y1)/2:.1f}")
                print()
