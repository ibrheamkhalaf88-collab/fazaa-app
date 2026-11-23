/**
 * SEPARATION of the law boxes (owner, 2026-11-21): West Bank sharia, West Bank nizami, Gaza sharia, Gaza nizami
 * (and Gaza general rules) are kept fully apart. These tests guard the structure (one law, one box), the ids, what
 * each region can see, what reaches the model for each court, and the reply checks, so a law added later cannot
 * leak into another region or court by mistake. See docs/LAW-INTAKE.md.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { test } from "node:test";
import { ALL_BOX_LAWS, ARTICLES, articlesFor, CORPORA, hasLawTexts, LAWS } from "../src/data/law/index.js";
import { findArticleByNumber, lawScope, otherRegionLaw, regionMarks } from "../src/ai/legal.js";
import { keepCourtsApart, retrieveArticles } from "../src/ai/retrieve.js";
import { articleTag } from "../server/ai-proxy/worker.js";

const LAW_DIR = new URL("../src/data/law/", import.meta.url);
const REGION_DIRS = { "ps-gaza": "gaza", "ps-wb": "wb" };

test("one box per region and court, each box is its own folder", () => {
  const pairs = CORPORA.map((c) => `${c.region}/${c.court}`);
  assert.equal(new Set(pairs).size, pairs.length, "two boxes for the same region and court");
  assert.equal(new Set(CORPORA.map((c) => c.key)).size, CORPORA.length);
  for (const c of CORPORA) {
    assert.equal(c.folder, `${REGION_DIRS[c.region]}/${c.court}`, c.key);
    assert.ok(statSync(new URL(`${c.folder}/index.js`, LAW_DIR)).isFile(), `${c.folder}/index.js`);
  }
  // every folder on disk is a declared box: no law file can sit outside the registry
  for (const region of Object.values(REGION_DIRS))
    for (const court of readdirSync(new URL(`${region}/`, LAW_DIR)))
      assert.ok(
        CORPORA.some((c) => c.folder === `${region}/${court}`),
        `src/data/law/${region}/${court} is not a box in corpora.js`,
      );
});

test("the four boxes the owner asked for exist: West Bank sharia and nizami, Gaza sharia and nizami", () => {
  for (const [region, court] of [
    ["ps-wb", "sharia"],
    ["ps-wb", "nizami"],
    ["ps-gaza", "sharia"],
    ["ps-gaza", "nizami"],
  ])
    assert.ok(
      CORPORA.some((c) => c.region === region && c.court === court),
      `${region} ${court}`,
    );
});

test("a box's files import only from their own box (no Gaza file reused in the West Bank, or the reverse)", () => {
  for (const c of CORPORA) {
    const dir = new URL(`${c.folder}/`, LAW_DIR);
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".js"))) {
      const src = readFileSync(new URL(file, dir), "utf8");
      for (const [, path] of src.matchAll(/(?:^|\n)\s*(?:import|export)[^"'\n]*from\s+["']([^"']+)["']/g))
        assert.ok(path.startsWith("./") && !path.includes(".."), `${c.folder}/${file} imports ${path}`);
    }
  }
});

test("every law takes its region and court from its box, and has exactly one region", () => {
  for (const law of ALL_BOX_LAWS) {
    const box = CORPORA.find((c) => c.key === law.corpus);
    assert.ok(box, law.key);
    assert.deepEqual(law.regions, [box.region], law.key);
    assert.equal(law.court, box.court, law.key);
  }
});

test("law keys, id prefixes and article ids are unique across ALL boxes; ids carry their law's prefix", () => {
  const keys = ALL_BOX_LAWS.map((l) => l.key);
  assert.equal(new Set(keys).size, keys.length, "duplicate law key");
  const prefixes = ALL_BOX_LAWS.map((l) => l.prefix);
  assert.equal(new Set(prefixes).size, prefixes.length, "duplicate prefix");
  for (const p of prefixes) assert.match(p, /^[a-z]+:$/, p);
  // no prefix is the start of another («gz:» and «gzp:» are fine, «g:» and «gz:» are not distinct enough to read)
  const seen = new Set();
  for (const law of ALL_BOX_LAWS)
    for (const a of law.articles) {
      assert.ok(a.id.startsWith(law.prefix), `${a.id} in ${law.key} does not start with ${law.prefix}`);
      assert.ok(!seen.has(a.id), `duplicate id ${a.id}`);
      seen.add(a.id);
    }
});

test("West Bank prefixes start with «w», Gaza prefixes never do", () => {
  for (const law of ALL_BOX_LAWS)
    if (law.regions[0] === "ps-wb") assert.match(law.prefix, /^w/, law.key);
    else assert.doesNotMatch(law.prefix, /^w/, law.key);
});

test("only active boxes reach the app; the West Bank boxes are ready and empty", () => {
  for (const law of LAWS) assert.equal(CORPORA.find((c) => c.key === law.corpus).status, "active", law.key);
  for (const key of ["wb-sharia", "wb-nizami"])
    assert.equal(CORPORA.find((c) => c.key === key).status, "awaiting-texts", key);
  assert.equal(hasLawTexts("ps-wb"), false);
  assert.equal(Object.keys(articlesFor("ps-wb")).length, 0);
  assert.ok(hasLawTexts("ps-gaza"));
});

test("a region sees only its own boxes", () => {
  for (const region of ["ps-gaza", "ps-wb"]) {
    const boxes = new Set(CORPORA.filter((c) => c.region === region).map((c) => c.key));
    for (const a of Object.values(articlesFor(region)))
      if (!a.added) assert.ok(boxes.has(a.corpus), `${a.id} (${a.corpus}) seen in ${region}`);
  }
});

test("every built-in article knows its court and box (the model is told which court applies it)", () => {
  for (const a of Object.values(ARTICLES)) {
    if (a.added) continue;
    assert.ok(["sharia", "nizami", "general"].includes(a.court), a.id);
    assert.ok(a.corpus, a.id);
  }
  const tag = articleTag(ARTICLES["gz:59"]);
  assert.match(tag, /court="sharia courts/);
  assert.match(tag, /region="Gaza Strip"/);
  assert.match(articleTag(ARTICLES["cy:15"]), /court="regular courts/);
});

/* ---------- the courts stay apart in retrieval: a nizami text added later for Gaza (e.g. the penal code) ---------- */

// a stand-in for a future Gaza penal-code article, sharing words with family topics on purpose
const FAKE_PENAL = {
  id: "tpc:333",
  number: "333",
  topic: "الإيذاء والضرب",
  text: "كل من ضرب زوجته او اولاده او حضانه الولاد او النفقه او اعتدى عليهم يعاقب بالحبس",
  keywords: "بيضربني ضرب ضربني حضانه نفقه صوري",
  url: "",
  amended: "",
  court: "nizami",
  regions: ["ps-gaza"],
  corpus: "gaza-nizami",
};
const FAKE_SHARIA = {
  id: "tsh:9",
  number: "9",
  topic: "نشر الصور",
  text: "اذا نشر الزوج صور زوجته او هددها بنشر صورها جاز لها طلب التفريق",
  keywords: "صوري ينشر بنشر يبتزني",
  url: "",
  amended: "",
  court: "sharia",
  regions: ["ps-gaza"],
  corpus: "gaza-sharia",
};
const withFakes = () => ({
  ...articlesFor("ps-gaza"),
  [FAKE_PENAL.id]: FAKE_PENAL,
  [FAKE_SHARIA.id]: FAKE_SHARIA,
});
const courts = (list) => new Set(list.map((a) => a.court).filter((c) => c !== "general"));

test("a family question never gets a nizami text, even one sharing its words", () => {
  for (const q of ["مين الأحق بحضانة الولاد", "زوجي ما بدفع نفقة", "بدي أطلق من زوجي", "شو حصتي من الورثة"]) {
    const got = retrieveArticles(q, withFakes(), 4);
    assert.ok(!got.some((a) => a.id === FAKE_PENAL.id), `${q} -> ${got.map((a) => a.id)}`);
    assert.deepEqual([...courts(got)], ["sharia"], q);
  }
});

test("a blackmail question never gets a sharia text, even one sharing its words", () => {
  const got = retrieveArticles("معه صوري وبيبتزني بدو مصاري وإلا بنشرهم", withFakes(), 4);
  assert.ok(got.length, "nothing retrieved");
  assert.ok(!got.some((a) => a.id === FAKE_SHARIA.id), got.map((a) => a.id).join(","));
  assert.deepEqual([...courts(got)], ["nizami"]);
});

test("violence touches both courts: both may come, each still tagged with its own court", () => {
  // within the usual limit: the courts take turns, so the long divorce list cannot crowd out the nizami text
  // (2026-11-23) the real penal code 1936 is in now: its assault article comes, not the stand-in
  const got = retrieveArticles("جوزي بيضربني كل يوم وبدي أطلق", withFakes(), 4);
  assert.ok(
    got.some((a) => a.id === "pc:248" && a.court === "nizami"),
    got.map((a) => a.id).join(","),
  );
  assert.ok(
    got.some((a) => a.court === "sharia"),
    got.map((a) => a.id).join(","),
  );
  const scope = lawScope(got.filter((a) => ARTICLES[a.id]).map((a) => a.id));
  assert.ok(scope.length);
});

test("keepCourtsApart: no topic -> the leading court, plus only strong matches of the other", () => {
  const list = [
    { id: "a", court: "sharia" },
    { id: "b", court: "nizami" },
    { id: "c", court: "nizami" },
    { id: "d", court: "general" },
  ];
  const score = new Map([
    ["a", 5],
    ["b", 2],
    ["c", 4],
    ["d", 2],
  ]);
  assert.deepEqual(
    keepCourtsApart(list, new Set(), score).map((x) => x.id),
    ["a", "c", "d"],
  );
  assert.deepEqual(
    keepCourtsApart(list, new Set(["nizami"]), score).map((x) => x.id),
    ["b", "c", "d"],
  );
  assert.deepEqual(
    keepCourtsApart(list, new Set(["nizami", "sharia"]), score).map((x) => x.id),
    ["a", "b", "d", "c"], // turns: sharia, nizami, general, then the rest
  );
});

/* ---------- replies: the court line and the other-region check ---------- */

test("texts of two courts are named each with its own court under the reply", () => {
  const lines = lawScope(["gz:97", "cy:15"]);
  assert.match(lines[0], /محكمتين مختلفتين/);
  assert.ok(lines.some((l) => /حقوق العائلة/.test(l) && /المحاكم الشرعية/.test(l)));
  assert.ok(lines.some((l) => /الجرائم الإلكترونية/.test(l) && /المحاكم النظامية/.test(l)));
  // one court: one line, no per-law split
  assert.match(lawScope(["gz:59", "hn:395"])[0], /^هالنصوص بتطبقها المحاكم الشرعية بقطاع غزة\.$/);
});

test("a law put in a West Bank box makes its marks wrong in a Gaza reply, with no code change", () => {
  const wbLaw = { regions: ["ps-wb"], marks: ["1976", "قانون الاحوال الشخصيه الاردني"] };
  const gazaLaw = { regions: ["ps-gaza"], marks: ["1954"] };
  const forGaza = regionMarks([wbLaw, gazaLaw], "ps-gaza");
  const hit = (text, marks) => marks.some((re) => re.test(text));
  assert.ok(hit(" قانون سنه 1976 ", forGaza));
  assert.ok(hit(" قانون الاحوال الشخصيه الاردني ", forGaza));
  assert.ok(!hit(" قانون 1954 ", forGaza), "a Gaza law must not be wrong in a Gaza reply");
  const forWb = regionMarks([wbLaw, gazaLaw], "ps-wb");
  assert.ok(hit(" قانون 1954 ", forWb));
  assert.ok(!hit(" قانون 1976 ", forWb));
  // and the live check already rejects the known West Bank laws for Gaza, and Gaza laws for the West Bank
  assert.ok(otherRegionLaw("حسب قانون الأحوال الشخصية لسنة 1976", "ps-gaza"));
  assert.ok(otherRegionLaw("حسب قانون حقوق العائلة لسنة 1954", "ps-wb"));
  assert.equal(otherRegionLaw("حسب قانون حقوق العائلة لسنة 1954", "ps-gaza"), "");
});

test("asked by name, a law the region does not have yet gets an honest «not in my texts»", () => {
  for (const q of [
    "شو بتقول المادة 33 من قانون الطفل",
    "المادة 20 من القانون الأساسي",
    "المادة 5 من قانون البينات",
  ]) {
    const r = findArticleByNumber(q, "ps-gaza");
    assert.ok(r?.missing, q);
    assert.equal(r.found.length, 0, q);
  }
});
