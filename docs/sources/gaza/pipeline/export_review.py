"""Word file for the LAWYER's review of one transcribed law (hn | sp), from gaza/<law>.final.json.
Each article: number, the page of the original PDF, its text; corrected articles in orange, open ones in red.
Usage: export_review.py <scratch> <law> <out.docx>"""
import glob, json, re, sys
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.shared import Pt, RGBColor

O, LAW, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
TITLE = {"hn": "قانون الأحوال الشخصية على مذهب الإمام أبي حنيفة النعمان",
         "sp": "قانون أصول المحاكمات الشرعية رقم (12) لسنة 1965 (قطاع غزة)"}[LAW]
F = json.load(open(f"{O}/gaza/{LAW}.final.json", encoding="utf-8"))
STATUS = json.load(open(f"{O}/gaza/{LAW}.status.json", encoding="utf-8"))
for k, v in F.items():
    v["status2"] = STATUS.get(k, {}).get("status2", "review")

# page of each article heading (third reading keeps the page breaks)
page = {}
for p in sorted(glob.glob(f"{O}/ocr3/{LAW}/p*.txt")):
    pg = int(p[-7:-4])
    for m in re.finditer(r"(?:المادة\s*\(\s*(\d+)\s*\)|^\s*مادة\s+(\d+)\s*$)", open(p, encoding="utf-8").read(), re.M):
        page.setdefault(int(m.group(1) or m.group(2)), pg)


def rtl(par, size=13, bold=False, color=None):
    pPr = par._p.get_or_add_pPr()
    pPr.append(pPr.makeelement(qn("w:bidi"), {}))
    par.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    for r in par.runs:
        r.font.rtl = True
        r.font.name = "Traditional Arabic"
        r.font.size = Pt(size)
        r.bold = bold or r.bold
        if color:
            r.font.color.rgb = color


ORANGE, RED, GREY = RGBColor(0xC0, 0x60, 0x00), RGBColor(0xC0, 0x00, 0x00), RGBColor(0x60, 0x60, 0x60)
doc = Document()
rtl(doc.add_paragraph(TITLE), 18, True)
intro = (
    "نسخة للمراجعة. نُسخ النص من صور صفحات الملف الذي أعطاه المحامي، بثلاث قراءات مستقلة (برنامجا قراءة + قراءة ثالثة)، "
    "وطوبقت كل مادة آلياً مع النص المخفي في الملف، وفُحصت نهايات المواد والكلمات المختلف عليها بالعين على صور الصفحات. "
    "المطلوب: قراءة كل مادة مقابل الصفحة المذكورة في الملف الأصلي، وتعليم أي اختلاف. "
    "البرتقالي: مادة صُحّحت أثناء التدقيق (ابدأ بها). الأحمر: مادة بقي فيها فرق لم يُحسم."
)
rtl(doc.add_paragraph(intro), 12, color=GREY)
counts = {"ok": 0, "fixed": 0, "open": 0}
for k in sorted(F, key=int):
    v = F[k]
    n = int(k)
    fixed = bool(v.get("eye_checked") or v.get("vote_changes") or any(
        "corrected" in x or "by hand" in x or "kept words" in x for x in v.get("notes", [])))
    open_ = v.get("status2") == "review"
    state = "open" if open_ else "fixed" if fixed else "ok"
    counts[state] += 1
    head = doc.add_paragraph()
    head.add_run("الديباجة" if n == 0 else (f"المادة ({n})" if LAW == "hn" else f"مادة {n}"))
    if v.get("caption"):
        head.add_run(f" — {v['caption']}")
    head.add_run(f"   [صفحة {page.get(n, '؟')}]")
    if state != "ok":
        head.add_run("   [مادة فيها فرق لم يُحسم]" if state == "open" else "   [صُحّحت أثناء التدقيق]")
    rtl(head, 13, True, RED if state == "open" else ORANGE if state == "fixed" else None)
    rtl(doc.add_paragraph(v["text"]), 13)
doc.save(OUT)
print(LAW, OUT.split("/")[-1], counts)
