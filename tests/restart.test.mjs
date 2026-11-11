import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import { randomUUID } from "node:crypto";
import { domHost } from "./dom-host.mjs";

const bundle = readFileSync(new URL("../main.js", import.meta.url), "utf8");
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

// Run the actual bundle; only Obsidian, Electron, DOM and storage are host doubles.
function host(initial = {}, options = {}) {
  let disk = structuredClone(initial);
  const writes = [], logs = [], notices = [], commands = new Map(), events = new Map();
  const timers = new Map(), keys = new Map(), storage = options.storage ?? new Map();
  const sliders = [], toggles = [], windows = [], opened = [], file = new TFile("notes/A.md");
  let timerId = 0, layoutReadyCallback, failSave = false, activeLeaf;
  const mainWindow = {
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => { storage.set(key, value); },
    },
    addEventListener() {}, removeEventListener() {},
  };
  function element(doc) {
    const node = doc.createElement("div"); doc.body.append(node); return node;
  }
  const mainDom = domHost(); Object.assign(mainDom.window, mainWindow);
  const mainDocument = mainDom.document;
  const leaves = [];
  class WorkspaceWindow {
    constructor(doc) { this.doc = doc; this.win = doc.defaultView; }
  }
  const workspace = {
    containerEl: element(mainDocument), layoutReady: false,
    getActiveFile: () => file,
    getMostRecentLeaf: () => activeLeaf,
    iterateAllLeaves: callback => leaves.forEach(callback),
    onLayoutReady: callback => { layoutReadyCallback = callback; },
    on: (name, callback) => { events.set(name, callback); return { name }; },
    requestSaveLayout() { options.onLayoutSave?.(workspace.getLayout()); },
    getLeafById: id => leaves.find(leaf => leaf.id === id && leaf.view.containerEl.isConnected) ?? null,
    getLayout() {
      return { floating: { id: "floating", type: "floating", children: leaves
        .filter(leaf => leaf.view.containerEl.isConnected)
        .map((leaf, i) => ({ id: `window-${i}`, type: "window", children: [
          { id: `tabs-${i}`, type: "tabs", children: [
            leaf.serialize(),
          ] },
        ] })) } };
    },
    setLayout() {},
    openPopoutLeaf() {
      const dom = domHost((target, type) => {
        if (type === "input" && target.type === "range") sliders.push(value => { target.value = String(value); dom.fire(target, "input"); });
        if (type === "click" && target.getAttribute?.("aria-label") === "Keep PopNote on top") {
          toggles.push(value => { if (target.getAttribute("aria-pressed") !== String(value)) dom.fire(target, "click"); });
        }
      });
      const doc = dom.document; doc.title = "A";
      const container = new WorkspaceWindow(doc);
      const listeners = new Map();
      const win = {
        id: windows.length + 2, visible: true, focused: true, destroyed: false, alpha: 1,
        bounds: { x: 50, y: 60, width: 400, height: 300 },
        getTitle: () => doc.title, isDestroyed: () => win.destroyed,
        isVisible: () => win.visible, isMinimized: () => false, isFocused: () => win.focused,
        show() { win.visible = true; }, showInactive() { win.visible = true; }, hide() { win.visible = false; },
        restore() {}, focus() { win.focused = true; },
        getNormalBounds: () => win.bounds, setBounds: value => { win.bounds = value; },
        pinned: false, isAlwaysOnTop: () => win.pinned, setAlwaysOnTop: value => { win.pinned = value; },
        setOpacity: value => { win.alpha = value; }, getOpacity: () => win.alpha,
        on: (name, callback) => { listeners.set(name, callback); },
        removeListener: name => { listeners.delete(name); },
        emit: name => listeners.get(name)?.(),
        listeners, doc,
      };
      const leaf = {
        id: `leaf-${windows.length}`,
        container, getContainer: () => leaf.container,
        serialize() { return { id: this.id, type: "leaf", state: { type: "markdown", state: { file: file.path } } }; },
        view: { containerEl: element(doc) }, getViewState: () => ({ state: { file: file.path } }),
        openFile: async value => { opened.push(value.path); if (options.openGate) await (typeof options.openGate === "function" ? options.openGate(leaf) : options.openGate); },
        detaches: 0,
        detach() { leaf.detaches++; win.destroyed = true; doc.defaultView.closed = true; leaf.view.containerEl.isConnected = false; },
      };
      const header = doc.createElement("header"), content = doc.createElement("section");
      header.textContent = "Original Obsidian header";
      leaf.view.containerEl.append(header, content); leaf.view.contentEl = content;
      if (options.tabGroup) {
        const containerEl = element(doc);
        const tabHeaderContainerEl = doc.createElement("header");
        const tabsContainerEl = doc.createElement("section");
        const newTab = doc.createElement("button");
        newTab.closest = selector => selector === ".workspace-tab-header-new-tab" ? newTab : null;
        tabHeaderContainerEl.append(newTab);
        containerEl.append(tabHeaderContainerEl, tabsContainerEl);
        tabsContainerEl.append(leaf.view.containerEl);
        leaf.parent = { containerEl, tabHeaderContainerEl, tabsContainerEl, currentTab: 0, children: [leaf] };
        win.newTab = newTab;
        activeLeaf = leaf;
        dom.window.addEventListener("keydown", event => {
          if (event.ctrlKey && event.key === "t" && newTabCommand.checkCallback(false)) event.preventDefault();
        }, true);
      }
      win.dom = dom;
      windows.push(win); leaves.push(leaf);
      events.get("window-open")?.({}, doc.defaultView);
      return leaf;
    },
  };
  if (options.tabGroup) {
    workspace.createLeafInTabGroup = group => {
      const first = group.children[0];
      const tab = { ...first, id: "empty-" + leaves.length, parent: group,
        view: { containerEl: element(first.getContainer().doc), getDisplayText: () => "New tab" },
        getViewState: () => ({ type: "empty" }),
      };
      group.tabsContainerEl.append(tab.view.containerEl);
      group.children.push(tab);
      leaves.push(tab);
      events.get("layout-change")?.();
      return tab;
    };
    workspace.setActiveLeaf = leaf => {
      activeLeaf = leaf;
      leaf.parent.currentTab = leaf.parent.children.indexOf(leaf);
      events.get("active-leaf-change")?.(leaf);
    };
  }
  const files = new Map([[file.path, file]]);
  const newTabCommand = { checkCallback: () => true };
  const app = { workspace, commands: { findCommand: () => newTabCommand }, vault: { getName: () => "test_vault", getAbstractFileByPath: path => files.get(path) ?? null } };
  class Plugin {
    constructor() { this.app = app; }
    loadData = async () => structuredClone(disk);
    saveData = async value => {
      writes.push(structuredClone(value));
      if (failSave) { failSave = false; throw Error("disk failure"); }
      if (options.saveGate) await options.saveGate();
      disk = structuredClone(value);
    };
    addCommand = command => commands.set(command.id, command.callback);
    addSettingTab() {} registerEvent() {}
    registerDomEvent(target, name, callback) { events.set(name, callback); }
  }
  class Setting {
    setName() { return this; }
    addToggle(callback) { callback({ setValue() { return this; }, onChange(fn) { toggles.push(fn); return this; }, setDisabled() {} }); return this; }
    addSlider(callback) {
      const slider = {
        setLimits() { return this; }, setValue() { return this; }, setDynamicTooltip() { return this; },
        setDisabled() {}, onChange(fn) { sliders.push(fn); return this; },
      };
      callback(slider); return this;
    }
  }
  const remote = {
    process: { pid: 123 }, BrowserWindow: { getAllWindows: () => windows },
    screen: { getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 2000, height: 1200 } }) },
    globalShortcut: {
      register: (key, callback) => { if (options.refuse?.(key)) return false; keys.set(key, callback); return true; },
      unregister: key => keys.delete(key),
    },
  };
  const exports = {}, module = { exports };
  vm.runInNewContext(bundle, {
    module, exports,
    require: name => {
      if (name === "obsidian") return {
        Plugin, PluginSettingTab: class {}, Setting, TFile, WorkspaceWindow, apiVersion: "1.15.0",
        Notice: class { constructor(message) { notices.push(message); } },
        Platform: { isDesktop: options.desktop !== false, isMacOS: false, isLinux: false },
      };
      if (name === "electron") return { remote };
      throw Error(name);
    },
    setTimeout: fn => { const id = ++timerId; timers.set(id, fn); return id; },
    clearTimeout: id => timers.delete(id),
    crypto: { randomUUID }, structuredClone,
    console: { info: line => logs.push(line), warn: line => logs.push(line) },
  });
  const plugin = new module.exports.default();
  const load = plugin.onload.bind(plugin);
  plugin.onload = async () => {
    const pending = load();
    // Host startup calls setLayout after plugin installation, before layout-ready.
    workspace.setLayout({}); workspace.layoutReady = true;
    await pending;
  };
  return {
    plugin, writes, logs, notices, commands, keys, windows, opened, files, storage, sliders, toggles, leaves,
    async enableAgain() { const next = new module.exports.default(); await next.onload(); return next; },
    mix(leaf = leaves[0]) {
      const ordinary = { id: `ordinary-${leaves.length}`, getContainer: () => leaf.getContainer(),
        serialize() { return { id: this.id, type: "leaf", state: { type: "markdown", state: { file: "Other.md" } } }; },
        view: { containerEl: element(leaf.view.containerEl.ownerDocument) } };
      leaves.push(ordinary); return ordinary;
    },
    controls(index = 0) {
      return windows[index].dom.all(windows[index].doc.body).find(element =>
        element.className === "popnote-overlay" || element.className === "popnote-spike");
    },
    move(leaf, destination) {
      leaf.container = destination ? destination.getContainer() : { doc: mainDocument, win: mainWindow };
      leaf.view.containerEl.ownerDocument = leaf.container.doc;
    },
    disk: () => disk, failNextSave: () => { failSave = true; },
    ready() { workspace.layoutReady = true; layoutReadyCallback?.(); },
    tick() { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); },
    event(name) { events.get(name)?.(); },
  };
}
class TFile { constructor(path) { this.path = path; } }
const settings = {
  notePath: "notes/A.md", shortcut: "Control+Alt+Shift+P", opacity: 0.6,
  windowBounds: { x: 120, y: 130, width: 500, height: 450 }, unrelated: "keep",
};

test("startup registers the saved shortcut without creating a pop-out; summon restores the saved note and window", async () => {
  const h = host(settings);
  await h.plugin.onload(); h.ready();
  assert.deepEqual([...h.keys.keys()], ["Control+Alt+Shift+P"]);
  assert.equal(h.opened.length, 0); assert.equal(h.writes.length, 0);
  h.keys.get("Control+Alt+Shift+P")(); await settle();
  assert.deepEqual(h.opened, ["notes/A.md"]);
  assert.deepEqual(structuredClone(h.windows[0].bounds), settings.windowBounds);
  assert.equal(h.windows[0].alpha, 0.6);
  h.keys.get("Control+Alt+Shift+P")(); await settle();
  h.keys.get("Control+Alt+Shift+P")(); await settle();
  assert.equal(h.windows.length, 1);
  h.plugin.onunload(); await settle();
});

test("prepare and successful Apply survive restart; refused shortcuts never replace the saved shortcut", async () => {
  const h = host({}, { refuse: key => key === "Taken" });
  await h.plugin.onload();
  h.commands.get("prepare-spike")(); h.plugin.applyShortcut("Control+Alt+Shift+P"); await settle();
  assert.equal(h.disk().notePath, "notes/A.md");
  assert.equal(h.disk().shortcut, "Control+Alt+Shift+P");
  const count = h.writes.length;
  h.plugin.applyShortcut("Taken"); await settle();
  assert.equal(h.writes.length, count);
  h.commands.get("prepare-spike")(); await settle();
  assert.equal(h.disk().shortcut, "Control+Alt+Shift+P");
  const restarted = host(h.disk()); await restarted.plugin.onload();
  restarted.keys.get("Control+Alt+Shift+P")(); await settle();
  assert.deepEqual(restarted.opened, ["notes/A.md"]);
});

test("a missing saved note produces a Notice and does not open the active note", async () => {
  const h = host(settings); h.files.clear(); await h.plugin.onload();
  h.keys.get("Control+Alt+Shift+P")(); await settle();
  assert.equal(h.opened.length, 0);
  assert.ok(h.notices.some(value => value.includes("notes/A.md")));
});

test("opacity saves immediately and queued changes remain ordered through unload", async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const h = host(settings, { saveGate: () => gate }); await h.plugin.onload();
  h.keys.get("Control+Alt+Shift+P")(); await settle();
  h.sliders[0](0.5); await settle();
  assert.equal(h.writes[0]?.opacity, 0.5, "opacity must not wait for a debounce timer");
  h.sliders[0](0.4); h.plugin.onunload();
  release(); await settle();
  assert.equal(h.disk().opacity, 0.4);
  assert.equal(h.disk().unrelated, "keep");
  const restarted = host(h.disk()); await restarted.plugin.onload();
  restarted.keys.get("Control+Alt+Shift+P")(); await settle();
  assert.equal(restarted.windows[0].alpha, 0.4);
});

test("save errors are reported and do not poison later saves", async () => {
  const h = host(settings); await h.plugin.onload(); h.failNextSave();
  h.commands.get("prepare-spike")(); await settle();
  assert.ok(h.notices.some(value => value.includes("could not be saved")));
  h.plugin.applyShortcut("Control+Alt+O"); await settle();
  assert.equal(h.disk().shortcut, "Control+Alt+O");
});

test("restart diagnostics survive a new instance and include lifecycle and save completion", async () => {
  const storage = new Map(); const h = host(settings, { storage });
  await h.plugin.onload(); h.ready(); h.commands.get("prepare-spike")(); await settle();
  h.plugin.onunload(); await settle();
  const restarted = host(h.disk(), { storage }); await restarted.plugin.onload(); restarted.ready();
  const history = storage.get("popnote-spike-restart-trace:test_vault") ?? "";
  for (const event of ["plugin-load", "layout-ready", "save-complete", "plugin-unload"])
    assert.ok(history.includes(event), `missing ${event}`);
  assert.ok(restarted.logs.some(line => line.includes("settings-loaded") && line.includes("0.6")));
});

test("malformed settings and mobile remain safe", async () => {
  for (const data of [null, [], { notePath: 7, shortcut: {}, opacity: "bad", windowBounds: {} }]) {
    const h = host(data); await h.plugin.onload();
    assert.ok(h.keys.has("Control+Alt+P")); assert.equal(h.opened.length, 0);
    h.keys.get("Control+Alt+P")(); await settle(); assert.equal(h.opened.length, 0);
  }
  const mobile = host(settings, { desktop: false }); await mobile.plugin.onload();
  assert.equal(mobile.keys.size, 0); assert.equal(mobile.logs.length, 0);
});

test("a refused first custom shortcut is not saved by a later note write", async () => {
  const h = host({}, { refuse: key => key === "Taken" }); await h.plugin.onload();
  h.plugin.applyShortcut("Taken"); h.commands.get("prepare-spike")(); await settle();
  assert.equal(h.disk().shortcut, undefined);
  const restarted = host(h.disk()); await restarted.plugin.onload();
  assert.ok(restarted.keys.has("Control+Alt+P"));
});

test("a saved shortcut refused at startup is retained without startup writes or window creation", async () => {
  const h = host(settings, { refuse: () => true }); await h.plugin.onload(); h.ready();
  assert.equal(h.keys.size, 0); assert.equal(h.writes.length, 0); assert.equal(h.windows.length, 0);
  assert.equal(h.disk().shortcut, "Control+Alt+Shift+P");
});

test("layout events never create or clean up a restored floating window", async () => {
  const h = host(settings); await h.plugin.onload();
  // Obsidian restores an independent floating leaf, outside plugin ownership.
  await h.plugin.app.workspace.openPopoutLeaf();
  h.ready(); h.event("window-open"); h.event("window-close");
  assert.equal(h.opened.length, 0); assert.equal(h.windows[0].destroyed, false);
  assert.ok(h.logs.some(line => line.includes('"floatingWindows":1') && line.includes('"ownedPopoutOpen":false')));
  h.plugin.onunload(); await settle();
  assert.equal(h.windows[0].destroyed, false);
});

test("beforeunload flushes pending bounds and records the pending write", async () => {
  const h = host(settings); await h.plugin.onload();
  h.keys.get("Control+Alt+Shift+P")(); await settle();
  h.windows[0].bounds = { x: 200, y: 210, width: 550, height: 460 };
  h.windows[0].emit("move"); h.event("beforeunload"); await settle();
  assert.deepEqual(h.disk().windowBounds, { x: 200, y: 210, width: 550, height: 460 });
  assert.equal(h.disk().opacity, 0.6);
  assert.ok(h.logs.some(line => line.includes('"event":"main-beforeunload"') && line.includes('"boundsSaveScheduled":true')));
  assert.ok(h.logs.some(line => line.includes('"event":"save-complete"') && line.includes('"reason":"bounds"')));
});

test("diagnostic storage failure does not block saving or summoning", async () => {
  const storage = { get() { throw Error("storage blocked"); }, set() { throw Error("storage blocked"); } };
  const h = host(settings, { storage }); await h.plugin.onload();
  h.keys.get("Control+Alt+Shift+P")(); await settle();
  h.sliders[0](0.5); await settle();
  assert.equal(h.disk().opacity, 0.5); assert.deepEqual(h.opened, ["notes/A.md"]);
});

const guardedSettings = { ...settings, opacity: 0.4 };

test("mixed tabs release controls/native effects before shortcut, callbacks or serialization can act", async () => {
  const h = host(guardedSettings); await h.plugin.onload();
  h.keys.get(settings.shortcut)(); await settle();
  const owned = h.leaves[0], oldWindow = h.windows[0], controls = h.controls();
  const staleBounds = oldWindow.listeners.get("move");
  h.toggles[0](true);
  h.mix();
  // Saving must guard even before the host emits a layout-change event.
  const saved = h.plugin.app.workspace.getLayout();
  assert.doesNotMatch(owned.id, /^popnote-owned-/);
  assert.equal(saved.floating.children.length, 2, "both released tabs serialize");
  assert.equal(controls.isConnected, false);
  assert.equal(oldWindow.alpha, 1); assert.equal(oldWindow.pinned, false);
  h.keys.get(settings.shortcut)(); await settle();
  assert.equal(h.windows.length, 2); assert.equal(oldWindow.visible, true);
  assert.equal(h.windows[1].alpha, 0.4);
  h.sliders[0](0.9); h.toggles[0](false); staleBounds(); h.tick(); await settle();
  assert.equal(h.windows[1].alpha, 0.4); assert.equal(oldWindow.alpha, 1);
  assert.deepEqual(h.disk(), guardedSettings); assert.equal(h.writes.length, 0);
  h.plugin.onunload(); await settle();
  assert.equal(owned.detaches, 0); assert.equal(oldWindow.destroyed, false);
  assert.equal(h.windows[1].destroyed, true); assert.equal(h.keys.size, 0);
  const enabled = await h.enableAgain(); assert.equal(h.windows.length, 2);
  h.sliders[0](0.8); staleBounds(); h.keys.get(settings.shortcut)(); await settle();
  assert.equal(h.windows.length, 3); assert.equal(h.windows[2].alpha, 0.4);
  assert.equal(h.writes.length, 0); enabled.onunload();
});

for (const destination of ["main", "ordinary pop-out"]) {
  test(`movement into ${destination} releases without detaching or changing the destination`, async () => {
    const h = host(guardedSettings); await h.plugin.onload(); h.keys.get(settings.shortcut)(); await settle();
    const owned = h.leaves[0], controls = h.controls();
    const target = destination === "main" ? null : h.plugin.app.workspace.openPopoutLeaf();
    h.move(owned, target); h.event("layout-change");
    assert.doesNotMatch(owned.id, /^popnote-owned-/); assert.equal(controls.isConnected, false);
    assert.equal(h.windows[0].alpha, 1);
    if (target) { assert.equal(h.windows[1].alpha, 1); assert.equal(h.windows[1].pinned, false); }
    h.plugin.onunload(); await settle();
    assert.equal(owned.detaches, 0); assert.equal(h.keys.size, 0);
    const enabled = await h.enableAgain(); const count = h.windows.length;
    h.keys.get(settings.shortcut)(); await settle();
    assert.equal(h.windows.length, count + 1); assert.equal(h.windows.at(-1).alpha, 0.4);
    assert.deepEqual(h.disk(), guardedSettings); enabled.onunload();
  });

  test(`movement into ${destination} during asynchronous note opening cannot mount controls or bind native state`, async () => {
    let release; const openGate = new Promise(resolve => { release = resolve; });
    const h = host(guardedSettings, { openGate }); await h.plugin.onload(); h.keys.get(settings.shortcut)();
    const owned = h.leaves[0];
    const target = destination === "main" ? null : h.plugin.app.workspace.openPopoutLeaf();
    h.move(owned, target); h.event("layout-change"); release(); await settle();
    assert.doesNotMatch(owned.id, /^popnote-owned-/); assert.equal(owned.detaches, 0);
    assert.equal(h.controls(), undefined); assert.equal(h.windows[0].alpha, 1);
    h.plugin.onunload(); assert.equal(owned.detaches, 0); assert.equal(h.writes.length, 0);
  });
}

test("unload itself checks mixed ownership even without a prior layout event", async () => {
  const h = host(guardedSettings); await h.plugin.onload(); h.keys.get(settings.shortcut)(); await settle();
  h.mix(); h.plugin.onunload(); await settle();
  assert.equal(h.leaves[0].detaches, 0); assert.equal(h.windows[0].destroyed, false);
  assert.doesNotMatch(h.leaves[0].id, /^popnote-owned-/); assert.equal(h.keys.size, 0);
  assert.deepEqual(h.disk(), guardedSettings);
});

test("release allows the next summon before an old openFile settles and its finally cannot unlock the new opening", async () => {
  const releases = [];
  const h = host(guardedSettings, { openGate: () => new Promise(resolve => releases.push(resolve)) });
  await h.plugin.onload(); h.keys.get(settings.shortcut)();
  const released = h.leaves[0]; h.move(released, null); h.event("layout-change");
  h.keys.get(settings.shortcut)();
  assert.equal(h.windows.length, 2, "old unresolved open must not block a fresh dedicated window");
  releases[0](); await settle();
  h.keys.get(settings.shortcut)();
  assert.equal(h.windows.length, 2, "stale finally must not unlock the second opening");
  releases[1](); await settle();
  assert.equal(h.windows[1].alpha, 0.4); assert.equal(h.windows[0].alpha, 1);
  assert.equal(released.detaches, 0); assert.equal(h.controls(), undefined);
  h.plugin.onunload(); assert.equal(released.detaches, 0);
});

test("closing an exclusive PopNote never saves it temporarily as a released ordinary tab", async () => {
  const snapshots = [];
  const h = host(guardedSettings, { onLayoutSave: layout => snapshots.push(structuredClone(layout)) });
  await h.plugin.onload(); h.keys.get(settings.shortcut)(); await settle(); snapshots.length = 0;
  h.plugin.onunload();
  assert.ok(snapshots.length > 0);
  assert.ok(snapshots.every(layout => !layout.floating || layout.floating.children.length === 0));
});

test("overlay recovery command stays passive and mounting preserves the original note header", async () => {
  const h = host(guardedSettings); await h.plugin.onload();
  assert.ok(h.commands.has("show-controls"));
  h.commands.get("show-controls")(); assert.equal(h.windows.length, 0);
  h.keys.get(settings.shortcut)(); await settle();
  const root = h.controls(), content = h.leaves[0].view.contentEl;
  assert.equal(root.className, "popnote-overlay"); assert.equal(root.parentElement, content);
  assert.equal(h.leaves[0].view.containerEl.children[0].textContent, "Original Obsidian header");
  assert.equal(h.leaves[0].view.containerEl.children[0].hidden, false);
  assert.equal(h.windows[0].dom.all(root).some(element => element.className.includes("diagnostic")), false);
  const recovery = h.windows[0].dom.label(root, "Show PopNote controls");
  h.commands.get("show-controls")(); assert.equal(recovery.getAttribute("aria-expanded"), "true");
  h.mix(); h.event("layout-change");
  assert.equal(root.isConnected, false); assert.equal(content.classList.contains("popnote-overlay-host"), false);
  h.commands.get("show-controls")(); assert.equal(h.windows.length, 1);
  assert.equal(h.windows[0].dom.listenerCount(), 0); assert.equal(h.writes.length, 0);
});

test("released overlay listeners cannot affect a later window", async () => {
  const h = host(guardedSettings); await h.plugin.onload(); h.keys.get(settings.shortcut)(); await settle();
  const range = h.windows[0].dom.label(h.controls(), "Opacity");
  const stale = range.listeners.get("input")[0].fn;
  h.mix(h.leaves[0]); h.event("layout-change");
  assert.equal(h.leaves[0].detaches, 0); assert.equal(h.windows[0].destroyed, false);
  h.keys.get(settings.shortcut)(); await settle();
  range.value = "0.9"; stale({ target: range });
  assert.equal(h.windows[1].alpha, 0.4);
});

test("routine native diagnostics stay in logs rather than visible Notices", async () => {
  const h = host(guardedSettings); await h.plugin.onload(); h.keys.get(settings.shortcut)(); await settle();
  h.keys.get(settings.shortcut)(); await settle(); h.keys.get(settings.shortcut)(); await settle();
  assert.ok(h.logs.some(line => line.includes("Native window ID") && line.includes("created")));
  assert.ok(h.logs.some(line => line.includes("Native window ID") && line.includes("reused")));
  assert.equal(h.notices.some(message => message.includes("Native window ID")), false);
  h.plugin.onunload();
});

for (const trigger of ["layout-change", "show-controls"]) {
  test(`replacing a view in the same leaf releases the detached overlay via ${trigger}`, async () => {
    const h = host(guardedSettings); await h.plugin.onload(); h.keys.get(settings.shortcut)(); await settle();
    const leaf = h.leaves[0], oldRoot = h.controls(), oldHost = leaf.view.contentEl, dom = h.windows[0].dom;
    const containerEl = dom.document.createElement("div"), contentEl = dom.document.createElement("section");
    dom.document.body.append(containerEl); containerEl.append(contentEl);
    leaf.view.containerEl.remove(); leaf.view = { containerEl, contentEl };
    if (trigger === "layout-change") h.event(trigger); else h.commands.get(trigger)();
    assert.doesNotMatch(leaf.id, /^popnote-owned-/);
    assert.equal(oldHost.classList.contains("popnote-overlay-host"), false);
    assert.equal(oldRoot.isConnected, false); assert.equal(dom.listenerCount(), 0);
    assert.equal(leaf.detaches, 0); assert.equal(h.windows[0].alpha, 1);
    h.keys.get(settings.shortcut)(); await settle();
    assert.equal(h.windows.length, 2); assert.equal(h.windows[1].alpha, 0.4);
    assert.deepEqual(h.disk(), guardedSettings);
    h.plugin.onunload(); assert.equal(leaf.detaches, 0);
  });
}

test("native new-tab inputs keep window opacity, layout ownership, and the shared toolbar", async () => {
  const h = host(guardedSettings, { tabGroup: true });
  await h.plugin.onload();
  h.keys.get(settings.shortcut)(); await settle();
  const [win] = h.windows;
  const root = h.controls();
  const group = h.leaves[0].parent;
  assert.equal(group.containerEl.children[1], root);
  assert.equal(group.containerEl.children[2], group.tabsContainerEl);
  assert.equal(win.dom.fire(win.newTab, "click").defaultPrevented, false);
  assert.equal(win.dom.fire(win.newTab, "click", { isTrusted: true }).defaultPrevented, true);
  const wrappedCommand = h.plugin.app.commands.findCommand().checkCallback;
  assert.equal(win.dom.fire(group.tabsContainerEl, "keydown", {
    isTrusted: true, key: "t", ctrlKey: true,
  }).defaultPrevented, true);
  assert.equal(group.children.length, 3);
  assert.ok(group.children.every(tab => tab.id.startsWith("popnote-owned-v1:")));
  assert.equal(h.plugin.app.workspace.getLayout().floating, undefined);
  assert.equal(win.alpha, 0.4);
  assert.equal(h.controls(), root);
  assert.equal(win.dom.all(root).find(node => node.className === "popnote-overlay-note").textContent, "New tab");
  h.mix(h.leaves[0]); h.event("layout-change");
  assert.equal(h.controls(), undefined);
  assert.notEqual(h.plugin.app.commands.findCommand().checkCallback, wrappedCommand);
  assert.equal(win.alpha, 1);
  assert.equal(group.children.length, 3);
  assert.equal(win.destroyed, false);
});
