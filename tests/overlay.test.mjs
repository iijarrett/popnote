import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { domHost } from "./dom-host.mjs";

function host(options = {}) {
  const dom = domHost(), { document, fire } = dom, timers = new Map(), calls = [];
  let timer = 0, allowed = true;
  const parent = document.createElement("section"), note = document.createElement("textarea"), root = document.createElement("div");
  document.body.append(parent); parent.append(note, root); root.className = "popnote-overlay"; note.focus();
  const file = new URL("../src/overlay.ts", import.meta.url);
  const source = existsSync(file) ? readFileSync(file, "utf8") : "";
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, crypto: { randomUUID },
    setTimeout: fn => { const id = ++timer; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id) });
  const overlay = new module.exports.OverlayControls(root, "Welcome.md", false, 0.4, {
    allowed: () => allowed,
    pin: value => { calls.push(["pin", value]); return options.pin !== false; },
    opacity: value => { calls.push(["opacity", value]); return options.opacity !== false; },
    close: () => calls.push(["close"]),
  });
  overlay.setNativeAvailability(true, true);
  const recovery = dom.label(root, "Show PopNote controls"), bar = dom.label(root, "PopNote controls");
  const pin = dom.label(root, "Keep PopNote on top"), opacity = dom.label(root, "Window opacity"), close = dom.label(root, "Close PopNote");
  const range = dom.label(root, "Opacity");
  const trigger = dom.all(root).find(element => element.className === "popnote-overlay-trigger");
  return { ...dom, overlay, root, parent, note, bar, recovery, pin, opacity, close, range, trigger, timers, calls,
    release() { allowed = false; }, tick() { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); },
    moveToNote() { fire(note, "pointermove"); },
  };
}

test("hover reveal preserves note nodes and has an always-available accessible recovery button", () => {
  const h = host(); assert.equal(h.bar.hidden, true); assert.equal(h.recovery.hidden, false);
  assert.equal(h.recovery.type, "button");
  assert.equal(h.range.value, "0.4"); assert.equal(h.range.min, "0.3"); assert.equal(h.range.max, "1"); assert.equal(h.range.step, "0.1");
  h.fire(h.trigger, "pointerenter"); assert.equal(h.bar.hidden, false);
  assert.equal(h.document.activeElement, h.note, "hover must not steal editor focus");
  h.moveToNote(); assert.equal(h.bar.hidden, true);
  assert.deepEqual(h.parent.children, [h.note, h.root]); assert.equal(h.note.parentNode, h.parent);
  assert.deepEqual(h.calls, []);
});

test("focus and panel interaction keep controls visible; Escape returns focus without intercepting Tab", () => {
  const h = host(); h.recovery.focus(); assert.equal(h.bar.hidden, false);
  h.pin.focus(); h.moveToNote(); assert.equal(h.bar.hidden, false);
  h.fire(h.opacity, "click"); assert.equal(h.opacity.getAttribute("aria-expanded"), "true");
  assert.equal(h.document.activeElement, h.range);
  h.moveToNote(); assert.equal(h.bar.hidden, false);
  assert.equal(h.fire(h.range, "keydown", { key: "Tab" }).defaultPrevented, false);
  h.fire(h.range, "keydown", { key: "Escape" });
  assert.equal(h.opacity.getAttribute("aria-expanded"), "false"); assert.equal(h.document.activeElement, h.opacity);
  h.fire(h.opacity, "keydown", { key: "Escape" });
  assert.equal(h.document.activeElement, h.note); assert.equal(h.bar.hidden, true);
  assert.equal(h.fire(h.note, "keydown", { key: "Tab" }).defaultPrevented, false);
});

test("slider pointer use and movement remain visible until interaction ends", () => {
  const h = host(); h.overlay.recover(); h.fire(h.opacity, "click");
  h.fire(h.range, "pointerdown", { pointerId: 9 }); h.note.focus(); h.moveToNote(); h.tick();
  assert.equal(h.bar.hidden, false);
  h.fire(h.window, "pointerup", { pointerId: 9 }); h.fire(h.note, "pointerdown"); h.moveToNote();
  assert.equal(h.bar.hidden, true);
  h.fire(h.trigger, "pointerenter"); h.overlay.movement(); h.moveToNote();
  assert.equal(h.bar.hidden, false); h.tick(); assert.equal(h.bar.hidden, false, "a pause in native dragging is not an end event");
  h.moveToNote(); assert.equal(h.bar.hidden, true);
});

test("native drag area can stay revealed without relying on pointer events from the handle", () => {
  const h = host(); h.fire(h.trigger, "pointerenter");
  h.overlay.movement(); h.tick(); assert.equal(h.bar.hidden, false);
  h.moveToNote(); assert.equal(h.bar.hidden, true);
});

test("pin, existing-range opacity and close delegate only while exclusively owned", () => {
  const h = host(); h.overlay.recover(); h.fire(h.pin, "click");
  assert.equal(h.pin.getAttribute("aria-pressed"), "true");
  h.range.value = "0.5"; h.fire(h.range, "input"); h.fire(h.close, "click");
  assert.deepEqual(h.calls, [["pin", true], ["opacity", 0.5], ["close"]]);
  const stale = h.range.listeners.get("input")[0].fn;
  h.release(); h.fire(h.pin, "click"); stale({ target: h.range });
  assert.equal(h.root.isConnected, false); assert.equal(h.listenerCount(), 0);
  assert.deepEqual(h.calls, [["pin", true], ["opacity", 0.5], ["close"]]);
});

test("failed native controls revert and disable only the unavailable control", () => {
  const h = host({ opacity: false }); h.overlay.recover(); h.range.value = "0.5"; h.fire(h.range, "input");
  assert.equal(h.range.value, "0.4"); assert.equal(h.range.disabled, true); assert.equal(h.pin.disabled, false);
  h.fire(h.pin, "click"); assert.equal(h.pin.getAttribute("aria-pressed"), "true");
});

test("recovery does not focus an inactive window, and disposal removes listeners and delayed work", () => {
  const h = host(); h.document.focused = false; h.overlay.recover(true);
  assert.equal(h.document.activeElement, h.note); assert.equal(h.bar.hidden, false);
  h.overlay.movement(); const late = [...h.timers.values()][0];
  h.overlay.dispose(); h.overlay.dispose(); late(); h.overlay.recover(true);
  assert.equal(h.root.isConnected, false); assert.equal(h.listenerCount(), 0); assert.equal(h.timers.size, 0);
  assert.deepEqual(h.parent.children, [h.note]); assert.deepEqual(h.calls, []);
});
