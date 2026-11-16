import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/notes.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const module = { exports: {} };
vm.runInNewContext(code, { module, exports: module.exports });
const rankNotes = (...args) => [...module.exports.rankNotes(...args)];
const notes = [
  { path: "Journal/2026-11-15.md", modified: 5 }, { path: "Plans/Trip to Lisbon.md", modified: 9 },
  { path: "Welcome.md", modified: 1 }, { path: "Trip packing.md", modified: 7 }, { path: "Archive/Old trip.md", modified: 2 },
];

test("with no query, recent notes come first, then the most recently changed", () => {
  assert.deepEqual(rankNotes(notes, "", ["Welcome.md", "Gone.md", "Welcome.md"]).slice(0, 3),
    ["Welcome.md", "Plans/Trip to Lisbon.md", "Trip packing.md"]);
});

test("a name that starts with the query beats one that only contains it, then folder matches, then letters in order", () => {
  assert.deepEqual(rankNotes(notes, "trip", []), ["Trip packing.md", "Plans/Trip to Lisbon.md", "Archive/Old trip.md"]);
  assert.deepEqual(rankNotes(notes, "journal", []), ["Journal/2026-11-15.md"]);
  assert.deepEqual(rankNotes(notes, "wlcm", []), ["Welcome.md"]);
  assert.deepEqual(rankNotes(notes, "zzz", []), []);
});

test("results are capped at eight and matching ignores case and surrounding spaces", () => {
  const many = Array.from({ length: 20 }, (_, i) => ({ path: `Note ${i}.md`, modified: i }));
  assert.equal(rankNotes(many, "note", []).length, 8);
  assert.deepEqual(rankNotes(notes, "  WELCOME ", []), ["Welcome.md"]);
});
