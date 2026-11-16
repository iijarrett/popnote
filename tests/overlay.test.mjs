import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { domHost } from "./dom-host.mjs";

const settle = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

function host(options = {}) {
  const dom = domHost(), { document, fire } = dom, calls = [];
  let allowed = true;
  const parent = document.createElement("section"), note = document.createElement("textarea"), root = document.createElement("div");
  document.body.append(parent); parent.append(note, root); root.className = "popnote-overlay"; note.focus();
  const file = new URL("../src/overlay.ts", import.meta.url);
  const source = existsSync(file) ? readFileSync(file, "utf8") : "";
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, crypto: { randomUUID } });
  const overlay = new module.exports.OverlayControls(root, "Welcome.md", false, 0.4, {
    allowed: () => allowed,
    pin: value => { calls.push(["pin", value]); return options.pin !== false; },
    opacity: value => { calls.push(["opacity", value]); return options.opacity !== false; },
    notes: query => ["Welcome.md", "Plans/Trip.md", "Journal.md"].filter(path => path.toLowerCase().includes(query.toLowerCase())),
    choose: async path => { calls.push(["choose", path]); return options.choose !== false; },
    pinHint: options.pinHint,
  });
  overlay.setNativeAvailability(true, true);
  const recovery = dom.label(root, "Show PopNote controls"), bar = dom.label(root, "PopNote controls");
  const pin = dom.label(root, "Keep PopNote on top"), opacity = dom.label(root, "Window opacity");
  const range = dom.label(root, "Opacity");
  const noteButton = dom.label(root, "Choose the note to show"), search = dom.label(root, "Find a note");
  return { ...dom, overlay, root, parent, note, bar, recovery, pin, opacity, range, calls, noteButton, search,
    results: () => dom.all(root).filter(element => element.className === "popnote-overlay-result"),
    release() { allowed = false; },
    moveToNote() { fire(note, "pointermove"); },
  };
}

test("only activation reveals both controls; another activation closes them", () => {
  const h = host();
  assert.equal(h.bar.hidden, true);
  assert.equal(h.recovery.hidden, false);
  assert.equal(h.range.min, "0.3");
  assert.equal(h.range.max, "1");
  assert.equal(h.range.step, "0.01");
  h.fire(h.root, "pointerenter");
  h.fire(h.root, "pointermove");
  h.recovery.focus();
  assert.equal(h.bar.hidden, true);
  h.fire(h.recovery, "click");
  assert.equal(h.bar.hidden, false);
  assert.equal(h.recovery.getAttribute("aria-expanded"), "true");
  h.moveToNote();
  assert.equal(h.bar.hidden, false);
  h.fire(h.recovery, "click");
  assert.equal(h.bar.hidden, true);
  assert.equal(h.recovery.getAttribute("aria-expanded"), "false");
  assert.deepEqual(h.parent.children, [h.note, h.root]);
});

test("keyboard activation and Escape manage focus without intercepting Tab", () => {
  const h = host(); h.recovery.focus();
  h.fire(h.recovery, "click");
  h.pin.focus(); h.moveToNote();
  assert.equal(h.bar.hidden, false);
  h.fire(h.opacity, "click"); assert.equal(h.opacity.getAttribute("aria-expanded"), "true");
  assert.equal(h.document.activeElement, h.range);
  assert.equal(h.fire(h.range, "keydown", { key: "Tab" }).defaultPrevented, false);
  h.fire(h.range, "keydown", { key: "Escape" });
  assert.equal(h.opacity.getAttribute("aria-expanded"), "false"); assert.equal(h.document.activeElement, h.opacity);
  h.fire(h.opacity, "keydown", { key: "Escape" });
  assert.equal(h.document.activeElement, h.note); assert.equal(h.bar.hidden, true);
  assert.equal(h.fire(h.note, "keydown", { key: "Tab" }).defaultPrevented, false);
});

test("clicking outside closes both controls and the slider", () => {
  const h = host();
  h.fire(h.recovery, "click"); h.fire(h.opacity, "click");
  h.fire(h.note, "pointerdown");
  assert.equal(h.bar.hidden, true);
  assert.equal(h.opacity.getAttribute("aria-expanded"), "false");
});

test("pin, existing-range opacity delegate only while exclusively owned", () => {
  const h = host(); h.overlay.recover(); h.fire(h.pin, "click");
  assert.equal(h.pin.getAttribute("aria-pressed"), "true");
  assert.equal(h.label(h.root, "Close PopNote"), undefined);
  h.range.value = "0.57"; h.fire(h.range, "input");
  assert.deepEqual(h.calls, [["pin", true], ["opacity", 0.57]]);
  const stale = h.range.listeners.get("input")[0].fn;
  h.release(); h.fire(h.pin, "click"); stale({ target: h.range });
  assert.equal(h.root.isConnected, false); assert.equal(h.listenerCount(), 0);
  assert.deepEqual(h.calls, [["pin", true], ["opacity", 0.57]]);
});

test("failed native controls revert and disable only the unavailable control", () => {
  const h = host({ opacity: false }); h.overlay.recover(); h.range.value = "0.57"; h.fire(h.range, "input");
  assert.equal(h.range.value, "0.4"); assert.equal(h.range.disabled, true); assert.equal(h.opacity.disabled, true);
  assert.equal(h.opacity.textContent, "Opacity"); assert.equal(h.pin.disabled, false);
  h.fire(h.pin, "click"); assert.equal(h.pin.getAttribute("aria-pressed"), "true");
});

test("recovery does not focus an inactive window, and disposal removes listeners", () => {
  const h = host(); h.document.focused = false; h.overlay.recover(true);
  assert.equal(h.document.activeElement, h.note); assert.equal(h.bar.hidden, false);
  h.overlay.dispose(); h.overlay.dispose(); h.overlay.recover(true);
  assert.equal(h.root.isConnected, false); assert.equal(h.listenerCount(), 0);
  assert.deepEqual(h.parent.children, [h.note]); assert.deepEqual(h.calls, []);
});

test("the note picker lists notes, filters as you type, and Enter chooses the first match", async () => {
  const h = host(); h.fire(h.recovery, "click");
  assert.equal(h.noteButton.getAttribute("aria-expanded"), "false");
  h.fire(h.noteButton, "click");
  assert.equal(h.noteButton.getAttribute("aria-expanded"), "true");
  assert.deepEqual(h.results().map(item => item.dataset.path), ["Welcome.md", "Plans/Trip.md", "Journal.md"]);
  assert.equal(h.results()[0].textContent, "Welcome");
  assert.equal(h.document.activeElement, h.search);
  h.search.value = "trip"; h.fire(h.search, "input");
  assert.deepEqual(h.results().map(item => item.dataset.path), ["Plans/Trip.md"]);
  h.fire(h.search, "keydown", { key: "Enter" }); await settle();
  assert.deepEqual(h.calls, [["choose", "Plans/Trip.md"]]);
  assert.equal(h.noteButton.getAttribute("aria-expanded"), "false");
});

test("clicking a result chooses it, and a failed choice keeps the picker open", async () => {
  const h = host({ choose: false }); h.fire(h.recovery, "click"); h.fire(h.noteButton, "click");
  h.fire(h.results()[1], "click"); await settle();
  assert.deepEqual(h.calls, [["choose", "Plans/Trip.md"]]);
  assert.equal(h.noteButton.getAttribute("aria-expanded"), "true");
  h.search.value = "zzz"; h.fire(h.search, "input");
  assert.equal(h.results().length, 0);
});

test("the note picker and the opacity slider never open together, and Escape closes the picker first", () => {
  const h = host(); h.fire(h.recovery, "click");
  h.fire(h.opacity, "click"); assert.equal(h.opacity.getAttribute("aria-expanded"), "true");
  h.fire(h.noteButton, "click");
  assert.equal(h.opacity.getAttribute("aria-expanded"), "false");
  assert.equal(h.noteButton.getAttribute("aria-expanded"), "true");
  h.fire(h.search, "keydown", { key: "Escape" });
  assert.equal(h.noteButton.getAttribute("aria-expanded"), "false");
  assert.equal(h.bar.hidden, false);
  assert.equal(h.document.activeElement, h.noteButton);
});

test("the pin hint is added to the Pin tooltip", () => {
  const h = host({ pinHint: "Win+Tab shows it on every desktop" }); h.overlay.setNativeAvailability(true, true);
  assert.equal(h.pin.title, "Keep PopNote on top. Win+Tab shows it on every desktop");
});
