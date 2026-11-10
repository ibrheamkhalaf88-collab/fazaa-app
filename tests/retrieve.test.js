import assert from "node:assert/strict";
import { test } from "node:test";
import { retrieveArticles } from "../src/ai/retrieve.js";
import { ARTICLES } from "../src/data/law/index.js";

const ids = (q) => retrieveArticles(q, ARTICLES).map((a) => a.id);

test("blackmail question retrieves article 15", () => assert.ok(ids("حدا عم يبتزني").includes("15")));
test("leaked images retrieve article 22", () => assert.ok(ids("حدا نشر صوري بدون إذني").includes("22")));
test("minor adds article 52", () => assert.ok(ids("بنتي عمرها 15 وعم يبتزوها").includes("52")));
test("off-topic question retrieves nothing (so the model is never asked)", () =>
  assert.deepEqual(ids("كيف بطبخ مقلوبة"), []));
test("family-law questions retrieve nothing: that law is not in the corpus", () =>
  assert.deepEqual(ids("طليقي ما بدفع نفقة"), []));
test("never returns more than the limit", () =>
  assert.ok(retrieveArticles("ابتزاز نشر صور بنتي 15 إباحي", ARTICLES, 2).length <= 2));

test("a law that applies to one region is never retrieved for the other", async () => {
  const { articlesFor } = await import("../src/data/law/index.js");
  const wbOnly = {
    x1: { id: "x1", topic: "نفقة الزوجة", text: "نفقة الزوجة على زوجها", regions: ["ps-wb"] },
  };
  const forRegion = (r) =>
    Object.fromEntries(Object.entries(wbOnly).filter(([, a]) => a.regions.includes(r)));
  assert.equal(retrieveArticles("نفقة الزوجة على زوجها", forRegion("ps-wb")).length, 1);
  assert.equal(retrieveArticles("نفقة الزوجة على زوجها", forRegion("ps-gaza")).length, 0);
  assert.deepEqual(Object.keys(articlesFor("ps-gaza")).sort(), Object.keys(articlesFor("ps-wb")).sort());
});
