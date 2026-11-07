import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { fixture, loadCompatibility } from "./compat-host.mjs";

// Read methods from the installed application; never execute the full application.
const archive = process.env.POPNOTE_OBSIDIAN_ASAR ?? (process.env.APPDATA && join(process.env.APPDATA, "obsidian", "obsidian-1.15.0.asar"));
assert.ok(archive, "Set POPNOTE_OBSIDIAN_ASAR to the installed Obsidian 1.15.0 application archive.");
const bytes = readFileSync(archive);
const header = JSON.parse(bytes.subarray(16, 16 + bytes.readUInt32LE(12)).toString());
const start = 8 + bytes.readUInt32LE(4);
const entry = name => {
  const item = header.files[name], offset = start + Number(item.offset);
  return bytes.subarray(offset, offset + item.size).toString();
};
const version = JSON.parse(entry("package.json")).version;
const ast = ts.createSourceFile("installed-app.js", entry("app.js"), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const classes = [];
let scheduler;
function visit(node) {
  if (ts.isClassExpression(node) || ts.isClassDeclaration(node)) classes.push(node);
  if (ts.isFunctionDeclaration(node) && node.name?.text === "R6") scheduler = node.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
const has = (node, name) => node.members.some(member => member.name?.getText(ast) === name);
const workspaceClass = classes.find(node => has(node, "getLayout") && has(node, "deserializeLayout"));
const leafClass = classes.find(node => has(node, "openFile") && has(node, "getViewState"));
const baseClass = classes.find(node => has(node, "getRoot") && has(node, "setDimension") && has(node, "serialize"));
const parentClass = classes.find(node => has(node, "replaceChild") && has(node, "serialize"));
const tabClass = classes.find(node => has(node, "updateTabDisplay") && has(node, "selectTabIndex"));
const method = (node, name) => {
  const found = node?.members.find(member => member.name?.getText(ast) === name);
  assert.ok(found, `Installed method missing: ${name}`);
  return found.getText(ast);
};
const { WorkspaceCompatibility } = loadCompatibility();

function installedHost() {
  const events = [], writes = [], notices = [];
  const workspaceMethods = ["loadLayout", "setLayout", "deserializeLayout", "getLayout", "saveLayout", "getLeafById", "setActiveLeaf", "isAttached", "openPopoutLeaf"];
  const leafMethods = ["serialize", "openFile", "setViewState", "getViewState", "detach"];
  const code = `
    const S={isMobile:false,isDesktopApp:true,canSplit:true}, FM=99, Cue=10000;
    const xue="workspace.json", Eue="workspace-mobile.json", iO=p=>Promise.resolve(p), sleep=()=>Promise.resolve();
    const el=()=>({isConnected:true,addClass(){},removeClass(){},setChildrenInPlace(){},isShown(){return true}});
    class Node {
      constructor(ws,id){this.workspace=ws;this.id=id||"generated-"+(++ws.nextId);this.parent=null;this.containerEl=el();}
      ${method(baseClass, "serialize")}
      ${method(baseClass, "getRoot")}
      ${method(baseClass, "detach")}
      setDimension(){} recomputeChildrenDimensions(){} isVisible(){return true} loadIfDeferred(){return Promise.resolve()}
      getContainer(){let node=this;while(node.parent){if(node instanceof hs||node instanceof L1||node instanceof Mo)return node;node=node.parent}return node}
    }
    class Parent extends Node {
      constructor(ws,id){super(ws,id);this.children=[]}
      ${method(parentClass, "serialize")}
      insertChild(index,child){child.parent=this;this.children.splice(index<0?this.children.length:index,0,child)}
      removeChild(child){this.children.splice(this.children.indexOf(child),1);child.parent=null}
      setDirection(value){this.direction=value} setSize(){} collapse(){}
    }
    class Gn extends Parent {constructor(ws,direction,id){super(ws,id);this.direction=direction;this.type="split"}}
    class L1 extends Gn {} class Mo extends Gn {} class Or extends Parent {}
    class D1 extends Parent {constructor(ws,id){super(ws,id);this.type="floating"}}
    class hs extends Parent {
      constructor(ws,id){super(ws,id);this.type="window";events.push({event:"window-create",id:this.id})}
      updateTitle(){}
    }
    class Je extends Parent {
      constructor(ws,id){super(ws,id);this.type="tabs";this.currentTab=0}
      selectTabIndex(index){this.currentTab=index} setStacked(){}
      static createFrom(ws,child){const group=new Je(ws);group.insertChild(0,child);return group}
    }
    class mn {} class Cl {} class Jr {} class Rp {}
    class NoteView extends mn {
      constructor(){super();this.state={file:"Welcome.md"};this.containerEl=el()}
      getViewType(){return "markdown"} getState(){return {...this.state}} getIcon(){return "file"}
      getDisplayText(){return this.state.file||"empty"} canAcceptExtension(){return true}
      async setState(state){this.state={...state}} close(){this.containerEl.isConnected=false}
    }
    class Tt extends Node {
      constructor(app,id){super(app.workspace,id);this.app=app;this.type="leaf";this.view=new NoteView();this.tabHeaderEl=el();this.working=false;this._empty={containerEl:{isConnected:false}}}
      ${leafMethods.map(name => method(leafClass, name)).join("\n")}
      getHistoryState(){return null} updateHeader(){} setGroup(){} togglePinned(){} setEphemeralState(){}
    }
    class InstalledWorkspace {
      ${workspaceMethods.map(name => method(workspaceClass, name)).join("\n")}
      constructor(){
        this.nextId=0;this.layoutReady=false;this.onLayoutReadyCallbacks=[];this.containerEl=el();
        this.app={workspace:this,vault:{getName:()=>"test_vault",configDir:".obsidian",adapter:{write:async(path,data)=>writes.push({path,data})}},viewRegistry:{getTypeByExtension:()=>"markdown"}};
        this.leftRibbon={load(){},serialize(){return {}}};this.rightRibbon={containerEl:el()};this.leftRibbon.containerEl=el();
        this.recentFileTracker={load(){},serialize:()=>[]};
      }
      iterateAllLeaves(callback){const walk=node=>{if(!node)return;if(node.type==="leaf")callback(node);else for(const child of node.children||[])walk(child)};for(const node of [this.rootSplit,this.leftSplit,this.rightSplit,this.floatingSplit])walk(node)}
      getLastOpenFiles(){return []} requestSaveLayout(){} requestActiveLeafEvents(){} onLayoutChange(){}
      trigger(event){events.push({event})} updateTitle(){} updateMobileVisibleTabGroup(){} focusLeaf(){} getGroupLeaves(){return []} pushUndoHistory(){}
      openPopout(){const win=new hs(this);this.floatingSplit.insertChild(-1,win);return win}
    }
    new InstalledWorkspace();
  `;
  const ws = vm.runInNewContext(code, { events, writes, console });
  const compat = new WorkspaceCompatibility(ws, message => notices.push(message), (event, details) => events.push({ event, ...structuredClone(details) }));
  return { ws, compat, events, writes, notices };
}

test(`installed Obsidian ${version}: incoming filter runs before actual deserialization constructs floating windows`, async () => {
  assert.equal(version, "1.15.0", "Review a changed installed version before trusting this compatibility spike");
  const h = installedHost(), input = fixture(), before = structuredClone(input);
  h.ws.readWorkspaceFile = async () => input;
  h.compat.install(); h.ws.onLayoutReadyCallbacks.push({ callback: () => h.compat.finishStartup() });
  await h.ws.loadLayout(); await Promise.resolve();
  assert.deepEqual(input, before);
  assert.deepEqual(h.events.filter(item => item.event === "window-create").map(item => item.id), ["ordinary-window"]);
  const incoming = h.events.findIndex(item => item.event === "incoming-layout-delegate");
  const created = h.events.findIndex(item => item.event === "window-create");
  assert.ok(incoming >= 0 && incoming < created);
  assert.ok(h.events.some(item => item.event === "compat-startup-check" && item.verified === true));
  assert.deepEqual(h.notices, []);
});

test(`installed Obsidian ${version}: lookup, selection and note switching retain the marked leaf through tab movement and detach`, async () => {
  const h = installedHost(), input = fixture();
  input.floating.children = [input.floating.children[1]];
  h.compat.install(); await h.ws.setLayout(input); h.compat.finishStartup();
  const note = h.ws.openPopoutLeaf();
  assert.equal(typeof note.then, "undefined", "claiming must remain synchronous");
  const previous = note.id;
  assert.equal(h.compat.claim(note), true);
  assert.equal(h.ws.getLeafById(note.id), note); assert.equal(h.ws.getLeafById(previous), null);
  h.ws.setActiveLeaf(note, { focus: false }); assert.equal(h.ws.activeLeaf, note);
  const parent = note.parent, ordinary = h.ws.getLeafById("same-note"), oldParent = ordinary.parent;
  oldParent.removeChild(ordinary); parent.insertChild(0, ordinary);
  h.ws.setActiveLeaf(ordinary, { focus: false });
  h.ws.setActiveLeaf(note, { focus: false }); assert.equal(parent.currentTab, 1);
  h.compat.audit();
  await note.openFile({ path: "Other.md", extension: "md" });
  assert.equal(note.getViewState().state.file, "Other.md"); assert.equal(h.ws.getLeafById(note.id), note);
  await note.openFile({ path: "Welcome.md", extension: "md" });
  const saved = h.ws.getLayout();
  assert.ok(saved.floating.children.some(window => window.children.some(group => group.children.some(child => child.id === "same-note"))));
  const id = note.id; note.detach(); h.compat.audit();
  assert.equal(h.ws.getLeafById(id), null); assert.equal(h.ws.getLeafById("same-note"), ordinary);
  assert.deepEqual(h.notices, []);
});

test(`installed Obsidian ${version}: actual saveLayout excludes the marked leaf while the live window remains`, async () => {
  const h = installedHost(), input = fixture(); input.floating.children = [input.floating.children[1]];
  h.compat.install(); await h.ws.setLayout(input); h.compat.finishStartup();
  const note = h.ws.openPopoutLeaf(); assert.equal(h.compat.claim(note), true);
  h.ws.setActiveLeaf(note, { focus: false });
  await h.ws.saveLayout();
  const saved = JSON.parse(h.writes[0].data);
  assert.equal(h.writes[0].path, ".obsidian/workspace.json");
  assert.equal(saved.floating.children.length, 1); assert.equal(saved.active, undefined);
  assert.ok(h.ws.getLeafById(note.id)); assert.equal(h.ws.floatingSplit.children.length, 2);
  assert.deepEqual(h.notices, []);
});

test(`installed Obsidian ${version}: release of a frozen live leaf still serializes an ordinary tab after disable and restart`, async () => {
  const h = installedHost(), input = fixture(); input.floating.children = [input.floating.children[1]];
  h.compat.install(); await h.ws.setLayout(input);
  const note = h.ws.openPopoutLeaf(); const ordinaryId = note.id;
  assert.equal(h.compat.claim(note), true);
  Object.freeze(note);
  assert.equal(h.compat.release(note), true);
  h.compat.dispose();
  const saved = structuredClone(h.ws.getLayout());
  assert.deepEqual(structuredClone(loadCompatibility().filterLayout(saved).removedIds), []);
  const restarted = installedHost(); restarted.compat.install(); await restarted.ws.setLayout(saved);
  assert.ok(restarted.ws.getLeafById(ordinaryId), "released note must survive a fresh incoming filter");
  assert.ok(restarted.ws.getLeafById("same-note")); assert.ok(restarted.ws.getLeafById("other-note"));
});

test(`installed Obsidian ${version}: queued tab rendering adopts a leaf into the pop-out document after synchronous creation`, async () => {
  assert.ok(scheduler);
  const mainDocument = {}, popoutDocument = {};
  const state = vm.runInNewContext(`
    const wo=queueMicrotask;
    ${scheduler}
    Math.clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
    class Mo {}
    const to=()=>{}, io=()=>{}, Zt=()=>{};
    function element(document){return {
      ownerDocument:document,isConnected:document===popoutDocument,children:[],parentNode:null,
      style:{setProperty(){}},toggleClass(){},toggle(){},isShown(){return false},
      appendChild(child){this.children.push(child);child.parentNode=this;child.ownerDocument=this.ownerDocument;child.isConnected=this.isConnected},
      setChildrenInPlace(children){this.children=[];for(const child of children)this.appendChild(child)}
    }}
    const leaf={containerEl:element(mainDocument),tabHeaderEl:element(mainDocument),loadIfDeferred(){}};
    class Tabs {
      ${method(tabClass, "updateTabDisplay")}
      ${method(tabClass, "recomputeChildrenDimensions")}
      constructor(){this.isStacked=false;this.currentTab=0;this.children=[leaf];this.tabsInnerEl=element(popoutDocument);this.tabsContainerEl=element(popoutDocument);this.containerEl=element(popoutDocument)}
      getRoot(){return {}} updateSlidingTabs(){}
    }
    const tabs=new Tabs();
    const requestUpdate=R6(()=>tabs.recomputeChildrenDimensions());
    requestUpdate();
    ({leaf,tabs});
  `, { mainDocument, popoutDocument, queueMicrotask });
  assert.equal(state.leaf.containerEl.ownerDocument, mainDocument);
  assert.equal(state.leaf.containerEl.isConnected, false);
  await Promise.resolve();
  assert.equal(state.leaf.containerEl.ownerDocument, popoutDocument);
  assert.equal(state.leaf.containerEl.isConnected, true);
});
