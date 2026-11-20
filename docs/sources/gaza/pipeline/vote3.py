"""Third reading: majority vote per word between the current final text (Tesseract x2, reconciled, hand fixes)
and a third independent reading. Usage: vote3.py <scratch> <law>

For every place where the final text and reading 3 differ:
  - same after removing diacritics/punctuation/hamza  -> keep the final text
  - reading 3 is supported by Tesseract pass 1 or 2 (same words with the same neighbours) and the final text is
    not supported by both of them  -> take reading 3 (2 readings against 1)
  - the final text is supported by both Tesseract passes -> keep it (2 against 1)
  - a word fixed by hand (manual_fixes.py) is never changed
  - otherwise -> «review»
Writes gaza/<law>.final.json in place (fields: text, vote_changes, vote_open) and prints counts.
"""
import difflib, json, re, sys

O, LAW = sys.argv[1], sys.argv[2]
sys.stdout.reconfigure(encoding="utf-8")
S = O + "/gaza"
F = json.load(open(f"{S}/{LAW}.final.json", encoding="utf-8"))
A = json.load(open(f"{S}/{LAW}.verified.json", encoding="utf-8"))
B = json.load(open(f"{S}/{LAW}.verified.ocr2.json", encoding="utf-8"))
C = json.load(open(f"{S}/{LAW}.verified.ocr3.json", encoding="utf-8"))
sys.path.insert(0, O)
import importlib.util
spec = importlib.util.spec_from_file_location("mf", O + "/manual_fixes.py")
MANUAL_SRC = open(O + "/manual_fixes.py", encoding="utf-8").read()
manual_words = set(re.findall(r'\("[^"]+", "([^"]+)"\)', MANUAL_SRC))

DIAC = re.compile("[ً-ْٰـ]")
HAMZA = str.maketrans("أإآؤئ", "اااوي")


def norm(w):
    return DIAC.sub("", re.sub(r"[^ء-ي0-9]", "", w)).translate(HAMZA)


def toks(t):
    return [w for w in re.findall(r"\S+", t)]


def seq(t):
    return " " + " ".join(norm(w) for w in toks(t) if norm(w)) + " "


import verify3 as v3
v3.LAW["name"] = LAW
_sp = json.load(open(f"{S}/{LAW}.split.json", encoding="utf-8"))
STREAM = v3.sk(_sp["head"] + " " + " ".join(_sp["texts"]), False)


def in_pdf(ws):
    k = v3.sk(" ".join(ws), True)
    return len(k) >= 3 and k in STREAM


def heading_words(key):
    """Titles printed after this article (any reading) and the next article's section: never article text."""
    nxt = str(int(key) + 1)
    parts = []
    for R in (A, B, C):
        parts += R.get(key, {}).get("heading_after", [])
        parts.append(R.get(nxt, {}).get("section", ""))
    return seq(" ".join(parts))


def locate(texts):
    starts, cur = {}, 0
    for n in sorted(texts):
        s_ = v3.sk(texts[n], True)
        for off in range(0, max(1, len(s_) - 14), 7):
            probe = s_[off:off + 14]
            if len(probe) < 10:
                break
            i = STREAM.find(probe, cur)
            if i != -1 and i - cur < 6000:
                starts[n] = max(i - off, cur)
                cur = starts[n] + 1
                break
    return starts


STARTS = locate({int(k): x["text"] for k, x in F.items() if int(k) > 0})


def segment(n):
    if n not in STARTS:  # e.g. an article both Tesseract passes dropped: search between its neighbours
        prev = [m for m in STARTS if m < n]
        return segment(max(prev)) if prev else ""
    later = [STARTS[m] for m in STARTS if m > n]
    return STREAM[max(0, STARTS[n] - 5):min(later) if later else len(STREAM)]


def fits_here(ws, n, current_text):
    """The words' letters occur in THIS article's part of the PDF more often than in our current text."""
    k = v3.sk(" ".join(ws), True)
    if len(k) < 3:
        return False
    seg = segment(n)
    return seg.count(k) > v3.sk(current_text, True).count(k)


changes = opened = 0
for k, v in F.items():
    if int(k) == 0 or k not in C:
        continue
    f, c = toks(v["text"]), toks(C[k]["text"])
    sa, sb = seq(A.get(k, {}).get("text", "")), seq(B.get(k, {}).get("text", ""))
    fn, cn = [norm(w) for w in f], [norm(w) for w in c]
    sm = difflib.SequenceMatcher(None, fn, cn, autojunk=False)
    out, vchg, vopen = [], [], []
    for op, i1, i2, j1, j2 in sm.get_opcodes():
        if op == "equal":
            out += f[i1:i2]
            continue
        wf, wc = f[i1:i2], c[j1:j2]
        if [x for x in fn[i1:i2] if x] == [x for x in cn[j1:j2] if x]:
            out += wf
            continue
        if any(w in manual_words for w in wf):
            out += wf
            continue
        left = " ".join(x for x in fn[max(0, i1 - 2):i1] if x)
        right = " ".join(x for x in fn[i2:i2 + 2] if x)
        ctx = lambda ws: " " + " ".join(x for x in [left, " ".join(norm(w) for w in ws if norm(w)), right] if x) + " "
        cf, cc = ctx(wf), ctx(wc)
        sup_f = (cf in sa) + (cf in sb)
        sup_c = (cc in sa) + (cc in sb)
        heads = heading_words(k)
        f_is_heading = bool(wf) and (" " + " ".join(norm(w) for w in wf if norm(w)) + " ") in heads
        if not wc:  # reading 3 lacks words: delete only a chapter title, or junk that is not in the PDF
            checkable = len(v3.sk(" ".join(wf), True)) >= 3  # «من», «مع»: too short to look up in the PDF
            if f_is_heading or (checkable and not in_pdf(wf)):
                vchg.append(f"removed «{' '.join(wf)}» ({'title' if f_is_heading else 'not in the PDF'})")
            else:
                out += wf
            continue
        if not wf or f_is_heading:  # the final text lacks words reading 3 has: add them if THIS article in the PDF has them
            if fits_here(wc, int(k), v["text"]):
                out += wc
                vchg.append(f"added «{' '.join(wc)}» (in the PDF)" + (f", removed title «{' '.join(wf)}»" if wf else ""))
            else:
                out += wf
                if wc:
                    vopen.append(f"reading 3 has «{' '.join(wc)}», not found in the PDF")
            continue
        if sup_c == sup_f and fits_here(wc, int(k), v["text"]) != fits_here(wf, int(k), ""):  # tie: the PDF decides
            out += wc if fits_here(wc, int(k), v["text"]) else wf
            if fits_here(wc, int(k), v["text"]):
                vchg.append(f"«{' '.join(wf)}» -> «{' '.join(wc)}» (PDF)")
            continue
        if sup_c >= 1 and sup_f < 2 and sup_c >= sup_f:
            out += wc
            vchg.append(f"«{' '.join(wf)}» -> «{' '.join(wc)}»")
        elif sup_f >= 1:
            out += wf
        else:
            out += wf
            vopen.append(f"«{' '.join(wf)}» / reading 3: «{' '.join(wc)}»")
    new = " ".join(out)
    if new != v["text"]:
        changes += 1
    v["text"] = new
    v["vote_changes"] = vchg
    v["vote_open"] = vopen
    opened += bool(vopen)
json.dump(F, open(f"{S}/{LAW}.final.json", "w", encoding="utf-8"), ensure_ascii=False, indent=0)
print(LAW, "articles changed by the vote:", changes, "| articles with an open difference:", opened)
