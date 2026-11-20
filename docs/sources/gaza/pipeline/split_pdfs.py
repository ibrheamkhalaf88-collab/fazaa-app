"""Split the three broken PDFs into chunks of 9 pages (+1 page overlap, so an article that runs over the end of
a chunk can be finished), and record which pages each chunk covers."""
import json
import os
import subprocess
import sys

from pypdf import PdfReader, PdfWriter

SRC = "C:/Users/Lenovo/AppData/Local/notebooklm-mcp/Data/gaza-law"
OUT = sys.argv[1] + "/chunks"
os.makedirs(OUT, exist_ok=True)
FILES = {
    "hn": "قانون الاحوال الشخصية الشرعي.pdf",
    "sp": "قانون اصول المحاكمات الشرعية رقم 12 لسنة 1965.pdf",
    "mj": "القواعد الكلية من مجلة الاحكام العدلية معدل-مدمج (1)_٠٦٥٦٣١.pdf",
}
STEP = 9
index = {}
for key, name in FILES.items():
    path = f"{SRC}/{name}"
    reader = PdfReader(path)
    n = len(reader.pages)
    chunks = []
    for start in range(0, n, STEP):
        end = min(start + STEP + 1, n)  # one page overlap
        w = PdfWriter()
        for p in range(start, end):
            w.add_page(reader.pages[p])
        fn = f"{OUT}/{key}-{start + 1:03d}-{end:03d}.pdf"
        with open(fn, "wb") as f:
            w.write(f)
        chunks.append({"file": fn, "first": start + 1, "last": end, "own_last": min(start + STEP, n)})
    # article headers per page (from the broken text layer: only the COUNT is used)
    per_page = []
    for p in range(1, n + 1):
        t = subprocess.run(["pdftotext", "-enc", "UTF-8", "-f", str(p), "-l", str(p), path, "-"],
                           capture_output=True).stdout.decode("utf-8", "replace")
        import re
        per_page.append(len(re.findall(r"(?:ال)?ماد[ةه]\s*[\)(]", t)))
    index[key] = {"pages": n, "chunks": chunks, "headers_per_page": per_page}
    print(key, n, "pages,", len(chunks), "chunks, headers:", sum(per_page))
json.dump(index, open(OUT + "/index.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
