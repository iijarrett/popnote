import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/window.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const settle = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };

function host(options = {}) {
  const timers = new Map(), observers = new Set(), listeners = new Map(), events = [];
  let nextTimer = 0, detached = 0, opened = 0, claimed = 0, released = 0, removed = 0;
  const mainDocument = { defaultView: {} };
  const popoutDocument = { createElement: () => ({ ownerDocument: popoutDocument, isConnected: false, parentElement: null,
    remove() { if (options.removeControls) options.removeControls(); removed++; this.isConnected = false; this.parentElement = null; } }) };
  const win = {
    document: popoutDocument, closed: false,
    addEventListener(name, callback) { listeners.set(name, callback); },
    removeEventListener(name) { listeners.delete(name); },
  };
  popoutDocument.defaultView = win;
  class WorkspaceWindow { constructor() { this.doc = popoutDocument; this.win = win; } }
  const container = options.mainLeaf ? { doc: mainDocument, win: mainDocument.defaultView } : new WorkspaceWindow();
  let currentContainer = container;
  const element = { ownerDocument: options.attached ? popoutDocument : mainDocument, isConnected: !!options.attached,
    append(child) { child.isConnected = this.isConnected; child.parentElement = this; },
    contains(other) { return other === this || other.parentElement === this; }, classList: { add() {}, remove() {} } };
  const leaf = {
    view: { containerEl: element, contentEl: element }, getContainer: () => currentContainer,
    async openFile() { opened++; events.push("openFile"); if (options.openGate) await options.openGate; if (options.openFails) throw Error("open failed"); },
    detach() { detached++; element.isConnected = false; win.closed = true; },
  };
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports, require: () => ({ WorkspaceWindow }),
    MutationObserver: class {
      constructor(callback) { this.callback = callback; observers.add(this); }
      observe(target) { assert.equal(target, popoutDocument); }
      disconnect() { observers.delete(this); }
    },
    setTimeout(callback) { const id = ++nextTimer; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  const leaves = [leaf];
  const app = { workspace: { containerEl: { ownerDocument: mainDocument }, openPopoutLeaf: () => leaf,
    iterateAllLeaves: callback => leaves.forEach(callback) } };
  const compatibility = {
    canOpen: () => true,
    claim(value) { assert.ok(leaves.includes(value)); claimed++; events.push("claim"); return options.claimFails !== true; },
    owns: () => claimed > released && options.claimFails !== true,
    release() { released++; return true; },
  };
  const popout = new module.exports.SpikeWindow(app, compatibility, (event, details) => events.push({ event, details }), options.onRelease);
  let second;
  if (options.tabs) {
    const tabs = { children: [leaf], currentTab: 0 };
    leaf.parent = tabs;
    app.workspace.createLeafInTabGroup = (group) => {
      assert.equal(group, tabs);
      second = { parent: tabs, view: { containerEl: { ownerDocument: popoutDocument, isConnected: true } },
        getContainer: () => container, detach() { detached++; } };
      tabs.children.push(second); leaves.push(second);
      popout.checkOwnership();
      return second;
    };
    app.workspace.setActiveLeaf = () => { tabs.currentTab = 1; };
  }
  return {
    get second() { return second; },
    popout, leaf, events, timers, observers, listeners, mainDocument, popoutDocument,
    counts: () => ({ detached, opened, claimed }), cleanup: () => ({ released, removed }),
    mix() { leaves.push({ getContainer: () => container }); },
    move(destination = "main") {
      currentContainer = destination === "main" ? { doc: mainDocument } : new WorkspaceWindow();
      if (destination !== "main") currentContainer.doc = { defaultView: {} };
      element.ownerDocument = currentContainer.doc; element.isConnected = true;
    },
    attach() { element.ownerDocument = popoutDocument; element.isConnected = true; for (const observer of [...observers]) observer.callback(); },
    timeout() { for (const callback of [...timers.values()]) callback(); },
    userClose() { win.closed = true; listeners.get("pagehide")?.(); },
  };
}

test("ownership is claimed synchronously while the view is still in the main document; return waits for attachment", async () => {
  const h = host(); let resolved = false;
  const pending = h.popout.open({ path: "Welcome.md" }).then(document => { resolved = true; return document; });
  // Handle rejections immediately so the pre-fix failure is an assertion, not an unhandled rejection.
  pending.catch(() => {});
  assert.equal(h.counts().claimed, 1);
  assert.equal(h.leaf.view.containerEl.ownerDocument, h.mainDocument);
  await settle(); assert.equal(resolved, false); assert.equal(h.popout.isOpen(), false);
  h.attach(); assert.equal(await pending, h.popoutDocument);
  assert.equal(h.popout.isOpen(), true);
  assert.equal(h.counts().detached, 0);
  assert.equal(h.observers.size, 0); assert.equal(h.timers.size, 0); assert.equal(h.listeners.size, 0);
});

test("ordinary sibling tabs release controls without detaching either tab, including on unload", async () => {
  const h = host({ attached: true }); await h.popout.open({}); h.popout.mountControls();
  h.mix(); assert.equal(h.popout.isOpen(), false);
  h.popout.close(); h.popout.close();
  assert.equal(h.counts().detached, 0);
  assert.deepEqual(h.cleanup(), { released: 1, removed: 1 });
});

for (const destination of ["main", "floating"]) {
  test(`moving into ${destination} releases controls and never detaches the moved leaf`, async () => {
    const h = host({ attached: true }); await h.popout.open({}); h.popout.mountControls();
    h.move(destination); h.popout.close();
    assert.equal(h.counts().detached, 0);
    assert.deepEqual(h.cleanup(), { released: 1, removed: 1 });
  });

  test(`moving into ${destination} during openFile cancels creation without detaching`, async () => {
    let release; const openGate = new Promise(resolve => { release = resolve; });
    const h = host({ attached: true, openGate }); const pending = assert.rejects(h.popout.open({}));
    h.move(destination); release(); await pending;
    assert.equal(h.counts().detached, 0); assert.equal(h.cleanup().released, 1);
    assert.equal(h.observers.size, 0); assert.equal(h.timers.size, 0);
  });
}

test("already attached pop-outs still open and reuse the same document", async () => {
  const h = host({ attached: true });
  assert.equal(await h.popout.open({}), h.popoutDocument);
  assert.equal(await h.popout.open({}), h.popoutDocument);
  assert.deepEqual(h.counts(), { detached: 0, opened: 1, claimed: 1 });
});

test("a genuine main-window leaf is neither marked nor opened nor detached", async () => {
  const h = host({ mainLeaf: true });
  await assert.rejects(h.popout.open({}), /separate pop-out/);
  assert.deepEqual(h.counts(), { detached: 0, opened: 0, claimed: 0 });
});

test("an attachment timeout detaches the failed owned leaf and removes observers/listeners/timers", async () => {
  const h = host(); const result = assert.rejects(h.popout.open({}), /attach/);
  await settle(); h.timeout(); await result;
  assert.equal(h.counts().detached, 1); assert.equal(h.popout.isOpen(), false);
  assert.equal(h.observers.size, 0); assert.equal(h.timers.size, 0); assert.equal(h.listeners.size, 0);
});

test("failed note loading and failed ownership marking clean up the exact newly created leaf", async () => {
  for (const options of [{ openFails: true }, { claimFails: true }]) {
    const h = host(options); await assert.rejects(h.popout.open({}));
    assert.equal(h.counts().detached, 1); assert.equal(h.popout.isOpen(), false);
  }
});

test("unload during attachment cancels promptly and detaches only once", async () => {
  const h = host(); const result = assert.rejects(h.popout.open({}), /closed/);
  await settle(); h.popout.close(); await result;
  assert.equal(h.counts().detached, 1); assert.equal(h.observers.size, 0); assert.equal(h.timers.size, 0);
});

test("manual close during attachment cancels and releases wait resources", async () => {
  const h = host(); const result = assert.rejects(h.popout.open({}), /closed/);
  await settle(); h.userClose(); await result;
  assert.equal(h.observers.size, 0); assert.equal(h.timers.size, 0); assert.equal(h.listeners.size, 0);
});

test("unload during openFile does not start an attachment wait or detach twice", async () => {
  let release; const openGate = new Promise(resolve => { release = resolve; });
  const h = host({ openGate }); const result = assert.rejects(h.popout.open({}), /closed/);
  h.popout.close(); release(); await result;
  assert.equal(h.counts().detached, 1); assert.equal(h.observers.size, 0); assert.equal(h.timers.size, 0);
});

test("closing immediately after attachment prevents returning a stale document for native binding", async () => {
  const h = host(); const result = assert.rejects(h.popout.open({}), /closed/);
  await settle(); h.attach(); h.popout.close(); await result;
  assert.equal(h.counts().detached, 1); assert.equal(h.popout.isOpen(), false);
});

test("focused overlay cleanup runs before removing its root", async () => {
  let listenersActive = true;
  const h = host({ attached: true, onRelease() { listenersActive = false; },
    removeControls() { if (listenersActive) throw new DOMException("focusout removed the same node", "NotFoundError"); } });
  await h.popout.open({});
  h.popout.mountControls();
  h.popout.close();
  assert.equal(h.counts().detached, 1);
  assert.deepEqual(h.cleanup(), { released: 1, removed: 1 });
});

test("a deliberate new tab is owned while an unrelated tab still releases the window", async () => {
  const h = host({ attached: true, tabs: true });
  await h.popout.open({});
  assert.equal(h.popout.addTab(), true);
  assert.ok(h.second);
  assert.equal(h.counts().claimed, 2);
  assert.equal(h.popout.isOpen(), true);
  h.mix();
  assert.equal(h.popout.isOpen(), false);
  assert.equal(h.counts().detached, 0);
  assert.equal(h.cleanup().released, 2);
});
