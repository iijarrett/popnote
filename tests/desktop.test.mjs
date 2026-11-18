import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/desktop.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const module = { exports: {} };
vm.runInNewContext(code, { module, exports: module.exports });
const reopen = module.exports.shouldReopenOnThisDesktop;
const state = (over) => ({ visible: true, minimized: false, focused: false, ...over });

test("an unreadable window state never forces a reopen", () => {
  assert.equal(reopen(undefined, false), false);
});

test("a hidden or minimized window is reopened so it lands on this desktop", () => {
  assert.equal(reopen(state({ visible: false }), false), true);
  assert.equal(reopen(state({ minimized: true }), true), true);
});

test("a visible window that is showing here is left to the normal hide or raise", () => {
  assert.equal(reopen(state({ focused: true }), true), false);
  assert.equal(reopen(state({ focused: false }), true), false);
});

test("a visible window that is not showing is on another desktop and is reopened, even if it still reports focus", () => {
  assert.equal(reopen(state({ focused: false }), false), true);
  assert.equal(reopen(state({ focused: true }), false), true);
});
