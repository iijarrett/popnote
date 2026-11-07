import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import vm from "node:vm";
import ts from "typescript";

export function loadCompatibility() {
  const source = readFileSync(new URL("../src/workspace-compat.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, structuredClone, crypto: { randomUUID } });
  return module.exports;
}
export const ownedId = "popnote-owned-v1:11111111-1111-4111-8111-111111111111";
export const leaf = (id, file = "Welcome.md") => ({ id, type: "leaf", state: { type: "markdown", state: { file } } });
export const tabs = (id, children, currentTab = 0) => ({ id, type: "tabs", children, currentTab });
export const win = (id, children) => ({ id, type: "window", children, x: 100, y: 150, width: 500, height: 450 });
export function fixture() {
  return {
    main: { id: "main", type: "split", children: [tabs("main-tabs", [leaf("main-note")])], direction: "vertical" },
    floating: { id: "floats", type: "floating", children: [
      win("owned-window", [tabs("owned-tabs", [leaf(ownedId)])]),
      win("ordinary-window", [tabs("ordinary-tabs", [leaf("same-note"), leaf("other-note", "Other.md")], 1)]),
    ] },
    active: ownedId, lastOpenFiles: ["Welcome.md"], extensionData: { untouched: [1, 2] },
  };
}
