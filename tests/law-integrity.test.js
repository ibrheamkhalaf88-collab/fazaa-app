import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { ARTICLES } from "../src/data/law/index.js";

/**
 * The law text must stay verbatim. These fingerprints were taken from the verified copy
 * (checked against maqam.najah.edu). If you edit an article ON PURPOSE (e.g. a new
 * amendment), re-verify against the source, then update the hash here in the same commit.
 */
const FINGERPRINTS = {
  15: "30c4c9e3cacf644f",
  16: "567a604cd76d37d1",
  22: "2ffa80cacdf02250",
  52: "f1ef3d34fbb810d7",
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
    assert.match(a.url, /^https:\/\/maqam\.najah\.edu\//, a.id);
    assert.ok(a.topic.length > 3, a.id);
  }
  assert.deepEqual(
    Object.keys(FINGERPRINTS).sort(),
    Object.keys(ARTICLES).sort(),
    "fingerprint missing for an article",
  );
});
