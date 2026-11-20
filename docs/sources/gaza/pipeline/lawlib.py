"""Shared helpers to turn the lawyer's PDFs into src/data/law/*.js files."""
import json
import re

BIDI = re.compile("[‪-‮‎‏﻿​-‍  ]")


def flat(text):
    text = BIDI.sub("", text).replace("\f", " ")
    return re.sub(r"\s+", " ", text).strip()


def fix_marks(t):
    """pdftotext prints RTL brackets and list numbers mirrored: «) )1» -> «(1)», «.1تطبق» -> «1. تطبق»."""
    t = re.sub(r"\)\s*\)\s*(\d+)", r"(\1)", t)  # «) )1» / «))1»
    t = re.sub(r"\(\s*\(\s*(\d+)", r"(\1)", t)
    t = re.sub(r"(^|[\s:،])\.(\d{1,2})(?=[^\d\s.])", r"\1\2. ", t)  # «.1تطبق»
    t = re.sub(r"(^|[\s:،])\.(\d{1,2})\s", r"\1\2. ", t)
    t = t.replace("‌", "")  # zero-width non-joiner before list letters
    # tanween moved before the last letter: «وفًقا» -> «وفقاً», «فوًر ا» -> «فوراً», «مؤهاًل» -> «مؤهلاً»
    TAN = "ً"
    L = "[ء-ي]"
    END = r"(?=[\s.,،؛:)]|$)"
    t = re.sub("(" + L + ")" + TAN + "(" + L + ") ?ا" + END, lambda m: m.group(1) + m.group(2) + "ا" + TAN, t)
    t = re.sub("ا" + TAN + "(" + L + ")" + END, lambda m: m.group(1) + "ا" + TAN, t)
    t = t.replace("ُأ", "أُ")
    t = re.sub("\((\d+)\)(?=[ء-ي])", lambda m: "(" + m.group(1) + ") ", t)  # «(120)يوماً»  # «ُأخرى» -> «أُخرى»
    t = re.sub(r"\s+", " ", t).strip()
    return t


def js_file(path, header_lines, name_const, name_value, arr_const, articles):
    """articles: list of dicts {id, number, topic, amended, text}."""
    j = lambda s: json.dumps(s, ensure_ascii=False)
    out = ["/**"] + [f" * {l}" if l else " *" for l in header_lines] + [" */", ""]
    out += ['/** @typedef {import("./types.js").Article} Article */', ""]
    out += [f"export const {name_const} = {j(name_value)};", ""]
    out += ["/** @type {Article[]} */", f"export const {arr_const} = ["]
    for a in articles:
        out += [
            "  {",
            f"    id: {j(a['id'])},",
            f"    number: {j(str(a['number']))},",
            f"    topic: {j(a['topic'])},",
            '    url: "",',
            f"    amended: {j(a.get('amended', ''))},",
            f"    text: {j(a['text'])},",
            "  },",
        ]
    out += ["];", ""]
    open(path, "w", encoding="utf-8").write("\n".join(out))


def check_seq(nums, first=1):
    exp = list(range(first, first + len(nums)))
    return nums == exp
