import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const code = ts.transpileModule(readFileSync(new URL("../src/native.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

function host(pinFallbackLevel) {
  const notices = [], listeners = new Map();
  const document = { title: "note" };
  let allowed = true;
  const original = {
    id: 3, alpha: 1, pinned: false, spaces: false, visible: true,
    bounds: { x: 10, y: 20, width: 400, height: 300 },
    getTitle: () => document.title, isDestroyed: () => false,
    getOpacity() { return this.alpha; }, setOpacity(value) { this.alpha = value; },
    isAlwaysOnTop() { return this.pinned; }, setAlwaysOnTop(value) { this.pinned = value; },
    isVisibleOnAllWorkspaces() { return this.spaces; }, setVisibleOnAllWorkspaces(value) { this.spaces = value; },
    isVisible() { return this.visible; }, isMinimized: () => false, isFocused: () => true,
    show() { this.visible = true; }, hide() { this.visible = false; }, restore() {}, focus() {},
    showInactive() { this.visible = true; },
    getNormalBounds() { return { ...this.bounds }; }, setBounds(value) { this.bounds = { ...this.bounds, ...value }; },
    on(name, callback) { listeners.set(name, callback); }, removeListener(name) { listeners.delete(name); },
  };
  const unrelated = { id: 1, alpha: 0.9, pinned: true, getTitle: () => "main" };
  const remote = {
    BrowserWindow: { getAllWindows: () => [unrelated, original] },
    screen: { getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 2000, height: 1200 } }) },
  };
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports, crypto: { randomUUID },
    require: name => name === "obsidian" ? {
      Notice: class { constructor(message) { notices.push(message); } }, Platform: { isLinux: false },
    } : { remote },
  });
  const native = new module.exports.SpikeNative(() => {}, undefined, pinFallbackLevel);
  return { native, original, unrelated, document, notices, listeners,
    allow(value) { allowed = value; }, bind() { return native.bind(document, () => allowed); } };
}

test("release restores only applied values on the originally bound window", () => {
  const h = host(); assert.equal(h.bind(), true);
  h.native.opacity(0.4); h.native.pin(true); h.native.allSpaces(true);
  h.native.restoreBounds({ x: 80, y: 90, width: 500, height: 450 });
  h.native.release(); h.native.release();
  assert.equal(h.original.alpha, 1); assert.equal(h.original.pinned, false); assert.equal(h.original.spaces, false);
  assert.deepEqual(h.original.bounds, { x: 10, y: 20, width: 400, height: 300 });
  assert.equal(h.unrelated.alpha, 0.9); assert.equal(h.unrelated.pinned, true);
});

test("release preserves later external changes rather than overwriting them", () => {
  const h = host(); h.bind(); h.native.opacity(0.4); h.native.pin(true);
  h.native.restoreBounds({ x: 80, y: 90, width: 500, height: 450 });
  h.original.alpha = 0.7; h.original.pinned = false; h.original.bounds.x = 123;
  h.native.release();
  assert.equal(h.original.alpha, 0.7); assert.equal(h.original.pinned, false); assert.equal(h.original.bounds.x, 123);
});

test("ownership loss blocks native actions and stale bounds callbacks, even after rebind", () => {
  const h = host(), captures = []; h.bind(); h.native.opacity(0.4);
  const stop = h.native.watchBounds(value => captures.push(value));
  const stale = h.listeners.get("move");
  h.allow(false); h.native.toggle(); stale();
  assert.equal(h.original.visible, true); assert.equal(h.original.alpha, 1); assert.equal(captures.length, 0);
  h.allow(true); h.bind(); h.native.opacity(0.4); stale(); stop();
  assert.equal(captures.length, 0);
  h.native.release();
});

test("missing snapshot getters disable only the affected feature before changing it", () => {
  const h = host(); delete h.original.getOpacity; h.bind();
  assert.equal(h.native.opacity(0.4), false); assert.equal(h.original.alpha, 1);
  assert.equal(h.native.pin(true), true);
  assert.ok(h.notices.some(message => message.includes("Opacity")));
  h.native.release(); assert.equal(h.original.pinned, false);
});

test("a partially failed setter is still rolled back and does not block other cleanup", () => {
  const h = host(); h.bind(); h.native.pin(true);
  const setter = h.original.setOpacity;
  h.original.setOpacity = function(value) { setter.call(this, value); if (value === 0.4) throw Error("after write"); };
  assert.equal(h.native.opacity(0.4), false);
  h.native.release(); assert.equal(h.original.alpha, 1); assert.equal(h.original.pinned, false);
});

test("a rollback failure disables further application instead of skipping later cleanup silently", () => {
  const h = host(); h.bind(); h.native.opacity(0.4);
  const setter = h.original.setOpacity;
  h.original.setOpacity = function(value) { if (value === 1) throw Error("reset refused"); setter.call(this, value); };
  h.native.release();
  h.original.setOpacity = setter; h.original.alpha = 1;
  h.bind(); assert.equal(h.native.opacity(0.4), false); assert.equal(h.original.alpha, 1);
  assert.equal(h.native.pin(true), true); h.native.release(); assert.equal(h.original.pinned, false);
});

test("a getter that reveals ownership loss cannot be followed by a hide", () => {
  const h = host(); h.bind(); h.original.isFocused = () => { h.allow(false); return true; };
  h.native.toggle(); assert.equal(h.original.visible, true);
});

test("releasing a hidden window shows only that original window without taking focus", () => {
  const h = host(); let focusCalls = 0;
  h.original.focus = () => { focusCalls++; };
  h.original.show = () => { throw Error("must use inactive restore"); };
  h.bind(); h.native.toggle(); assert.equal(h.original.visible, false);
  h.allow(false); h.native.release();
  assert.equal(h.original.visible, true); assert.equal(focusCalls, 0);
  assert.equal(h.unrelated.alpha, 0.9);
});

test("pin retries with the configured level when Electron ignores its default", () => {
  const h = host("pop-up-menu");
  const calls = [];
  h.original.setAlwaysOnTop = function(value, level) {
    calls.push([value, level]);
    if (!value || level === "pop-up-menu") this.pinned = value;
  };
  h.bind();
  assert.equal(h.native.pin(true), true);
  assert.equal(h.original.pinned, true);
  assert.deepEqual(calls, [[true, undefined], [true, "pop-up-menu"]]);
  h.native.release();
  assert.equal(h.original.pinned, false);
});

test("pin reports failure when a window manager ignores the request", () => {
  const h = host();
  h.original.setAlwaysOnTop = () => {};
  h.bind();
  assert.equal(h.native.pin(true), false);
  assert.ok(h.notices.some(message => message.includes("Pin disabled")));
  assert.equal(h.native.opacity(0.7), true);
});
