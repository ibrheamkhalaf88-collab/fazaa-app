"""Checker v3: compare a clean reading with the broken PDF text using ONLY the letters these fonts print
reliably. Unreliable letters (ل م ا أ إ آ ء ى ق ش ث ض and their broken stand-ins) are dropped on both sides."""
import difflib, re
DIAC = re.compile("[\u064b-\u0652\u0670\u0656-\u065f]")
KEEP = {"ه": "H", "ي": "H", "و": "H", "ئ": "H", "ؤ": "H", "ة": "T", "غ": "T", "ن": "N", "ف": "N", "ؼ": "N",
        "ك": "K", "ؾ": "K", "ب": "B", "ت": "B", "ج": "J", "ح": "J", "خ": "J", "د": "D", "ذ": "D", "ر": "R", "ز": "R",
        "س": "S", "ص": "S", "ط": "Z", "ظ": "Z", "ع": "E"}
LAW = {"name": "hn"}

def sk(text, clean):
    t = DIAC.sub("", text)
    if not clean:
        t = t.replace("\u063b", "")
        if LAW["name"] == "hn":
            t = t.replace("ى", "ه")
    if LAW["name"] == "sp":
        t = t.replace("غ", "").replace("ة", "ه") if True else t
    t = re.sub(r"[^\u0621-\u064a\u063b-\u063f\u0640]", "", t)
    return "".join(KEEP.get(c, "") for c in t)

def check(clean_text, broken_text, ctx=12):
    a, b = sk(clean_text, True), sk(broken_text, False)
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    return [(op, a[i1:i2], b[j1:j2]) for op, i1, i2, j1, j2 in sm.get_opcodes() if op != "equal"]
