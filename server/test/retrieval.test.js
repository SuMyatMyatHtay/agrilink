import { test } from "node:test";
import assert from "node:assert/strict";
import { retrieve, referenceText } from "../src/modules/assistant/retrieval.js";
import { detectLang } from "../src/modules/assistant/basic.js";
test("assistant retrieval selects bounded source passages and handles insufficient evidence", () => {
  const refs = retrieve("irrigation water during flowering");
  assert.ok(refs.length > 0 && refs.length <= 3);
  assert.ok(refs.some(r => /irrigation/i.test(r.text)));
  assert.ok(refs.every(r => r.kind === "curated_prototype_guide"));
  assert.match(referenceText(refs), /GUIDE-/);
  assert.match(referenceText(retrieve("xyzzyplugh")), /No relevant guide passage/);
  assert.equal(detectLang("ਮੈਨੂੰ ਪਾਣੀ ਕਦੋਂ ਦੇਣਾ ਚਾਹੀਦਾ ਹੈ?"), "pa");
});
