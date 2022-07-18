import assert from "node:assert/strict";
import test from "node:test";
import { addHook } from "../../index.js";
import { sayHi } from "./say-hi.mjs";

addHook((url, exported) => {
  if (url.toLowerCase().endsWith("say-hi.mts")) {
    exported.sayHi = () => "Hooked";
  }
});

test("Hook a module", async () => {
  assert.equal(sayHi("test"), "Hooked");
});
