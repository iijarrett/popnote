import assert from "node:assert/strict";
import { test } from "node:test";
import { loadCompatibility, ownedId, leaf, tabs, win, fixture } from "./compat-host.mjs";
const { filterLayout, WorkspaceCompatibility } = loadCompatibility();
const plain = value => structuredClone(value);
function setup() {
  const data = fixture(), notices = [], trace = [], calls = [];
  const result = Promise.resolve("host-return");
  const ws = {
    layoutReady: false,
    getLayout(...args) { calls.push({ method: "get", receiver: this, args }); return data; },
    setLayout(...args) { calls.push({ method: "set", receiver: this, args }); return result; },
    getLeafById(id) { return this.leaves?.find(item => item.id === id) ?? null; },
    leaves: [],
    requestSaveLayout() {},
  };
  const compat = new WorkspaceCompatibility(ws, message => notices.push(message), (event, details) => trace.push({ event, ...plain(details) }));
  return { ws, data, notices, trace, calls, result, compat };
}

test("filter removes only marked floating leaves, preserves same-note windows, and deeply isolates the output", () => {
  const original = fixture(), before = plain(original);
  const result = filterLayout(original);
  assert.deepEqual(plain(result.removedIds), [ownedId]);
  assert.notEqual(result.layout, original);
  assert.equal(result.layout.floating.children.length, 1);
  assert.deepEqual(plain(result.layout.floating.children[0]), before.floating.children[1]);
  assert.equal(result.layout.active, undefined);
  result.layout.main.children[0].children[0].state.state.file = "changed";
  result.layout.extensionData.untouched.push(3);
  assert.deepEqual(original, before);
});

test("mixed tabs survive and selection follows the same surviving tab", () => {
  const original = fixture();
  original.floating.children = [win("mixed", [tabs("mixed-tabs", [leaf(ownedId), leaf("ordinary")], 1)])];
  original.active = "ordinary";
  const result = filterLayout(original).layout;
  assert.equal(result.floating.children[0].children[0].currentTab, 0);
  assert.equal(result.floating.children[0].children[0].children[0].id, "ordinary");
  assert.equal(result.active, "ordinary");
});

test("main-window leaves, unmarked leaves, and preexisting empty containers are not removed", () => {
  const original = fixture();
  original.main.children[0].children.push(leaf(ownedId));
  original.floating.children = [win("empty", [])]; original.active = ownedId;
  const result = filterLayout(original).layout;
  assert.equal(result.main.children[0].children.length, 2);
  assert.equal(result.floating.children.length, 1);
  assert.equal(result.active, ownedId);
});

test("wrappers preserve receiver, extra arguments, original result and exceptions", () => {
  const h = setup(); assert.equal(h.compat.install(), true);
  const receiver = { sentinel: true }, extra = { untouched: true };
  assert.equal(h.ws.setLayout.call(receiver, h.data, extra), h.result);
  const set = h.calls[0];
  assert.equal(set.receiver, receiver); assert.equal(set.args[1], extra);
  assert.notEqual(set.args[0], h.data); assert.equal(set.args[0].floating.children.length, 1);
  const output = h.ws.getLayout.call(receiver, 7, extra);
  assert.equal(h.calls[1].receiver, receiver); assert.deepEqual(h.calls[1].args, [7, extra]);
  assert.notEqual(output, h.data);
  const error = Error("upstream"); h.compat.dispose();
  h.ws.setLayout = () => { throw error; };
  const next = new WorkspaceCompatibility(h.ws, () => {}, () => {}); next.install();
  assert.throws(() => h.ws.setLayout(h.data), value => value === error);
});

test("existing wrappers run; later wrappers are retained on disable and re-enable", () => {
  const h = setup(), get = h.ws.getLayout;
  let earlier = 0, later = 0;
  h.ws.getLayout = function (...args) { earlier++; return get.apply(this, args); };
  const previous = h.ws.getLayout;
  h.compat.install(); const inner = h.ws.getLayout;
  const outer = h.ws.getLayout = function (...args) { later++; return inner.apply(this, args); };
  assert.equal(h.ws.getLayout().floating.children.length, 1);
  h.compat.dispose(); assert.equal(h.ws.getLayout, outer);
  assert.equal(h.ws.getLayout(), h.data);
  const next = new WorkspaceCompatibility(h.ws, () => {}, () => {}); next.install();
  assert.equal(h.ws.getLayout().floating.children.length, 1);
  next.dispose(); assert.equal(h.ws.getLayout, outer);
  assert.equal(earlier, 3); assert.equal(later, 3); assert.notEqual(previous, outer);
});

test("cleanup restores the original own-property or prototype method accurately", () => {
  const h = setup(), own = h.ws.getLayout; h.compat.install(); h.compat.dispose();
  assert.equal(h.ws.getLayout, own);
  const proto = { getLayout: own, setLayout: h.ws.setLayout, getLeafById: h.ws.getLeafById };
  const ws = Object.assign(Object.create(proto), { layoutReady: true });
  const compat = new WorkspaceCompatibility(ws, () => {}, () => {});
  compat.install(); compat.dispose();
  assert.equal(Object.hasOwn(ws, "getLayout"), false);
});

test("unexpected input is passed through unchanged with a compatibility Notice and no new PopNote creation", () => {
  for (const bad of [null, [], { floating: { type: "floating", id: "f", children: {} } },
    { floating: { type: "floating", id: "f", children: [{ type: "mystery", id: "w", children: [] }] } },
    { floating: { type: "floating", id: "f", children: [win("w", [tabs("t", [leaf(ownedId)], -1)])] } }]) {
    const h = setup(); h.compat.install(); const before = plain(bad);
    assert.equal(h.ws.setLayout(bad), h.result);
    assert.equal(h.calls[0].args[0], bad); assert.deepEqual(bad, before);
    assert.ok(h.notices.some(message => /compatibility/i.test(message)));
    assert.equal(h.compat.canOpen(), false);
  }
});

test("an unexpected outgoing layout is returned intact; inaccessible hooks roll back installation", () => {
  const h = setup(), unexpected = { floating: "bad" };
  h.ws.getLayout = () => unexpected; h.compat.install();
  assert.equal(h.ws.getLayout(), unexpected); assert.equal(h.notices.length, 1);
  const q = setup(), before = q.ws.getLayout;
  Object.defineProperty(q.ws, "setLayout", { value: q.ws.setLayout, writable: false, configurable: false });
  assert.equal(q.compat.install(), false); assert.equal(q.ws.getLayout, before);
});

test("claim changes only the exact live leaf ID and verifies lookup and serialized identity", () => {
  const h = setup(); h.ws.layoutReady = true;
  const selected = { id: "native-generated", serialize() { return leaf(this.id); }, view: { containerEl: { isConnected: true } } };
  h.ws.leaves = [selected]; h.ws.activeLeaf = selected;
  h.ws.getLayout = () => {
    const value = fixture(); value.floating.children[0].children[0].children[0].id = selected.id; return value;
  };
  h.compat.install(); assert.equal(h.compat.claim(selected), true);
  assert.match(selected.id, /^popnote-owned-v1:/);
  assert.equal(h.ws.getLeafById(selected.id), selected);
  assert.equal(h.ws.getLeafById("native-generated"), null);
  assert.equal(h.ws.activeLeaf, selected);
  assert.equal(h.ws.getLayout().floating.children.length, 1);
});

test("failed identity verification restores the old ID and blocks further claims", () => {
  const h = setup(), selected = { id: "old" }; h.ws.layoutReady = true; h.ws.leaves = [selected];
  h.compat.install(); assert.equal(h.compat.claim(selected), false);
  assert.equal(selected.id, "old"); assert.equal(h.compat.canOpen(), false);
});

test("release restores an ordinary ID so both outgoing and incoming filtering preserve the tab", () => {
  const h = setup(); h.ws.layoutReady = true;
  const selected = { id: "native-generated", serialize() { return leaf(this.id); }, view: { containerEl: { isConnected: true } } };
  h.ws.leaves = [selected];
  h.ws.getLayout = () => {
    const value = fixture(); value.floating.children[0].children[0].children[0].id = selected.id; return value;
  };
  h.compat.install(); assert.equal(h.compat.claim(selected), true);
  assert.equal(h.compat.release(selected), true);
  assert.equal(selected.id, "native-generated");
  assert.equal(h.ws.getLeafById(selected.id), selected);
  const saved = h.ws.getLayout();
  assert.equal(saved.floating.children.length, 2);
  assert.deepEqual(plain(filterLayout(saved).removedIds), []);
  h.ws.setLayout(saved);
  assert.equal(h.calls.at(-1).args[0].floating.children.length, 2);
  assert.equal(h.compat.release(selected), true, "release must be idempotent");
});

test("release never steals an original ID now used by an ordinary leaf", () => {
  const h = setup(); h.ws.layoutReady = true;
  const selected = { id: "native-generated", serialize() { return leaf(this.id); }, view: { containerEl: { isConnected: true } } };
  h.ws.leaves = [selected];
  h.ws.getLayout = () => {
    const value = fixture(); value.floating.children[0].children[0].children[0].id = selected.id; return value;
  };
  h.compat.install(); assert.equal(h.compat.claim(selected), true);
  const ordinary = { id: "native-generated" }; h.ws.leaves.push(ordinary);
  assert.equal(h.compat.release(selected), true);
  assert.notEqual(selected.id, "native-generated");
  assert.doesNotMatch(selected.id, /^popnote-owned-/);
  assert.equal(h.ws.getLeafById("native-generated"), ordinary);
  assert.deepEqual(plain(filterLayout(h.ws.getLayout()).removedIds), []);
});

test("cold-start proof requires an incoming call before layout-ready; late enable is explicitly unverified", () => {
  const h = setup(); h.compat.install(); h.ws.layoutReady = true; h.compat.finishStartup();
  assert.equal(h.compat.canOpen(), false); assert.equal(h.notices.length, 1);
  const q = setup(); q.ws.layoutReady = true; q.compat.install(); q.compat.finishStartup();
  assert.equal(q.compat.canOpen(), true);
  const r = setup(); r.compat.install(); r.ws.setLayout(r.data); r.ws.layoutReady = true; r.compat.finishStartup();
  assert.equal(r.compat.canOpen(), true);
  assert.ok(r.trace.some(entry => entry.event === "compat-startup-check" && entry.incomingBeforeReady === true));
});

test("unexpected missing arguments retain their original count", () => {
  const h = setup(); h.compat.install(); h.ws.setLayout();
  assert.equal(h.calls[0].args.length, 0); assert.equal(h.notices.length, 1);
});

test("a restoring host can mutate its isolated input without changing the caller's layout", () => {
  const h = setup(), before = plain(h.data);
  h.ws.setLayout = value => { value.main.children[0].children.pop(); return "done"; };
  h.compat.install(); assert.equal(h.ws.setLayout(h.data), "done");
  assert.deepEqual(h.data, before);
});

test("later incoming wrappers survive cleanup and see unchanged input while the old hook is disabled", () => {
  const h = setup(); h.compat.install(); const inner = h.ws.setLayout;
  const outer = h.ws.setLayout = function (...args) { return inner.apply(this, args); };
  h.compat.dispose(); assert.equal(h.ws.setLayout, outer);
  assert.equal(h.ws.setLayout(h.data), h.result); assert.equal(h.calls[0].args[0], h.data);
  const next = new WorkspaceCompatibility(h.ws, () => {}, () => {}); next.install();
  h.ws.setLayout(h.data); assert.notEqual(h.calls[1].args[0], h.data);
  next.dispose(); assert.equal(h.ws.setLayout, outer);
});

test("filter accepts frozen input without modifying any caller-owned branch", () => {
  const value = fixture();
  const freeze = object => { for (const child of Object.values(object)) if (child && typeof child === "object") freeze(child); return Object.freeze(object); };
  freeze(value); const before = structuredClone(value);
  const result = filterLayout(value);
  assert.deepEqual(value, before); assert.equal(result.layout.floating.children.length, 1);
});
