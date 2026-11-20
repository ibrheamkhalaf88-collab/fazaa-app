"""Crop whole articles from the page images (from the heading of N to the heading of N+1) for an eye check.
Usage: crop_article.py <scratch> <law> <out-prefix> <n>...   -> look/<prefix>-<law>-<n>.png"""
import glob, os, re, subprocess, sys
import pymupdf

O, LAW, PFX, NUMS = sys.argv[1], sys.argv[2], sys.argv[3], [int(x) for x in sys.argv[4:]]
SRC = "C:/Users/Lenovo/AppData/Local/notebooklm-mcp/Data/gaza-law"
FILES = {"hn": "قانون الاحوال الشخصية الشرعي.pdf", "sp": "قانون اصول المحاكمات الشرعية رقم 12 لسنة 1965.pdf"}
TESS = "C:/Program Files/Tesseract-OCR/tesseract.exe"
ENV = {**os.environ, "TESSDATA_PREFIX": "C:/Users/Lenovo/tessdata"}
DPI = 150
doc = pymupdf.open(f"{SRC}/{FILES[LAW]}")
pages = sorted(glob.glob(f"{O}/ocr3/{LAW}/p*.txt"))
tsv_cache = {}


def page_of(n):
    pat = re.compile(rf"(?:المادة\s*\(\s*{n}\s*\)|^\s*مادة\s+{n}\s*$)", re.M)
    for p in pages:
        if pat.search(open(p, encoding="utf-8").read()):
            return int(p[-7:-4])
    return None


def y_of(n, pg):
    if pg not in tsv_cache:
        png = f"{O}/look/_p.png"
        doc[pg - 1].get_pixmap(dpi=DPI).save(png)
        tsv_cache[pg] = subprocess.run([TESS, png, "-", "-l", "ara", "--psm", "6", "tsv"], env=ENV,
                                       capture_output=True).stdout.decode("utf-8", "replace")
    for line in tsv_cache[pg].splitlines()[1:]:
        c = line.split("\t")
        if len(c) == 12 and re.search(rf"(?<!\d){n}(?!\d)", c[11]):
            return int(c[7])
    return None


def rect(pg, y0, y1):
    W, H = doc[pg - 1].rect.width, doc[pg - 1].rect.height
    return pymupdf.Rect(0, y0 * 72 / DPI, W, min(H, y1 * 72 / DPI))


for n in NUMS:
    p1, p2 = page_of(n), page_of(n + 1)
    if not p1:
        print(n, "page not found"); continue
    y1 = y_of(n, p1) or 0
    strips = []
    if p2 == p1:
        strips.append((p1, rect(p1, y1 - 10, (y_of(n + 1, p2) or 99999) - 5)))
    else:
        strips.append((p1, rect(p1, y1 - 10, 99999)))
        if p2:
            strips.append((p2, rect(p2, 0, (y_of(n + 1, p2) or 0) - 5)))
    pix = [doc[pg - 1].get_pixmap(dpi=100, clip=r) for pg, r in strips if r.height > 5]
    W = max(p.width for p in pix); H = sum(p.height for p in pix)
    out = pymupdf.open(); page = out.new_page(width=W, height=H); y = 0
    for p in pix:
        page.insert_image(pymupdf.Rect(0, y, p.width, y + p.height), pixmap=p); y += p.height
    page.get_pixmap(dpi=72).save(f"{O}/look/{PFX}-{LAW}-{n}.png")
    print(n, "pages", [pg for pg, _ in strips])
