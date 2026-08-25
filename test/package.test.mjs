import assert from "node:assert/strict";
import test from "node:test";
import extension from "../index.ts";

test("exports an extension factory", () => {
  assert.equal(typeof extension, "function");
});
