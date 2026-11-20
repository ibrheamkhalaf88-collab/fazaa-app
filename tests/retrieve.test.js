import assert from "node:assert/strict";
import { test } from "node:test";
import { retrieveArticles } from "../src/ai/retrieve.js";
import { ARTICLES } from "../src/data/law/index.js";

const ids = (q) => retrieveArticles(q, ARTICLES).map((a) => a.id);

test("blackmail retrieves article 15 of the cyber-crimes decree-law (from the lawyer's file)", () =>
  assert.ok(ids("حدا عم يبتزني").includes("cy:15")));
test("leaked pictures retrieve article 22, a minor adds article 72 (was 52)", () => {
  assert.ok(ids("حدا نشر صوري بدون إذني").includes("cy:22"));
  assert.ok(ids("بنتي عمرها 15 وعم يبتزوها").includes("cy:72"));
});
test("an unpaid maintenance judgment retrieves the sharia enforcement law", () =>
  assert.ok(
    ids("طليقي ما بيدفع النفقة اللي حكمت فيها المحكمة، بقدر احبسه؟").some((id) => id.startsWith("ex:")),
  ));
test("an absent or jailed husband retrieves the Gaza articles on separation for absence", () => {
  assert.ok(ids("زوجي غايب من سنتين").includes("gz:94"));
  assert.ok(ids("زوجي مسجون").includes("gz:96"));
});
test("off-topic question retrieves nothing (so the model is never asked)", () =>
  assert.deepEqual(ids("كيف بطبخ مقلوبة"), []));
test("a maintenance question retrieves the family-law articles, never the cyber-crime ones", () => {
  const got = ids("زوجي ما بدفع نفقة");
  assert.ok(got.includes("gz:59"));
  assert.ok(got.every((id) => id.startsWith("gz:")));
});
test("never returns more than the limit", () =>
  assert.ok(retrieveArticles("ابتزاز نشر صور بنتي 15 إباحي", ARTICLES, 2).length <= 2));

test("a law that applies to one region is never retrieved for the other", async () => {
  const { articlesFor } = await import("../src/data/law/index.js");
  const wb = (q) => retrieveArticles(q, articlesFor("ps-wb")).map((a) => a.id);
  const gz = (q) => retrieveArticles(q, articlesFor("ps-gaza")).map((a) => a.id);
  assert.deepEqual(wb("بدي أطلق من زوجي"), []); // West Bank texts come back after the lawyer's review
  assert.ok(gz("بدي أطلق من زوجي").every((id) => !id.startsWith("psl:")));
  assert.ok(gz("بدي أطلق من زوجي").some((id) => id.startsWith("gz:")));
});
