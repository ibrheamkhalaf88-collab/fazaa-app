import assert from "node:assert/strict";
import { test } from "node:test";
import { scrub } from "../server/api/scrub.js";

test("scrub removes contact details, links and handles, including Arabic digits", () => {
  assert.equal(scrub("اتصلي على 0599-123-456 الآن"), "اتصلي على [رقم] الآن");
  assert.equal(scrub("رقمي ٠٥٩٩١٢٣٤٥٦"), "رقمي [رقم]");
  assert.equal(scrub("شوفي https://a.example/x?y=1 وwww.b.org"), "شوفي [رابط] و[رابط]");
  assert.equal(scrub("مراسلة a.b@c.org"), "مراسلة [بريد]");
  assert.equal(scrub("حسابه @some_user"), "حسابه [حساب]");
});

test("scrub keeps ordinary legal text, including article numbers and short numbers", () => {
  const t = "المادة 15 من القانون رقم 10 لسنة 2018 بتعاقب بالحبس";
  assert.equal(scrub(t), t);
});
