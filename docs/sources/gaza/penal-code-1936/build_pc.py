"""Apply the appendix amendments (1937-1984) to the penal code 1936 main text. Every edit must match exactly once."""
import json, re
main = json.load(open("pc_main.json", encoding="utf-8"))
AP = [l.split("| ", 1)[1].rstrip("\n") for l in open("appendix.txt", encoding="utf-8")]


def lines(a, b):  # 1-based, inclusive
    return " ".join(AP[a - 1:b])


def clean(t):
    t = re.sub(r"\s+", " ", t).strip()
    t = re.sub(r'^"', "", t)
    t = re.sub(r'"(\.?)$', r"\1", t).strip()  # closing quote of the amending text; keep its full stop
    return t


def grab(start, end):
    i = next(k for k, l in enumerate(AP) if l.startswith(start))
    j = next(k for k in range(i + 1, len(AP)) if AP[k].startswith(end))
    return clean(" ".join(AP[i:j]))


L37 = "قانون العقوبات (المعدل) رقم 37 لسنة 1937"
L39 = "قانون العقوبات (المعدل) رقم 59 لسنة 1939"
L44a = "قانون العقوبات (المعدل) رقم 21 لسنة 1944"
L44b = "قانون العقوبات (المعدل) (نمرة 2) رقم 41 لسنة 1944"
P44 = "قانون مراقبة سلوك المجرمين رقم 42 لسنة 1944"
L46 = "قانون العقوبات (المعدل) رقم 57 لسنة 1946"
L47 = "قانون العقوبات (المعدل) رقم 1 لسنة 1947"
O150 = "الأمر رقم 150 لسنة 1968 (قطاع غزة وشمالي سيناء)"
O742 = "الأمر رقم 742 لسنة 1982 (قطاع غزة وشمالي سيناء)"
O852 = "الأمر رقم 852 لسنة 1984 (منطقة قطاع غزة)"

ART, ORDER = {}, []
for a in main:
    t = re.sub(r"\s*تطبيقات قضائية\s*$", "", a["text"]).strip()
    if a["number"] == "391":
        t = t[: t.index("14 كانون الأول سنة 1936")].strip()
    ART[a["number"]] = {"number": a["number"], "topic": a["title"], "section": a["section"], "text": t, "notes": [], "open": []}
    ORDER.append(a["number"])


def note(n, law, how="عُدّلت"):
    s = f"{how} بموجب {law}"
    if s not in ART[n]["notes"]:
        ART[n]["notes"].append(s)


def rep(n, old, new, law):
    # the main text keeps printed tanween (ً) after alef; the amendment quotes may not
    t = ART[n]["text"]
    pat = re.compile("".join(re.escape(ch) + ("ً?" if ch == "ا" else "") for ch in old))
    c = len(pat.findall(t))
    assert c == 1, f"{n}: {c} x «{old}»"
    ART[n]["text"] = pat.sub(lambda m: new, t)
    note(n, law)


def full(n, text, law):
    ART[n]["text"] = text
    note(n, law, "استُعيض عن نصّها")


def add(after, number, topic, text, law):
    idx = ORDER.index(after)
    ART[number] = {"number": number, "topic": topic, "section": ART[after]["section"], "text": text,
                   "notes": [f"أُضيفت بموجب {law}"], "open": []}
    ORDER.insert(idx + 1, number)


def strip_label(t, pat):
    out = re.sub(pat, "", t, count=1).strip()
    assert out != t.strip(), f"label not found: {pat}"
    return out


# 1937
full("105", strip_label(grab('"المادة 105', "قانون العقوبات (المعدل)"), r"^المادة 105\s*"), L37)
# 1939
defs = grab('وتشمل لفظة "استورد"', "المادة (3)")
istawrad, matbu = defs.split(' وتشمل لفظة "مطبوع"')
matbu = 'وتشمل لفظة "مطبوع"' + matbu
rep("5", ' وتشمل عبارة "الاجراءات القضائية"', " " + istawrad + ' وتشمل عبارة "الاجراءات القضائية"', L39)
rep("5", ' وتعني لفظة "علانية"', " " + matbu + ' وتعني لفظة "علانية"', L39)
rep("33", "جرم يستوجب عقوبة الحبس مدة ثلاث سنوات أو أكثر", "جناية", L39)
rep("33", "ذلك الجرم أو إتمامه", "تلك الجناية أو إتمامها", L39)
rep("42", "(2)اذا أدين شخص", "(2) (أ) اذا أدين شخص", L39)
rep("42", "من المادة 41 من هذا القانون. (3)", "من المادة 41 من هذا القانون. " + grab("(ب) إذا اقتضت محكمة", "المادة (5)") + " (3)", L39)
full("59", strip_label(grab("المادة 59 –", "المادة (6)"), r"^المادة 59 –\s*"), L39)
t60 = ART["60"]["text"]
i2, i3, i5 = t60.index("(2)"), t60.index("(3)"), t60.index("(5)")
ART["60"]["text"] = t60[:i2] + grab("(2) لدى الفصل", "ج. تلغى الفقرة (5)") + " " + t60[i3:i5] + grab("(5) لا يعتبر الفعل", "المادة (7)")
note("60", L39)
ART["60"]["open"].append("حذف لفظة «من» من السطرين الثالث والرابع من الفقرة (1) بموجب القانون 59/1939 لم يُطبَّق لأن موضعها غير محدد")
t226 = ART["226"]["text"]
j = t226.index("(2)")
ART["226"]["text"] = "(1) " + strip_label(grab('"أ. إذا تسببت امرأة', "ب. تحذف عبارة"), r"^أ\.\s*") + " " + t226[j:]
note("226", L39)
rep("226", "طفل مولود حديثا", "طفل يقل عمره عن اثني عشر شهرا", L39)
ART["369"]["notes"].append(f"عُدّلت بموجب {L39}، والنص هنا قبل ذلك التعديل")
ART["369"]["open"].append("عُدّلت بموجب القانون 59/1939 (تسليم المسكوكات إلى أقرب مركز بوليس)، والنص هنا قبل التعديل لأن العبارة المحذوفة لا تطابق النص المطبوع")
# 1944 (21)
add("66", "66 مكررة (أ)", "حمل الأسلحة غير المشروعة", strip_label(grab('"المادة 66 مكررة', "المادة 4"), r"^المادة 66 مكررة \(أ\)\s*"), L44a)
rep("315", "(ب) دوّن قيدا غير صحيح في أي هذه الدفاتر أو المستندات أو الحسابات أو كان شريكا في ذلك الفعل، أو",
    grab('"(ب) دوّن قيدا', "قانون العقوبات (المعدل) (نمرة 2)"), L44a)
# 1944 (41)
rep("5", 'ويقصد بعبارة "موظف في الخدمة العامة" كل شخص', 'ويقصد بعبارة "موظف في الخدمة العامة" أو "الموظف العمومي" كل شخص', L44b)
full("106", strip_label(clean(lines(174, 180)), r"^المادة 106-\s*"), L44b)
full("107", strip_label(clean(lines(182, 188)), r"^المادة 107-\s*"), L44b)
full("108", strip_label(clean(lines(189, 195)), r"^المادة 108-\s*"), L44b)
full("109", strip_label(clean(lines(196, 200)), r"^المادة 109-\s*"), L44b)
add("109", "109 مكررة (أ)", "قبول الموظف العمومي شيئا ذا قيمة دون عوض",
    strip_label(clean(lines(201, 208)), r"^المادة 109- مكررة \(أ\)\s*"), L44b)
add("109 مكررة (أ)", "109 مكررة (ب)", "إخضاع الموظف العمومي شخصا للعنف أو تهديده لانتزاع اعتراف",
    strip_label(clean(lines(209, 214)), r"^المادة 19- مكررة \(ب\)\s*"), L44b)
rep("113", "قد تضر", "قد تؤثر", L44b)
full("195", strip_label(grab("المادة 195-", "المادة 6"), r"^المادة 195-\s*"), L44b)
rep("258", "تعريضه لأذى بليغ", "تعريضه لأذى بليغ أو لمواقعة غير مشروعة أو مزاولة البغاء", L44b)
rep("258", "للأذى البليغ", "للأذى البليغ أو لمواقعة غير مشروعة أو مزاولة البغاء", L44b)
rep("258", "لمثل هذا الأذى", "لمثل هذا الأذى أو المواقعة غير المشروع، أو مزاولة البغاء", L44b)
full("385", strip_label(grab("المادة 385-(1)", "قانون مراقبة سلوك"), r"^المادة 385-"), L44b)
# probation law 1944, schedule 2
rep("37", " أو مثول المتهم أمام المحكمة للحكم عليه.", ". (و) يوضع بمقتضى أمر مراقبة تحت اشراف مراقب السلوك.", P44)
REPEALED = {"46": P44}
# 1946
full("3", strip_label(clean(lines(550, 560)), r"^المادة 3-\s*"), L46)
add("36", "36 مكررة (أ)", "تطبيق الفصل", strip_label(grab("المادة 36- مكررة", "المادة 4-"), r"^المادة 36- مكررة \(أ\)\s*"), L46)
rep("42", " ينطبق على أحكام هذا القانون أو على أحكام أي تشريع آخر،", "،", L46)
rep("42", "الا اذا نص القانون صراحة على غير ذلك. (2)",
    "الا اذا نص القانون صراحة على غير ذلك. " + grab('"(1) مكررة (أ)', "(3) يعدل البند") + " (2)", L46)
t42 = ART["42"]["text"]
s = t42.index("اذا أدين شخص بارتكاب جرم فللمحكمة")
e = t42.index("الحد الأقصى المبين في الجدول التالي") + len("الحد الأقصى المبين في الجدول التالي")
ART["42"]["text"] = t42[:s] + grab('"إذا حكم على شخص أدين', "(4) إن كل أمر") + t42[e:]
for n in ("110", "111", "112"):
    rep(n, "(1) ", "", L46)
    rep(n, " (2) لا تقام الدعوى بمقتضى هذه المادة إلا من قبل النائب العام أو بموافقته.", "", L46)
rep("131", "قانون تسوية الأراضي", "قانون (تسوية حقوق ملكية) الأراضي", L46)
rep("164", "إذا أدين مستأجر منزل لسماحه عن علم منه باستعمال المنزل أو أي قسم منه كبيت للبغاء",
    "إذا أدين مستأجر منزل لتهيئته بيتا للبغاء في ذلك المنزل أو في أي قسم منه أو لتولي إدارته أو لاشتغاله في إدارته"
    " أو مساعدته في إدارته أو لسماحه عن علم منه باستعمال المنزل أو أي قسم منه كبيت للبغاء أو اعتياد البغاء فيه", L46)
rep("193", "كانت بغيا وتصرفت", "تصرف", L46)
full("345", strip_label(grab("المادة 345 كل من", "المادة 10-"), r"^المادة 345\s*"), L46)
rep("388", "من الأموال فيما يتعلق", "من الأموال المنقولة فيما يتعلق", L46)
add("388", "388 مكررة (أ)", "أحكام بشأن الأموال غير المنقولة",
    strip_label(grab("المادة 388 مكررة", "قانون العقوبات (المعدل)"), r"^المادة 388 مكررة \(أ\) -\s*"), L46)
# 1947
full("181", strip_label(grab("تلغى المادة 181 من", "أمر رقم 150"), r"^.*?المادة 181\s*"), L47)
# Gaza military orders
rep("311", "مدة ستة أشهر أو بغرامة قدرها خمسون جنيها", "مدة سنتين أو بغرامة قدرها ألفا ليرة", O150)
add("285", "285 أ", "استعمال مركبة بدون إذن", strip_label(grab("285 أ -", "مادة 2-"), r"^285 أ -\s*"), O742)
rep("270", "سنة واحدة", "ثلاث سنوات", O852)

out = []
for n in ORDER:
    if n in REPEALED:
        continue
    a = ART[n]
    out.append({"number": a["number"], "topic": a["topic"], "section": a["section"],
                "text": re.sub(r"\s+", " ", a["text"]).strip(),
                "amended": "، ثم ".join(a["notes"]) if a["notes"] else "", "open": a["open"]})
json.dump(out, open("pc_final.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("articles:", len(out), "amended:", sum(1 for a in out if a["amended"]),
      "open:", [(a["number"], a["open"]) for a in out if a["open"]])
