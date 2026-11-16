import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const code = ts.transpileModule(readFileSync(new URL("../src/native.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

function host(pinFallbackLevel, mac = false) {
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
    fullScreenable: true, isFullScreenable() { return this.fullScreenable; }, setFullScreenable(value) { this.fullScreenable = value; },
    isVisible() { return this.visible; }, isMinimized: () => false, isFocused: () => true,
    show() { this.visible = true; }, hide() { this.visible = false; }, restore() {}, focus() {},
    showInactive() { this.visible = true; },
    getNormalBounds() { return { ...this.bounds }; }, setBounds(value) { this.bounds = { ...this.bounds, ...value }; },
    min: [0, 0], getMinimumSize() { return [...this.min]; }, setMinimumSize(width, height) { this.min = [width, height]; },
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
      Notice: class { constructor(message) { notices.push(message); } }, Platform: { isLinux: false, isMacOS: mac },
    } : { remote },
  });
  const native = new module.exports.PopNoteNative(() => {}, undefined, pinFallbackLevel);
  return { native, original, unrelated, document, notices, listeners, remote,
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

test("a minimum window size is applied, small saved bounds are raised to it, and release undoes it", () => {
  const h = host(); h.bind(); h.native.minimumSize();
  assert.deepEqual(h.original.min, [340, 160]);
  h.native.restoreBounds({ x: 80, y: 90, width: 120, height: 50 });
  assert.equal(h.original.bounds.width, 340); assert.equal(h.original.bounds.height, 160);
  h.native.release();
  assert.deepEqual(h.original.min, [0, 0]); assert.deepEqual(h.unrelated.min, undefined);
  assert.deepEqual(h.notices, []);
});

test("a missing minimum-size API disables only that feature", () => {
  const h = host(); delete h.original.setMinimumSize; h.bind(); h.native.minimumSize();
  assert.ok(h.notices.some(message => message.includes("Minimum window size")));
  assert.equal(h.native.pin(true), true); h.native.release(); assert.equal(h.original.pinned, false);
});

test("hide-if-visible hides a visible window that is not focused, as a tray click needs; show never hides", () => {
  const h = host(); h.bind(); h.original.isFocused = () => false;
  h.native.toggle(); assert.equal(h.original.visible, true, "a shortcut press only refocuses an unfocused window");
  h.native.toggle("hide-if-visible"); assert.equal(h.original.visible, false);
  h.native.toggle("hide-if-visible"); assert.equal(h.original.visible, true);
  h.original.isFocused = () => true; h.native.toggle("show"); assert.equal(h.original.visible, true, "show never hides, even when focused");
  h.native.release();
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

test("opacity reports failure when the compositor ignores the value", () => {
  const h = host();
  h.original.setOpacity = () => {};
  h.bind();
  assert.equal(h.native.opacity(0.71), false);
  assert.equal(h.original.alpha, 1);
  assert.ok(h.notices.some(message => message.includes("Opacity disabled")));
  assert.equal(h.native.pin(true), true);
});

test("on macOS the window cannot become a full-screen window, and release undoes it; elsewhere nothing changes", () => {
  const h = host(undefined, true); h.bind(); h.native.keepOutOfFullScreen();
  assert.equal(h.original.fullScreenable, false);
  h.native.release(); assert.equal(h.original.fullScreenable, true); assert.deepEqual(h.notices, []);
  const other = host(); other.bind(); other.native.keepOutOfFullScreen();
  assert.equal(other.original.fullScreenable, true);
});

test("a missing full-screen API disables only that feature on macOS", () => {
  const h = host(undefined, true); delete h.original.setFullScreenable; h.bind(); h.native.keepOutOfFullScreen();
  assert.ok(h.notices.some(message => message.includes("Full screen guard")));
  assert.equal(h.native.pin(true), true);
});

test("toggle reports what it did, so the caller can put the typing cursor in the note after a show", () => {
  const h = host(); h.bind();
  assert.equal(h.native.toggle(), "hidden"); assert.equal(h.original.visible, false);
  assert.equal(h.native.toggle(), "shown"); assert.equal(h.original.visible, true);
  h.original.isFocused = () => false;
  assert.equal(h.native.toggle(), "focused");
  assert.equal(h.native.toggle("hide-if-visible"), "hidden");
});

test("on macOS a show or focus activates the app and raises the window; a failure there changes nothing", () => {
  const h = host(undefined, true); h.bind();
  let stolen = 0, raised = 0; h.remote.app = { focus: (options) => { if (options?.steal) stolen++; } };
  h.original.moveTop = () => { raised++; };
  h.original.visible = false; assert.equal(h.native.toggle(), "shown");
  assert.deepEqual([stolen, raised], [1, 1]);
  h.original.isFocused = () => false; assert.equal(h.native.toggle(), "focused");
  assert.deepEqual([stolen, raised], [2, 2]);
  h.remote.app = { focus() { throw new Error("no"); } }; h.original.moveTop = () => { throw new Error("no"); };
  h.original.isFocused = () => false; assert.equal(h.native.toggle(), "focused"); assert.deepEqual(h.notices, []);
});
