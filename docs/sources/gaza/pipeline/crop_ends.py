"""For each article whose text ends mid-sentence, crop the strip of the page image just above the NEXT article's
heading (= the last lines of this article) so it can be read by eye. Usage: crop_ends.py <scratch> <law> <n>...
Writes look/end-<law>-<n>.png"""
import glob, os, re, subprocess, sys
import pymupdf

O, LAW, NUMS = sys.argv[1], sys.argv[2], [int(x) for x in sys.argv[3:]]
SRC = "C:/Users/Lenovo/AppData/Local/notebooklm-mcp/Data/gaza-law"
FILES = {"hn": "قانون الاحوال الشخصية الشرعي.pdf", "sp": "قانون اصول المحاكمات الشرعية رقم 12 لسنة 1965.pdf"}
TESS = "C:/Program Files/Tesseract-OCR/tesseract.exe"
ENV = {**os.environ, "TESSDATA_PREFIX": "C:/Users/Lenovo/tessdata"}
doc = pymupdf.open(f"{SRC}/{FILES[LAW]}")
pages = sorted(glob.glob(f"{O}/ocr3/{LAW}/p*.txt"))


def page_of(n):
    pat = re.compile(rf"(?:المادة\s*\(\s*{n}\s*\)|^\s*مادة\s+{n}\s*$)", re.M)
    for p in pages:
        if pat.search(open(p, encoding="utf-8").read()):
            return int(p[-7:-4])
    return None


for n in NUMS:
    nxt = page_of(n + 1)
    if not nxt:
        print(n, "next heading not found")
        continue
    png = f"{O}/look/_page.png"
    pix = doc[nxt - 1].get_pixmap(dpi=200)
    pix.save(png)
    tsv = subprocess.run([TESS, png, "-", "-l", "ara", "--psm", "6", "tsv"], env=ENV, capture_output=True).stdout.decode("utf-8", "replace")
    y = None
    for line in tsv.splitlines()[1:]:
        c = line.split("\t")
        if len(c) == 12 and re.search(rf"\b{n + 1}\b", c[11]):
            y = int(c[7])
            break
    if y is None or y < 60:  # heading at the top of the page: the end is at the bottom of the previous page
        prev = doc[nxt - 2].get_pixmap(dpi=200)
        h = prev.height
        clip = pymupdf.Rect(0, (h * 0.70) / 200 * 72, prev.width / 200 * 72, h / 200 * 72)
        doc[nxt - 2].get_pixmap(dpi=200, clip=clip).save(f"{O}/look/end-{LAW}-{n}.png")
        print(n, "end of page", nxt - 1)
    else:
        top = max(0, y - 170)
        clip = pymupdf.Rect(0, top / 200 * 72, pix.width / 200 * 72, (y + 10) / 200 * 72)
        doc[nxt - 1].get_pixmap(dpi=200, clip=clip).save(f"{O}/look/end-{LAW}-{n}.png")
        print(n, "page", nxt, "strip above y", y)
