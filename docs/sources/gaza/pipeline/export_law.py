"""Export one verified law to (1) a Word file for the lawyer and (2) src/data/law/<file>.js for the app.

Usage: export_law.py <scratch> <law: hn|sp|mj> <docx-out> <js-out|-> [--only-ok]
The Word file holds EVERY article (marked when it still needs a look); the app file only the ones that match the
lawyer's PDF exactly (--only-ok), so nothing unverified reaches users.
"""
import json
import sys

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.shared import Pt, RGBColor

SCR, LAW, DOCX, JS = sys.argv[1:5]
ONLY_OK = "--only-ok" in sys.argv
sys.path.insert(0, SCR)
from lawlib import js_file  # noqa: E402

META = {
    "hn": ("قانون الأحوال الشخصية على مذهب الإمام أبي حنيفة النعمان", "hn", "HANAFI_NAME", "HANAFI_PERSONAL_STATUS",
           "قانون الأحوال الشخصية على مذهب الإمام أبي حنيفة (المحاكم الشرعية، قطاع غزة)"),
    "sp": ("قانون أصول المحاكمات الشرعية رقم (12) لسنة 1965", "sp", "SHARIA_PROCEDURE_NAME", "SHARIA_PROCEDURE_1965",
           "قانون أصول المحاكمات الشرعية رقم (12) لسنة 1965 (قطاع غزة)"),
    "mj": ("مجلة الأحكام العدلية: الكتاب الرابع عشر (الدعوى)", "mj", "MAJALLA_NAME", "MAJALLA_CLAIMS",
           "مجلة الأحكام العدلية: الكتاب الرابع عشر في الدعوى"),
}
title, prefix, name_const, arr_const, app_name = META[LAW]
data = json.load(open(f"{SCR}/gaza/{LAW}.verified.json", encoding="utf-8"))
arts = [dict(v, number=int(k)) for k, v in sorted(data.items(), key=lambda kv: int(kv[0]))]


def rtl(p):
    pPr = p._p.get_or_add_pPr()
    b = pPr.makeelement(qn("w:bidi"), {})
    pPr.append(b)
    p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    for r in p.runs:
        r.font.rtl = True
        r.font.name = "Traditional Arabic"
        r.font.size = Pt(14)


doc = Document()
p = doc.add_paragraph()
r = p.add_run(title)
r.bold = True
rtl(p)
p.runs[0].font.size = Pt(18)
NOTES = {
    "mj": "النص من قاعدة التشريعات «مقام» (جامعة النجاح)، وهي المصدر الذي طُبع منه ملف المحامي، وطوبقت كل مادة آلياً مع ملف المحامي: "
          "151 مادة تطابق حرفياً، و4 مواد فيها فرق شكلي فقط (ملاحظة الموقع «حكم قضائي»، وعنوان الفصل التالي، وكلمة «الله» المطبوعة رمزاً واحداً).",
}
note = doc.add_paragraph(NOTES.get(LAW,
    "نُسخ هذا النص من صور صفحات الملف الذي أعطاه المحامي (2026-11-18)، وطوبقت كل مادة آلياً مع النص المخفي في الملف. "
    "المواد المعلّمة بـ «تحتاج مراجعة» لم تطابق تماماً بعد."))
rtl(note)
section = None
for a in arts:
    if a.get("section") and a["section"] != section:
        section = a["section"]
        h = doc.add_paragraph()
        h.add_run(section).bold = True
        rtl(h)
    head = doc.add_paragraph()
    head.add_run("الديباجة" if a["number"] == 0 else f"المادة ({a['number']})").bold = True
    if a.get("ok") is False:
        flag = head.add_run("  [تحتاج مراجعة]")
        flag.font.color.rgb = RGBColor(0xC0, 0x00, 0x00)
    rtl(head)
    body = doc.add_paragraph(a["text"])
    rtl(body)
doc.save(DOCX)
print("docx", DOCX, len(arts))

if JS != "-":
    keep = [a for a in arts if a["number"] != 0 and (a.get("ok") or not ONLY_OK)]
    items = [
        {"id": f"{prefix}:{a['number']}", "number": a["number"], "topic": a.get("section") or title, "amended": "",
         "text": a["text"]}
        for a in keep
    ]
    js_file(
        JS,
        ([
            f"{app_name}.",
            "",
            "SOURCE: maqam.najah.edu/legislation/158 (Al-Najah legislation database), the site the lawyer's PDF was",
            "printed from. Every article was checked automatically against the lawyer's PDF (2026-11-18): 151 match",
            "letter for letter; 4 differ only by the site's note («حكم قضائي»), the next chapter's title, or «الله»",
            "printed as one glyph. Diacritics removed. Do NOT edit article text by hand; tests fingerprint it.",
        ] if LAW == "mj" else [
            f"{app_name}.",
            "",
            "SOURCE: the PDF the owner's lawyer gave on 2026-11-18. Its text layer is broken (font mapping), so the",
            "text was transcribed from the page images and every article was then checked automatically against",
            "the PDF's text layer (letters the font confuses are compared as one class). Only articles that match",
            "exactly are in this file; the others wait for review (docs/reports). Do NOT edit article text by hand.",
            "tests/law-integrity.test.js fingerprints it.",
        ]),
        name_const,
        app_name,
        arr_const,
        items,
    )
    print("js", JS, len(items), "of", len(arts))
