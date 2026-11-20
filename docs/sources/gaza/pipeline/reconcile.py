"""Reconcile two OCR readings of one law, word by word, using the lawyer's broken text layer as the referee.

Usage: reconcile.py <scratch> <law: hn|sp>
Inputs : gaza/<law>.verified.json (OCR pass 1), gaza/<law>.verified.ocr2.json (pass 2), gaza/<law>.split.json
Output : gaza/<law>.final.json {n: {text, section, status, notes}}
status «agreed»   both readings identical, and no large gap against the text layer
       «resolved» they differed; at every difference one reading matched the text layer and was taken
       «review»   a difference the referee could not settle, or a large gap (a possibly dropped line)
"""
import difflib
import json
import re
import sys

SCR, LAW = sys.argv[1], sys.argv[2]
sys.path.insert(0, SCR)
import verify3 as v3  # noqa: E402

v3.LAW["name"] = LAW
sys.stdout.reconfigure(encoding="utf-8")
S = SCR + "/gaza"
A = json.load(open(f"{S}/{LAW}.verified.json", encoding="utf-8"))
B = json.load(open(f"{S}/{LAW}.verified.ocr2.json", encoding="utf-8"))
_split = json.load(open(f"{S}/{LAW}.split.json", encoding="utf-8"))
STREAM = v3.sk(_split["head"] + " " + " ".join(_split["texts"]), False)


def locate_all(arts):
    """Start of each article's reliable-letter skeleton in STREAM, found by its first letters, in order."""
    starts, cur = {}, 0
    for n in sorted(arts):
        s_ = v3.sk(arts[n], True)
        for off in range(0, max(1, len(s_) - 14), 7):  # any 14-letter window of the article
            probe = s_[off:off + 14]
            if len(probe) < 10:
                break
            i = STREAM.find(probe, cur)
            if i != -1 and i - cur < 6000:
                starts[n] = max(i - off, cur)
                cur = starts[n] + 1
                break
    return starts
DIAC = re.compile("[ً-ْٰـ]")


def toks(t):
    return re.findall(r"\S+", t)


def sk(words, clean=True):
    return v3.sk(" ".join(words), clean)


def segment(n):
    if n not in STARTS:
        return None
    later = [STARTS[m] for m in STARTS if m > n]
    return STREAM[STARTS[n]:min(later) if later else len(STREAM)]


def big_gap(text, n):
    """A run of 4+ reliable letters on one side only = a word or line missing from the OCR (or extra)."""
    seg = segment(n)
    if seg is None:
        return [("unlocated", "", "")]
    a = v3.sk(text, True)
    sm = difflib.SequenceMatcher(None, a, seg, autojunk=False)
    d = [(op, a[i1:i2], seg[j1:j2]) for op, i1, i2, j1, j2 in sm.get_opcodes() if op != "equal"]
    return [x for x in d if max(len(x[1]), len(x[2])) >= 4]


import collections
FREQ = collections.Counter(w for x in list(A.values()) + list(B.values()) for w in toks(x["text"]))
STARTS = locate_all({int(k): x["text"] for k, x in A.items() if int(k) > 0})
PUNCT = re.compile(r"[^ء-ي0-9]")
final, counts = {}, {"agreed": 0, "resolved": 0, "review": 0}
for k in sorted(set(A) | set(B), key=int):
    n = int(k)
    a, b = A.get(k), B.get(k)
    if not a or not b:
        one = a or b
        final[k] = {"number": n, "text": one["text"], "section": one.get("section", ""), "status": "review",
                    "notes": ["only one reading found this article"]}
        counts["review"] += 1
        continue
    ta, tb = toks(a["text"]), toks(b["text"])
    notes, out, settled = [], [], True
    ref = segment(n) or ""
    sm = difflib.SequenceMatcher(None, ta, tb, autojunk=False)
    for op, i1, i2, j1, j2 in sm.get_opcodes():
        if op == "equal":
            out += ta[i1:i2]
            continue
        wa, wb = ta[i1:i2], tb[j1:j2]
        if [PUNCT.sub("", w) for w in wa if PUNCT.sub("", w)] == [PUNCT.sub("", w) for w in wb if PUNCT.sub("", w)]:
            out += wa  # punctuation only
            continue
        HAMZA = str.maketrans("أإآؤئ", "اااوي")
        bare = lambda ws: [DIAC.sub("", PUNCT.sub("", w)).translate(HAMZA) for w in ws if PUNCT.sub("", w)]
        if bare(wa) == bare(wb):  # hamza / diacritics only: keep the spelling with the hamza
            out += wa if sum(c in "أإآؤئ" for c in "".join(wa)) >= sum(c in "أإآؤئ" for c in "".join(wb)) else wb
            continue
        if not wa or not wb:  # OCR drops words far more often than it invents them: keep the words
            out += wa or wb
            notes.append(f"kept words only one reading has: «{' '.join(wa or wb)}»")
            continue
        sa, sb = sk(wa), sk(wb)
        # referee: which candidate's reliable letters occur in the text layer around here?
        ina = (sa in ref) if sa else not (sb and sb in ref)  # an empty side loses to a found text
        inb = (sb in ref) if sb else not (sa and sa in ref)
        fa = min((FREQ[w] for w in wa), default=0)
        fb = min((FREQ[w] for w in wb), default=0)
        if ina and inb and wa and wb and len(wa) == len(wb) == 1 and max(fa, fb) >= 3 and max(fa, fb) >= 3 * max(1, min(fa, fb)):
            out += wa if fa > fb else wb  # one spelling is common in the law, the other is a one-off misreading
            continue
        if sa == sb:  # differ only in unreliable letters (ل/م/ا/ق…): keep pass 1, flag if it changes a word
            out += wa
            if [DIAC.sub("", w) for w in wa] != [DIAC.sub("", w) for w in wb]:
                notes.append(f"«{' '.join(wa)}» / «{' '.join(wb)}»")
                settled = False
        elif ina and not inb:
            out += wa
        elif inb and not ina:
            out += wb
        else:
            out += wa
            notes.append(f"«{' '.join(wa)}» / «{' '.join(wb)}»")
            settled = False
    text = " ".join(out)
    gaps = big_gap(a.get("caption", "") + " " + text + " " + " ".join(a.get("heading_after", [])), n)  # the layer has the titles too
    if gaps:
        settled = False
        notes += [f"gap {g[0]}: {g[1] or ''}→{g[2] or ''}" for g in gaps[:3]]
    status = "agreed" if not notes and not gaps and sm.ratio() > 0.999 else ("resolved" if settled else "review")
    counts[status] += 1
    final[k] = {"number": n, "text": text, "section": a.get("section", ""), "caption": a.get("caption", ""), "status": status, "notes": notes}
json.dump(final, open(f"{S}/{LAW}.final.json", "w", encoding="utf-8"), ensure_ascii=False, indent=0)
print(LAW, counts)
