"""OCR the page IMAGES of the lawyer's broken PDFs with Tesseract (Arabic), page by page, on this machine.

Usage: ocr_pages.py <scratch> <law: hn|sp|mj> [first_page] [last_page]
Writes <scratch>/ocr/<law>/p###.txt (one file per page; existing pages are skipped, so it can resume).
"""
import os
import subprocess
import sys

import pymupdf

SCR, LAW = sys.argv[1], sys.argv[2]
SRC = "C:/Users/Lenovo/AppData/Local/notebooklm-mcp/Data/gaza-law"
FILES = {
    "hn": "قانون الاحوال الشخصية الشرعي.pdf",
    "sp": "قانون اصول المحاكمات الشرعية رقم 12 لسنة 1965.pdf",
    "mj": "القواعد الكلية من مجلة الاحكام العدلية معدل-مدمج (1)_٠٦٥٦٣١.pdf",
}
TESS = "C:/Program Files/Tesseract-OCR/tesseract.exe"
ENV = {**os.environ, "TESSDATA_PREFIX": "C:/Users/Lenovo/tessdata", "OMP_THREAD_LIMIT": "1"}
out = f"{SCR}/ocr/{LAW}"
os.makedirs(out, exist_ok=True)
doc = pymupdf.open(f"{SRC}/{FILES[LAW]}")
first = int(sys.argv[3]) if len(sys.argv) > 3 else 1
last = int(sys.argv[4]) if len(sys.argv) > 4 else doc.page_count
for p in range(first, last + 1):
    txt = f"{out}/p{p:03d}.txt"
    if os.path.exists(txt):
        continue
    png = f"{out}/p{p:03d}.png"
    doc[p - 1].get_pixmap(dpi=300).save(png)
    subprocess.run([TESS, png, txt[:-4], "-l", "ara", "--psm", "6"], env=ENV, check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    os.remove(png)
    print(LAW, p, flush=True)
