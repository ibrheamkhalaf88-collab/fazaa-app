# Transcribing law pages from images

You are transcribing a Palestinian law (Arabic) from the PAGE IMAGES of a PDF. The PDF's hidden text layer is
broken (wrong letters), so NEVER copy text from the text layer: read the rendered page images only. When you
Read a chunk PDF, each page comes with an image; use the image.

The text goes into a legal-help app and will be checked word by word against the original, so accuracy is
everything. A changed word, a missing «لا», a wrong number or an added «و» is a serious error.

## Rules
1. Copy EXACTLY what is printed: same words, same order, same spelling (keep the original's typos), same
   numbers, same punctuation as far as it is visible. Do not correct, modernise, summarise or complete anything.
2. Do NOT add diacritics (harakat). Write the text without tashkeel, except tanween fath (ً) when it is printed
   (e.g. «تصريحاً»). If the page is fully vocalised (Majalla), drop ALL the vocalisation marks.
3. One article = its number (from the image: «المادة (12)» / «مادة 12») and its full text. Join the printed
   lines with single spaces. Keep paragraph numbers or letters inside an article as printed («1-», «أ-»).
4. Leave OUT of the article text: page numbers, running headers/footers, book/part/chapter/section titles
   («الباب الأول», «الفصل الثاني», «القسم الأول», a heading line such as «النكاح وشروطه»), and any database
   notes such as «حكم قضائي واحد» / «8 أحكام قضائية» (Majalla). Put the CURRENT chapter/section heading in the
   separate field "section" instead (the nearest heading printed above the article; same as the previous
   article if none).
5. Transcribe every article whose heading «المادة (N)» is printed on one of YOUR pages (given in your task).
   If its text continues past your last page, open the next chunk (or use the overlap page) and finish it.
   An article that started BEFORE your first page is not yours: skip its tail at the top of your first page.
6. If a word is genuinely unreadable, write your best reading followed by «[؟]». Never invent a word silently.
7. Work page by page, carefully. After each chunk, append your articles to the output file so nothing is lost.

## Output
A UTF-8 JSON file (path given in your task):
```
{"law": "<key>", "pages": "<first>-<last>", "articles": [
  {"number": 1, "section": "النكاح وشروطه", "text": "تجوز خطبة المرأة الخالية عن نكاح وعدة."},
  ...
]}
```
Write it with Python (json.dump(..., ensure_ascii=False, indent=1)), not by hand-escaping. Articles in order,
numbers as integers, each exactly once. At the end, report: how many articles, first and last number, and every
place where you wrote «[؟]».
