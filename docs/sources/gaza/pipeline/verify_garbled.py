"""Check a clean (rewritten) article against the lawyer's broken PDF text.

The PDF's font maps several letters to the same wrong code, so the broken text cannot be turned back into the
right one. The other way works: put the clean text and the broken text into the same coarse "skeleton"
(letters that the font confuses are merged into one class, letters it drops are dropped from both), then
compare. A word changed, added or left out by whoever rewrote the text shows up as a difference.
"""
import difflib
import re

DIAC = re.compile("[ً-ْٰـٖ-ٟ]")

# classes shared by both sides (the font confuses the letters inside a class)
CLASSES = {
    "ا": "A", "أ": "", "إ": "", "آ": "",
    "ل": "L", "م": "L", "ؿ": "L", "ـ": "L", "ض": "L",
    "ه": "H", "ي": "H", "ى": "H", "و": "H", "ئ": "H", "ؤ": "H",
    "ن": "N", "ف": "N", "ؼ": "N",
    "ة": "T", "غ": "T",
    "ك": "K", "ؾ": "K",
    "ب": "B", "ت": "B",  # (dots are not trusted)
    "ج": "J", "ح": "J", "خ": "J",
    "د": "D", "ذ": "D",
    "ر": "R", "ز": "R",
    "س": "S", "ص": "S",
    "ط": "Z", "ظ": "Z",
    "ع": "E",
    "ء": "",
}
DROP = set("شثقؽ")  # letters the font drops (medial ق, ش, ث) — dropped on both sides


NON_CONNECT = set("اأإآدذرزوؤةء")  # letters that do not join the next one
LA_WORDS = {"لا": "Q", "ولا": "HQ", "إلا": "AQ", "الا": "AQ"}  # printed «ق», «وق», «إق»


def skeleton_clean(text):
    t = DIAC.sub("", text)
    t = re.sub(r"\d+", " ", t)
    words = re.findall(r"[ء-ي]+", t)
    out = []
    for w in words:
        w = w.replace("الآ", "ا")
        if w in LA_WORDS:
            out.append(LA_WORDS[w])
            continue
        # final ح / ى after a joining letter are not printed
        if len(w) > 1 and w[-1] in "حى" and w[-2] not in NON_CONNECT:
            w = w[:-1]
        s = ""
        for i, ch in enumerate(w):
            if ch == "ق":
                if i == 0 or i == len(w) - 1 or w[i - 1] in NON_CONNECT:
                    s += "Q"  # initial and final ق survive (final as «ؽ»)
                continue  # medial ق is dropped
            if ch in DROP:
                continue
            s += CLASSES.get(ch, ch)
        out.append(s)
    return "".join(out)


def skeleton_broken(text):
    t = re.sub("[ً-ْٰٖ-ٟ]", "", text).replace("ػ", "")  # keep «ـ» (= م)
    t = re.sub(r"\d+", " ", t)
    words = re.findall(r"[ء-يػ-ؿـ]+", t)
    out = []
    for w in words:
        s = ""
        for ch in w:
            if ch in "قؽ":
                s += "Q"
            elif ch == "ـ":
                s += "L"  # «ـ» stands for a final م
            elif ch in DROP:
                continue
            else:
                s += CLASSES.get(ch, ch)
        out.append(s)
    return "".join(out)


def compare(clean, broken):
    a, b = skeleton_clean(clean), skeleton_broken(broken)
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    diffs = [(op, a[i1:i2], b[j1:j2]) for op, i1, i2, j1, j2 in sm.get_opcodes() if op != "equal"]
    return sm.ratio(), diffs
