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
  const timers = new Map(), keys = options.keys ?? new Map(), storage = options.storage ?? new Map();
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
        min: [0, 0], getMinimumSize: () => win.min, setMinimumSize: (width, height) => { win.min = [width, height]; },
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
  const settingTabs = [];
  const files = new Map([[file.path, file]]);
  const newTabCommand = { checkCallback: () => true };
  const app = { workspace, commands: { findCommand: () => newTabCommand }, vault: { getName: () => "test_vault", getAbstractFileByPath: path => files.get(path) ?? null, getMarkdownFiles: () => [...files.values()] } };
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
    addSettingTab(tab) { settingTabs.push(tab); } registerEvent() {}
    registerDomEvent(target, name, callback) { events.set(name, callback); }
  }
  class Setting {
    setName() { return this; } setDesc() { return this; }
    addText(callback) { callback({ setValue() { return this; }, onChange() { return this; } }); return this; }
    addButton(callback) { callback({ setButtonText() { return this; }, onClick() { return this; } }); return this; }
    addToggle(callback) { callback({ setValue() { return this; }, onChange(fn) { toggles.push(fn); return this; }, setDisabled() {} }); return this; }
    addSlider(callback) {
      const slider = {
        setLimits() { return this; }, setValue() { return this; }, setDynamicTooltip() { return this; },
        setDisabled() {}, onChange(fn) { sliders.push(fn); return this; },
      };
      callback(slider); return this;
    }
  }
  const trays = [];
  class Tray {
    constructor(image) { this.image = image; this.handlers = new Map(); this.destroyed = false; trays.push(this); }
    setToolTip(tip) { this.tip = tip; }
    setContextMenu(menu) { this.menu = menu; }
    popUpContextMenu(menu) { this.popped = menu; }
    on(name, handler) { this.handlers.set(name, handler); }
    destroy() { this.destroyed = true; }
    isDestroyed() { return this.destroyed; }
  }
  const Menu = { buildFromTemplate: items => items };
  const nativeImage = { createFromDataURL: url => ({ url, resize() { return this; }, setTemplateImage(value) { this.template = value; } }) };
  const remote = {
    process: { pid: 123 }, BrowserWindow: { getAllWindows: () => windows },
    ...(options.tray === false ? {} : { Tray, nativeImage, Menu, nativeTheme: { shouldUseDarkColorsForSystemUI: options.darkTaskbar } }),
    screen: { getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 2000, height: 1200 } }) },
    globalShortcut: {
      register: (key, callback) => { if (options.refuse?.(key) || keys.has(key)) return false; keys.set(key, callback); return true; },
      unregister: key => keys.delete(key),
      isRegistered: key => keys.has(key),
    },
  };
  const exports = {}, module = { exports };
  const sandbox = {
    module, exports,
    require: name => {
      if (name === "obsidian") return {
        Plugin, PluginSettingTab: class {}, Setting, TFile, WorkspaceWindow, apiVersion: "1.15.0",
        Notice: class { constructor(message) { notices.push(message); } },
        Platform: { isDesktop: options.desktop !== false, isMacOS: options.macOS === true, isLinux: options.linux === true, isWin: options.windows === true },
      };
      if (name === "electron") return { remote };
      throw Error(name);
    },
    setTimeout: fn => { const id = ++timerId; timers.set(id, fn); return id; },
    clearTimeout: id => timers.delete(id),
    crypto: { randomUUID }, structuredClone,
    console: { info: line => logs.push(line), warn: line => logs.push(line) },
  };
  sandbox.window = sandbox;
  vm.runInNewContext(bundle, sandbox);
  const plugin = new module.exports.default();
  const load = plugin.onload.bind(plugin);
  plugin.onload = async () => {
    const pending = load();
    // Host startup calls setLayout after plugin installation, before layout-ready.
    workspace.setLayout({}); workspace.layoutReady = true;
    await pending;
  };
  return {
    plugin, settingTabs, writes, logs, notices, commands, keys, windows, opened, files, storage, sliders, toggles, leaves, trays,
    async enableAgain() { const next = new module.exports.default(); await next.onload(); return next; },
    mix(leaf = leaves[0]) {
      const ordinary = { id: `ordinary-${leaves.length}`, getContainer: () => leaf.getContainer(),
        serialize() { return { id: this.id, type: "leaf", state: { type: "markdown", state: { file: "Other.md" } } }; },
        view: { containerEl: element(leaf.view.containerEl.ownerDocument) } };
      leaves.push(ordinary); return ordinary;
    },
    controls(index = 0) {
      return windows[index].dom.all(windows[index].doc.body).find(element =>
        element.classList.contains("popnote-overlay") || element.className === "popnote-spike");
    },
    move(leaf, destination) {
      leaf.container = destination ? destination.getContainer() : { doc: mainDocument, win: mainWindow };
      leaf.view.containerEl.ownerDocument = leaf.container.doc;
    },
    disk: () => disk, failNextSave: () => { failSave = true; },
    ready() { workspace.layoutReady = true; layoutReadyCallback?.(); },
    tick() { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); },
    event(name, event = {}) { events.get(name)?.(event); },
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
  const [window] = h.windows;
  assert.equal(window.alpha, 0.6);
  h.keys.get("Control+Alt+Shift+P")(); await settle();
  assert.equal(window.visible, false);
  assert.equal(window.destroyed, false);
  h.keys.get("Control+Alt+Shift+P")(); await settle();
  assert.deepEqual(h.windows, [window]);
  assert.equal(window.visible, true);
  assert.equal(window.focused, true);
  h.plugin.onunload(); await settle();
});

test("prepare and successful Apply survive restart; refused shortcuts never replace the saved shortcut", async () => {
  const h = host({}, { refuse: key => key === "Taken" });
  await h.plugin.onload();
  h.commands.get("use-current-note")(); h.plugin.applyShortcut("Control+Alt+Shift+P"); await settle();
  assert.equal(h.disk().notePath, "notes/A.md");
  assert.equal(h.disk().shortcut, "Control+Alt+Shift+P");
  const count = h.writes.length;
  h.plugin.applyShortcut("Taken"); await settle();
  assert.equal(h.keys.has("Control+Alt+Shift+P"), true);
  assert.equal(h.writes.length, count);
  h.commands.get("use-current-note")(); await settle();
  assert.equal(h.disk().shortcut, "Control+Alt+Shift+P");
  const restarted = host(h.disk()); await restarted.plugin.onload();
  restarted.keys.get("Control+Alt+Shift+P")(); await settle();
  assert.deepEqual(restarted.opened, ["notes/A.md"]);
});

test("a missing saved note falls back to the note in front, says so, and remembers the new note", async () => {
  const h = host(settings); h.files.clear(); const b = new TFile("notes/B.md"); h.files.set(b.path, b);
  await h.plugin.onload(); h.plugin.app.workspace.getActiveFile = () => b;
  h.keys.get("Control+Alt+Shift+P")(); await settle();
  assert.deepEqual(h.opened, ["notes/B.md"]);
  assert.ok(h.notices.some(value => value.includes("notes/A.md") && value.includes("unavailable") && value.includes("notes/B.md")));
  assert.equal(h.disk().notePath, "notes/B.md");
});

test("a vault with no notes at all gets a Notice and no window", async () => {
  const h = host(settings); h.files.clear(); await h.plugin.onload(); h.plugin.app.workspace.getActiveFile = () => null;
  h.keys.get("Control+Alt+Shift+P")(); await settle();
  assert.equal(h.opened.length, 0); assert.ok(h.notices.some(value => value.includes("no notes to show")));
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
  h.commands.get("use-current-note")(); await settle();
  assert.ok(h.notices.some(value => value.includes("could not be saved")));
  h.plugin.applyShortcut("Control+Alt+O"); await settle();
  assert.equal(h.disk().shortcut, "Control+Alt+O");
});

test("PopNote writes nothing to the console and keeps no debug setting", async () => {
  const h = host(settings);
  await h.plugin.onload(); h.ready(); h.commands.get("use-current-note")(); await settle();
  h.keys.get(settings.shortcut)(); await settle(); h.keys.get(settings.shortcut)(); await settle();
  h.plugin.onunload(); await settle();
  assert.deepEqual([...h.logs], []);
  assert.equal(h.notices.some(message => message.includes("Native window ID")), false);
  assert.equal("debug" in h.disk(), false);
  assert.equal(h.storage.size, 0);
});

test("settings are searchable on new Obsidian and still render on older versions", async () => {
  const row = () => { const calls = []; const chain = new Proxy({}, { get: (_, name) => (...args) => { calls.push(name); for (const arg of args) if (typeof arg === "function") arg(chain); return chain; } }); return { chain, calls }; };
  const win = host(settings, { windows: true }); await win.plugin.onload();
  const items = win.settingTabs[0].getSettingDefinitions();
  assert.deepEqual([...items.map(item => item.name)], ["How it works", "Global shortcut", "Show on all desktops", "Tray icon", "Windows tip"]);
  assert.ok(items.filter(item => item.render).length >= 3 && items.every(item => typeof item.desc === "string"));
  const { chain, calls } = row(); items.find(item => item.name === "Tray icon").render(chain);
  assert.ok(calls.includes("addToggle"));
  const other = host(settings); await other.plugin.onload();
  assert.equal(other.settingTabs[0].getSettingDefinitions().some(item => item.name === "Windows tip" && item.visible !== false), false);
  const text = [], tab = other.settingTabs[0];
  tab.containerEl = { empty() {}, createEl: (tag, options) => text.push(options.text) };
  tab.display();
  assert.ok(text[0].startsWith("Press the shortcut"));
});

test("malformed settings and mobile remain safe", async () => {
  for (const data of [null, [], { notePath: 7, shortcut: {}, opacity: "bad", windowBounds: {} }]) {
    const h = host(data); await h.plugin.onload();
    assert.ok(h.keys.has("Control+Alt+P")); assert.equal(h.opened.length, 0);
    // No note was ever chosen, so the note in front opens and is remembered.
    h.keys.get("Control+Alt+P")(); await settle(); assert.deepEqual(h.opened, ["notes/A.md"]);
    assert.equal(h.disk().notePath, "notes/A.md");
  }
  const mobile = host(settings, { desktop: false }); await mobile.plugin.onload();
  assert.equal(mobile.keys.size, 0); assert.equal(mobile.logs.length, 0);
});

test("a refused first custom shortcut is not saved by a later note write", async () => {
  const h = host({}, { refuse: key => key === "Taken" }); await h.plugin.onload();
  h.plugin.applyShortcut("Taken"); h.commands.get("use-current-note")(); await settle();
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
  h.plugin.onunload(); await settle();
  assert.equal(h.windows[0].destroyed, false);
});

test("beforeunload flushes pending bounds", async () => {
  const h = host(settings); await h.plugin.onload();
  h.keys.get("Control+Alt+Shift+P")(); await settle();
  h.windows[0].bounds = { x: 200, y: 210, width: 550, height: 460 };
  h.windows[0].emit("move"); h.event("beforeunload"); await settle();
  assert.deepEqual(h.disk().windowBounds, { x: 200, y: 210, width: 550, height: 460 });
  assert.equal(h.disk().opacity, 0.6);
});

test("renderer shutdown releases only its own shortcut across repeated Mac restarts", async () => {
  const accelerator = "Command+Option+P";
  const foreign = () => {};
  const keys = new Map([["Command+Option+O", foreign]]);
  for (let run = 0; run < 3; run++) {
    const h = host({ ...settings, shortcut: accelerator }, { keys, macOS: true });
    await h.plugin.onload();
    assert.equal(h.windows.length, 0);
    assert.ok(keys.has(accelerator));
    h.plugin.applyShortcut("Command+Option+O");
    assert.equal(keys.get("Command+Option+O"), foreign);
    h.event("beforeunload", { defaultPrevented: true });
    assert.ok(keys.has(accelerator));
    h.event(run === 1 ? "pagehide" : "beforeunload");
    assert.equal(keys.has(accelerator), false);
    assert.equal(keys.get("Command+Option+O"), foreign);
  }
});

test("a stale startup registration is reclaimed, but Apply never takes a foreign shortcut", async () => {
  const stale = () => {};
  const keys = new Map([["Command+Option+P", stale], ["Command+Option+O", stale]]);
  const h = host({ ...settings, shortcut: "Command+Option+P" }, { keys, macOS: true });
  await h.plugin.onload();
  assert.notEqual(keys.get("Command+Option+P"), stale);
  h.plugin.applyShortcut("Command+Option+O");
  assert.equal(keys.get("Command+Option+O"), stale);
  keys.get("Command+Option+P")(); await settle();
  assert.equal(h.windows.length, 1);
});

test("unchanged close bounds do not queue a second shutdown write", async () => {
  const h = host(settings);
  await h.plugin.onload();
  h.keys.get(settings.shortcut)();
  await settle();
  const window = h.windows[0];
  window.bounds = { x: 200, y: 210, width: 550, height: 460 };
  window.emit("move");
  h.event("beforeunload");
  await settle();
  window.emit("close");
  h.tick();
  await settle();
  assert.equal(h.writes.length, 1);
  assert.deepEqual(h.disk().windowBounds, window.bounds);
});


test("Obsidian quit waits for a changed bounds save already in flight", async () => {
  let finishSave;
  const gate = new Promise(resolve => { finishSave = resolve; });
  const h = host(settings, { saveGate: () => gate });
  await h.plugin.onload();
  h.keys.get(settings.shortcut)();
  await settle();
  const window = h.windows[0];
  window.bounds = { x: 200, y: 210, width: 550, height: 460 };
  window.emit("move");
  h.tick();
  await settle();
  const tasks = [];
  h.event("quit", { addPromise: promise => tasks.push(promise) });
  window.emit("close");
  h.tick();
  await settle();
  assert.equal(tasks.length, 1);
  assert.deepEqual(h.disk().windowBounds, settings.windowBounds);
  finishSave();
  await Promise.all(tasks);
  assert.deepEqual(h.disk().windowBounds, window.bounds);
  assert.equal(h.writes.length, 1);
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
  assert.deepEqual(h.disk(), { ...guardedSettings, pinned: true, allSpaces: false, tray: false, helpShown: false });
  assert.equal(h.writes.length, 1, "only the remembered pin was saved");
  h.plugin.onunload(); await settle();
  assert.equal(owned.detaches, 0); assert.equal(oldWindow.destroyed, false);
  assert.equal(h.windows[1].destroyed, true); assert.equal(h.keys.size, 0);
  const enabled = await h.enableAgain(); assert.equal(h.windows.length, 2);
  h.sliders[0](0.8); staleBounds(); h.keys.get(settings.shortcut)(); await settle();
  assert.equal(h.windows.length, 3); assert.equal(h.windows[2].alpha, 0.4);
  assert.equal(h.writes.length, 1); enabled.onunload();
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
  assert.equal(root.parentElement, group.tabHeaderContainerEl);
  assert.equal(root.classList.contains("popnote-overlay-in-tab-header"), true);
  assert.deepEqual(group.containerEl.children, [group.tabHeaderContainerEl, group.tabsContainerEl]);
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

function chooserFor(h, index = 0) {
  const dom = h.windows[index].dom, root = h.controls(index);
  return { dom, root, note: dom.label(root, "Choose the note to show"), search: dom.label(root, "Find a note"),
    results: () => dom.all(root).filter(element => element.className === "popnote-overlay-result") };
}

test("the note picker switches the open window to another note and remembers it", async () => {
  const h = host(settings); h.files.set("notes/B.md", new TFile("notes/B.md"));
  await h.plugin.onload(); h.keys.get(settings.shortcut)(); await settle();
  const picker = chooserFor(h);
  picker.dom.fire(picker.dom.label(picker.root, "Show PopNote controls"), "click");
  picker.dom.fire(picker.note, "click");
  assert.deepEqual(picker.results().map(item => item.dataset.path).sort(), ["notes/A.md", "notes/B.md"]);
  picker.search.value = "b"; picker.dom.fire(picker.search, "input");
  assert.deepEqual(picker.results().map(item => item.dataset.path), ["notes/B.md"]);
  picker.dom.fire(picker.results()[0], "click"); await settle();
  assert.deepEqual(h.opened, ["notes/A.md", "notes/B.md"]);
  assert.equal(h.windows.length, 1, "the same window is reused");
  assert.equal(h.disk().notePath, "notes/B.md");
  const restarted = host(h.disk()); restarted.files.set("notes/B.md", new TFile("notes/B.md"));
  await restarted.plugin.onload(); restarted.keys.get(settings.shortcut)(); await settle();
  assert.deepEqual(restarted.opened, ["notes/B.md"]);
});

test("choosing a note that is not in the vault shows a Notice and changes nothing", async () => {
  const h = host(settings); await h.plugin.onload(); h.keys.get(settings.shortcut)(); await settle();
  const picker = chooserFor(h);
  picker.dom.fire(picker.dom.label(picker.root, "Show PopNote controls"), "click");
  picker.dom.fire(picker.note, "click");
  h.files.delete("notes/A.md");
  picker.dom.fire(picker.results()[0], "click"); await settle();
  assert.ok(h.notices.some(value => value.includes("not a note in this vault")));
  assert.equal(h.disk().notePath, "notes/A.md");
});

test("Use current note switches an already open window without closing it", async () => {
  const h = host(settings); h.files.set("notes/B.md", new TFile("notes/B.md"));
  await h.plugin.onload(); h.keys.get(settings.shortcut)(); await settle();
  h.plugin.app.workspace.getActiveFile = () => h.files.get("notes/B.md");
  h.commands.get("use-current-note")(); await settle();
  assert.deepEqual(h.opened, ["notes/A.md", "notes/B.md"]); assert.equal(h.windows.length, 1);
  assert.equal(h.disk().notePath, "notes/B.md");
});

test("pin is remembered across restarts", async () => {
  const h = host(settings); await h.plugin.onload(); h.keys.get(settings.shortcut)(); await settle();
  h.toggles[0](true); await settle();
  assert.equal(h.windows[0].pinned, true); assert.equal(h.disk().pinned, true);
  h.plugin.onunload(); await settle();
  const restarted = host(h.disk()); await restarted.plugin.onload(); restarted.keys.get(settings.shortcut)(); await settle();
  assert.equal(restarted.windows[0].pinned, true);
});

test("the tray icon is off by default, toggles the window on click, and is destroyed on disable and unload", async () => {
  const off = host(settings); await off.plugin.onload();
  assert.equal(off.trays.length, 0);
  assert.equal(off.plugin.setTray(true), true); await settle();
  assert.equal(off.trays.length, 1); assert.equal(off.disk().tray, true);
  const [tray] = off.trays;
  tray.handlers.get("click")(); await settle();
  assert.deepEqual(off.opened, ["notes/A.md"]);
  tray.handlers.get("click")(); await settle();
  assert.equal(off.windows[0].visible, false);
  assert.equal(off.plugin.setTray(false), true); await settle(); assert.equal(tray.destroyed, true); assert.equal(off.disk().tray, false);
  off.plugin.setTray(true); const second = off.trays[1];
  off.plugin.onunload(); await settle();
  assert.equal(second.destroyed, true);
});

test("a tray click hides a visible window even though the click took its focus", async () => {
  const h = host({ ...settings, tray: true }); await h.plugin.onload();
  h.trays[0].handlers.get("click")(); await settle();
  const [window] = h.windows; window.focused = false;
  h.trays[0].handlers.get("click")(); await settle();
  assert.equal(window.visible, false);
  h.trays[0].handlers.get("click")(); await settle();
  assert.equal(window.visible, true);
});

const labels = items => [...items].map(item => item.type === "separator" ? "separator" : item.label);
const rightClick = h => { h.trays[0].handlers.get("right-click")(); return h.trays[0].popped; };

test("tray icon: theme-matched icons, and a right-click menu built fresh with show/hide, keep on top, opacity and notes", async () => {
  const dark = host({ ...settings, tray: true }, { darkTaskbar: true }); await dark.plugin.onload();
  const light = host({ ...settings, tray: true }, { darkTaskbar: false }); await light.plugin.onload();
  const unknown = host({ ...settings, tray: true }); await unknown.plugin.onload();
  assert.equal(new Set([dark, light, unknown].map(h => h.trays[0].image.url)).size, 3);
  const h = host({ ...settings, tray: true }); h.files.set("notes/B.md", new TFile("notes/B.md"));
  await h.plugin.onload();
  const items = rightClick(h);
  assert.deepEqual(labels(items), ["Show or hide PopNote", "Keep on top", "Opacity", "separator", "Find note…", "Switch note"]);
  assert.equal(items[1].type, "checkbox"); assert.equal(items[1].checked, false);
  assert.deepEqual(labels(items[2].submenu), ["100%", "80%", "60%", "40%", "separator", "Slider…"]);
  assert.deepEqual([...items[2].submenu].slice(0, 4).map(item => item.checked), [false, false, true, false], "saved opacity 0.6 is ticked");
  assert.deepEqual(labels(items[5].submenu).sort(), ["notes/A", "notes/B"]);
  assert.equal(items[5].submenu.find(item => item.label === "notes/A").checked, true);
  items[0].click(); await settle(); assert.deepEqual(h.opened, ["notes/A.md"]);
});

test("tray: Keep on top works with the window closed (remembered for next time) and open (applied and shown on the button)", async () => {
  const h = host(settings); await h.plugin.onload(); h.plugin.setTray(true);
  rightClick(h)[1].click(); await settle();
  assert.equal(h.disk().pinned, true); assert.equal(rightClick(h)[1].checked, true);
  h.keys.get(settings.shortcut)(); await settle();
  assert.equal(h.windows[0].pinned, true, "the next summon applies the remembered pin");
  const button = h.windows[0].dom.label(h.controls(), "Keep PopNote on top");
  assert.equal(button.getAttribute("aria-pressed"), "true");
  rightClick(h)[1].click(); await settle();
  assert.equal(h.windows[0].pinned, false); assert.equal(button.getAttribute("aria-pressed"), "false");
  assert.equal(h.disk().pinned, false);
});

test("tray: opacity presets apply to the open window, save, and update the window's own control", async () => {
  const h = host(settings); await h.plugin.onload(); h.plugin.setTray(true);
  rightClick(h)[2].submenu[3].click(); await settle();
  assert.equal(h.disk().opacity, 0.4, "set while closed");
  h.keys.get(settings.shortcut)(); await settle();
  assert.equal(h.windows[0].alpha, 0.4);
  rightClick(h)[2].submenu[1].click(); await settle();
  assert.equal(h.windows[0].alpha, 0.8); assert.equal(h.disk().opacity, 0.8);
  const root = h.controls();
  assert.equal(h.windows[0].dom.label(root, "Opacity").value, "0.8");
  assert.deepEqual([...rightClick(h)[2].submenu].slice(0, 4).map(item => item.checked), [false, true, false, false]);
});

test("tray: Switch note opens the window with that note, or switches and shows an open or hidden one", async () => {
  const h = host(settings); h.files.set("notes/B.md", new TFile("notes/B.md"));
  await h.plugin.onload(); h.plugin.setTray(true);
  rightClick(h)[5].submenu.find(item => item.label === "notes/B").click(); await settle();
  assert.deepEqual(h.opened, ["notes/B.md"]); assert.equal(h.disk().notePath, "notes/B.md");
  h.windows[0].visible = false;
  rightClick(h)[5].submenu.find(item => item.label === "notes/A").click(); await settle();
  assert.deepEqual(h.opened, ["notes/B.md", "notes/A.md"]); assert.equal(h.windows.length, 1);
  assert.equal(h.windows[0].visible, true, "a hidden window is shown");
  assert.equal(h.disk().notePath, "notes/A.md");
});

test("tray: a vault with no notes gets a disabled placeholder, and & in a note name is escaped", async () => {
  const empty = host(settings); empty.files.clear(); await empty.plugin.onload(); empty.plugin.setTray(true);
  const placeholder = rightClick(empty)[5].submenu[0];
  assert.equal(placeholder.label, "No notes"); assert.equal(placeholder.enabled, false);
  const amp = host({ ...settings, notePath: "R&D.md" }); amp.files.clear(); amp.files.set("R&D.md", new TFile("R&D.md"));
  await amp.plugin.onload(); amp.plugin.setTray(true);
  assert.equal(rightClick(amp)[5].submenu[0].label, "R&&D");
});

test("tray on Linux sets its menu up front and renews it when state changes", async () => {
  const h = host({ ...settings, tray: true }, { linux: true }); await h.plugin.onload();
  const tray = h.trays[0];
  assert.equal(tray.handlers.has("right-click"), false); assert.equal(tray.menu[1].checked, false);
  const before = tray.menu;
  tray.menu[1].click(); await settle();
  assert.notEqual(tray.menu, before, "the menu was rebuilt"); assert.equal(tray.menu[1].checked, true);
});

test("a saved tray setting is restored at startup and released when the renderer shuts down", async () => {
  const h = host({ ...settings, tray: true }); await h.plugin.onload();
  assert.equal(h.trays.length, 1);
  h.event("beforeunload"); await settle();
  assert.equal(h.trays[0].destroyed, true);
});

test("a missing Tray API turns only the tray off, with a Notice", async () => {
  const h = host(settings, { tray: false }); await h.plugin.onload();
  assert.equal(h.plugin.setTray(true), false); await settle();
  assert.equal(h.disk().tray, false);
  assert.ok(h.notices.some(value => value.includes("Tray icon disabled")));
  assert.ok(h.keys.has(settings.shortcut));
});

test("the all-desktops setting is saved, and the first-run tip appears once on Windows only", async () => {
  const h = host(settings); await h.plugin.onload();
  h.plugin.setAllSpaces(true); await settle();
  assert.equal(h.disk().allSpaces, true);
  const win = host(settings, { windows: true }); await win.plugin.onload();
  win.keys.get(settings.shortcut)(); await settle();
  assert.equal(win.notices.filter(value => value.includes("Win+Tab")).length, 1);
  assert.equal(win.disk().helpShown, true);
  win.keys.get(settings.shortcut)(); win.keys.get(settings.shortcut)(); await settle();
  assert.equal(win.notices.filter(value => value.includes("Win+Tab")).length, 1);
  assert.equal(h.notices.filter(value => value.includes("Win+Tab")).length, 0);
});

test("tray: Find note and Slider bring the window up with that panel open and focused", async () => {
  const h = host(settings); await h.plugin.onload(); h.plugin.setTray(true);
  rightClick(h)[4].click(); await settle();
  assert.deepEqual(h.opened, ["notes/A.md"], "a closed window is created");
  const d = h.windows[0].dom, root = h.controls();
  const picker = d.label(root, "Choose the note to show"), search = d.label(root, "Find a note");
  assert.equal(picker.getAttribute("aria-expanded"), "true"); assert.equal(d.document.activeElement, search);
  assert.equal(d.label(root, "PopNote controls").hidden, false, "the controls are revealed");
  h.windows[0].visible = false;
  rightClick(h)[2].submenu[5].click(); await settle();
  assert.equal(h.windows[0].visible, true, "a hidden window is shown");
  assert.equal(d.label(root, "Window opacity").getAttribute("aria-expanded"), "true");
  assert.equal(picker.getAttribute("aria-expanded"), "false", "only one panel is open");
  assert.equal(d.document.activeElement, d.label(root, "Opacity"));
});
