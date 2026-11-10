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
test("a maintenance question retrieves the family-law articles, never the cyber-crime ones", () => {
  const got = ids("زوجي ما بدفع نفقة");
  assert.ok(got.includes("psl:73"));
  assert.ok(!got.some((id) => ["15", "16", "22", "52"].includes(id)));
});
test("never returns more than the limit", () =>
  assert.ok(retrieveArticles("ابتزاز نشر صور بنتي 15 إباحي", ARTICLES, 2).length <= 2));

test("a law that applies to one region is never retrieved for the other", async () => {
  const { articlesFor } = await import("../src/data/law/index.js");
  const wb = (q) => retrieveArticles(q, articlesFor("ps-wb")).map((a) => a.id);
  const gz = (q) => retrieveArticles(q, articlesFor("ps-gaza")).map((a) => a.id);
  assert.ok(wb("بدي أطلق من زوجي").every((id) => !id.startsWith("gz:")));
  assert.ok(gz("بدي أطلق من زوجي").every((id) => !id.startsWith("psl:")));
  assert.ok(gz("بدي أطلق من زوجي").some((id) => id.startsWith("gz:")));
});
