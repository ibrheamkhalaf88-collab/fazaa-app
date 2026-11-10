import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { ARTICLES } from "../src/data/law/index.js";

/**
 * The law text must stay verbatim. These fingerprints were taken from the verified copy
 * (maqam.najah.edu; Gaza articles: see src/data/law/family-rights-gaza-1954.js). If you edit an article ON PURPOSE (e.g. a new
 * amendment), re-verify against the source, then update the hash here in the same commit.
 */
const FINGERPRINTS = {
  15: "30c4c9e3cacf644f",
  16: "567a604cd76d37d1",
  22: "2ffa80cacdf02250",
  52: "f1ef3d34fbb810d7",
  "psl:38": "c8e525be4379349a",
  "psl:61": "dc0e2cca0c1eb18b",
  "psl:66": "3b04a7f609f2229f",
  "psl:67": "45c6c8fb91693ca5",
  "psl:69": "34f1acd6eb09efea",
  "psl:70": "900fbf45354d6e45",
  "psl:73": "9c5cd95ee022fce9",
  "psl:74": "5067edf7e575024a",
  "psl:79": "7a0185fcf295760b",
  "psl:101": "f2c1b563bedc005c",
  "psl:102": "90cf4e70aed5651f",
  "psl:123": "5002e3aadd44b037",
  "psl:127": "8a4715303f9dcaf0",
  "psl:130": "50d40f0310e300a4",
  "psl:132": "2b07f7d3eafb915c",
  "psl:134": "dca5d239c397dbf6",
  "psl:135": "d5d791c2c0faaf4a",
  "psl:146": "fc5782cec806efb7",
  "psl:154": "704dc889f620ed5e",
  "psl:155": "ce4ae7b48525b3e7",
  "psl:157": "a34c169a227e2a78",
  "psl:163": "1c67f42183db61d9",
  "psl:168": "447c32b06934672b",
  "gz:38": "bcca23356cb31d13",
  "gz:55": "aad0d06cf24868db",
  "gz:59": "1396da31d69cc41c",
  "gz:61": "f478d58bcddfa617",
  "gz:65": "f4433a9699573704",
  "gz:66": "41333c579d7d8b5d",
  "gz:77": "44f071fa5bb55e76",
  "gz:92": "6986fbb7518f1883",
  "gz:94": "81bb56e475da291c",
  "bl:9": "ad468b9fdf01e4e9",
  "bl:10": "2a5021b3007fe8f9",
  "bl:11": "f4dc360ab5b55069",
  "bl:13": "851c7fb45c4cb7b6",
  "bl:32": "8761ee68547d86f6",
};

for (const [id, hash] of Object.entries(FINGERPRINTS)) {
  test(`article ${id} text is unchanged`, () => {
    const a = ARTICLES[id];
    const actual = createHash("sha256").update(`${a.text}|${a.amended}`).digest("hex").slice(0, 16);
    assert.equal(actual, hash);
  });
}

test("every article has a source link and a topic", () => {
  for (const a of Object.values(ARTICLES)) {
    assert.match(a.url, /^https:\/\/(maqam\.najah\.edu|muslimfamilylawindex\.com)\//, a.id);
    assert.ok(a.topic.length > 3, a.id);
  }
  assert.deepEqual(
    Object.keys(FINGERPRINTS).sort(),
    Object.keys(ARTICLES).sort(),
    "fingerprint missing for an article",
  );
});

test("damaged PDF characters never reach the corpus", () => {
  for (const a of Object.values(ARTICLES))
    assert.ok(!a.text.includes("\uFFFD"), `${a.id} has a damaged character`);
});

test("region rules: Gaza family law only in Gaza, West Bank law only in the West Bank", async () => {
  const { articlesFor } = await import("../src/data/law/index.js");
  const wb = Object.keys(articlesFor("ps-wb"));
  const gz = Object.keys(articlesFor("ps-gaza"));
  assert.ok(wb.some((id) => id.startsWith("psl:")) && !wb.some((id) => id.startsWith("gz:")));
  assert.ok(gz.some((id) => id.startsWith("gz:")) && !gz.some((id) => id.startsWith("psl:")));
  assert.ok(wb.includes("bl:9") && gz.includes("bl:9")); // the Basic Law applies to both
});

test("every id used by the intent map exists in some law", async () => {
  const { INTENT_TO_ARTICLES } = await import("../src/data/law/index.js");
  for (const ids of Object.values(INTENT_TO_ARTICLES)) for (const id of ids) assert.ok(ARTICLES[id], id);
});
