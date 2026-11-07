import type { Workspace, WorkspaceLeaf } from "obsidian";

type RecordValue = Record<string, any>;
type Method = (this: unknown, ...args: any[]) => any;
type InternalWorkspace = Workspace & { setLayout?: Method };
const prefix = "popnote-owned-v1:";
const ownedId = /^popnote-owned-v1:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const record = (value: unknown): value is RecordValue =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** Only serialized floating trees are edited, always on a separate deep copy. */
export function filterLayout(input: unknown): { layout: RecordValue; removedIds: string[] } {
  if (!record(input)) throw new Error("layout is not an object");
  const layout = structuredClone(input);
  if (layout.main !== undefined && (!record(layout.main) || layout.main.type !== "split")) {
    throw new Error("unexpected main layout");
  }
  const removedIds: string[] = [];
  if (layout.floating === undefined) return { layout, removedIds };
  const seen = new Set<string>();
  let count = 0;
  const validate = (node: unknown, parent: string, depth: number): void => {
    if (++count > 10000 || depth > 64 || !record(node) || typeof node.id !== "string" || !node.id || seen.has(node.id)) {
      throw new Error("invalid or duplicate floating node");
    }
    seen.add(node.id);
    const allowed = parent === "root" ? ["floating"] : parent === "floating" ? ["window"] : ["split", "tabs", "leaf"];
    if (!allowed.includes(node.type)) throw new Error(`unexpected floating node type: ${String(node.type)}`);
    if (node.id.startsWith("popnote-owned-") && (node.type !== "leaf" || !ownedId.test(node.id))) {
      throw new Error("unrecognized ownership marker");
    }
    if (node.type === "leaf") {
      if (!record(node.state) || typeof node.state.type !== "string" || node.children !== undefined) {
        throw new Error("unexpected leaf state");
      }
      return;
    }
    if (!Array.isArray(node.children) || (node.currentTab !== undefined &&
      (!Number.isInteger(node.currentTab) || node.currentTab < 0))) throw new Error("unexpected children or selected tab");
    for (const child of node.children) validate(child, node.type, depth + 1);
  };
  validate(layout.floating, "root", 0);
  const prune = (node: RecordValue): RecordValue | null => {
    if (node.type === "leaf") {
      if (!ownedId.test(node.id)) return node;
      removedIds.push(node.id);
      return null;
    }
    const children: RecordValue[] = node.children;
    const selected = children[node.currentTab ?? 0];
    const kept = children.map(prune).filter((child): child is RecordValue => child !== null);
    if (kept.length !== children.length) {
      node.children = kept;
      if (!kept.length) return null;
      if (node.currentTab !== undefined) {
        const index = selected ? kept.indexOf(selected) : -1;
        node.currentTab = index >= 0 ? index : Math.min(node.currentTab, kept.length - 1);
      }
    }
    return node;
  };
  if (!prune(layout.floating)) delete layout.floating;
  if (removedIds.includes(layout.active)) delete layout.active;
  return { layout, removedIds };
}

/** All experimental layout hooks and writable leaf-ID access live here. */
export class WorkspaceCompatibility {
  private host: InternalWorkspace;
  private active = false;
  private failed = false;
  private cold = false;
  private incoming = 0;
  private incomingBeforeReady = false;
  private undo: Array<() => void> = [];
  private originalGet?: Method;
  private owned = new Map<string, WorkspaceLeaf>();
  private previousIds = new Map<WorkspaceLeaf, string>();
  private serializers = new Map<WorkspaceLeaf, { release: (id: string) => void; restore: () => void }>();

  constructor(workspace: Workspace, private notice: (message: string) => void,
    private trace: (event: string, details: Record<string, unknown>) => void,
    private beforeSave: () => void = () => {}) {
    this.host = workspace;
  }

  private fail(error: unknown): void {
    if (this.failed) return;
    this.failed = true;
    const reason = error instanceof Error ? error.message : String(error);
    this.trace("compat-failed", { reason });
    this.notice(`PopNote: restart compatibility unavailable (${reason}). Original layout left unchanged; close PopNote manually before restarting.`);
  }

  private filter(value: unknown, direction: string): unknown {
    if (!this.active || this.failed) return value;
    try {
      const result = filterLayout(value);
      if (direction === "incoming") {
        this.incoming++;
        if (!this.host.layoutReady) this.incomingBeforeReady = true;
      }
      this.trace(`${direction}-layout-filter`, {
        removedIds: result.removedIds, layoutReadyAtEntry: this.host.layoutReady, incomingCalls: this.incoming,
      });
      return result.layout;
    } catch (error) {
      this.fail(error);
      return value;
    }
  }

  install(): boolean {
    if (this.active) return !this.failed;
    this.cold = !this.host.layoutReady;
    const compat = this;
    try {
      for (const name of ["getLayout", "setLayout"] as const) {
        const original = this.host[name];
        if (typeof original !== "function") throw new Error(`${name} is unavailable`);
        const descriptor = Object.getOwnPropertyDescriptor(this.host, name);
        const wrapper: Method = name === "getLayout" ? function (...args) {
          if (compat.active) compat.beforeSave();
          return compat.filter(original.apply(this, args), "outgoing");
        } : function (...args) {
          if (!compat.active || compat.failed) return original.apply(this, args);
          const next = args.slice();
          const filtered = compat.filter(args[0], "incoming");
          if (next.length) next[0] = filtered;
          compat.trace("incoming-layout-delegate", { incomingCalls: compat.incoming });
          // Do not await or catch the host: preserve its exact return/Promise and errors.
          return original.apply(this, next);
        };
        if (!Reflect.set(this.host, name, wrapper) || this.host[name] !== wrapper) throw new Error(`${name} cannot be wrapped`);
        if (name === "getLayout") this.originalGet = original;
        this.undo.push(() => {
          // A later plugin may retain our wrapper in its chain. It becomes pass-through.
          if (this.host[name] !== wrapper) return;
          if (descriptor) Object.defineProperty(this.host, name, descriptor);
          else Reflect.deleteProperty(this.host, name);
        });
      }
      this.active = true;
      this.trace("compat-installed", { installedBeforeLayoutReady: this.cold });
      return true;
    } catch (error) {
      this.dispose(); this.fail(error); return false;
    }
  }

  canOpen(): boolean {
    return this.active && !this.failed && this.host.layoutReady && (!this.cold || this.incomingBeforeReady);
  }

  private prepareSerialization(leaf: WorkspaceLeaf): void {
    const item = leaf as WorkspaceLeaf & { serialize: Method };
    const original = item.serialize;
    const descriptor = Object.getOwnPropertyDescriptor(item, "serialize");
    if (typeof original !== "function") throw new Error("leaf serialization is unavailable");
    const probe = original.call(leaf);
    if (!record(probe) || probe.type !== "leaf" || typeof probe.id !== "string") throw new Error("unexpected leaf serialization");
    let releasedId: string | undefined;
    // Prepare while the new leaf is writable. Even if it is frozen later, release
    // can replace its serialized marker without editing any unrelated leaf.
    const wrapper: Method = function (...args) {
      const value = original.apply(this, args);
      return releasedId && record(value) ? { ...value, id: releasedId } : value;
    };
    if (!Reflect.set(item, "serialize", wrapper) || item.serialize !== wrapper) throw new Error("leaf serialization cannot be guarded");
    this.serializers.set(leaf, {
      release: (id) => { releasedId = id; },
      restore: () => {
        if (item.serialize !== wrapper) return;
        // A frozen leaf may retain an inert forwarding wrapper until it closes.
        try {
          if (descriptor) Object.defineProperty(item, "serialize", descriptor);
          else Reflect.deleteProperty(item, "serialize");
        } catch { /* No writable descriptor remains; forwarding is harmless. */ }
      },
    });
  }

  claim(leaf: WorkspaceLeaf): boolean {
    if (!this.canOpen()) return false;
    const item = leaf as WorkspaceLeaf & { id: string };
    const previous = item.id;
    try {
      if (typeof previous !== "string" || this.host.getLeafById(previous) !== leaf) throw new Error("initial leaf lookup failed");
      this.prepareSerialization(leaf);
      const id = prefix + globalThis.crypto.randomUUID();
      if (!Reflect.set(item, "id", id) || item.id !== id || this.host.getLeafById(id) !== leaf || this.host.getLeafById(previous) === leaf) {
        throw new Error("renamed leaf lookup failed");
      }
      const raw = this.originalGet!.call(this.host);
      const checked = filterLayout(raw);
      if (checked.removedIds.filter((value) => value === id).length !== 1) throw new Error("owned leaf serialization failed");
      this.owned.set(id, leaf);
      this.previousIds.set(leaf, previous);
      this.host.requestSaveLayout();
      this.trace("ownership-claimed", { previousId: previous, id, lookupVerified: true, serializationVerified: true });
      return true;
    } catch (error) {
      try { if (item.id !== previous) Reflect.set(item, "id", previous); } catch { /* Leave cleanup to the owned leaf's caller. */ }
      this.serializers.get(leaf)?.restore();
      this.serializers.delete(leaf);
      this.fail(error); return false;
    }
  }

  owns(leaf: WorkspaceLeaf): boolean {
    const id = (leaf as WorkspaceLeaf & { id: string }).id;
    return this.active && !this.failed && this.owned.get(id) === leaf && this.host.getLeafById(id) === leaf;
  }

  /** A released leaf is ordinary content, including when it later restores. */
  release(leaf: WorkspaceLeaf): boolean {
    const previous = this.previousIds.get(leaf);
    if (previous === undefined) return true;
    const item = leaf as WorkspaceLeaf & { id: string };
    try {
      const existing = this.host.getLeafById(previous);
      const id = !existing || existing === leaf ? previous : globalThis.crypto.randomUUID();
      let renamed = false;
      try { renamed = Reflect.set(item, "id", id) && item.id === id; } catch { /* Use the prepared serialization fallback. */ }
      const serializer = this.serializers.get(leaf);
      if (!renamed) {
        if (!serializer) throw new Error("released leaf serialization guard is unavailable");
        serializer.release(id);
        this.trace("ownership-release-serialized-id", { id });
      } else {
        const found = this.host.getLeafById(id);
        if (found && found !== leaf) throw new Error("released leaf lookup changed");
        serializer?.restore();
      }
      for (const [marked, value] of this.owned) if (value === leaf) this.owned.delete(marked);
      this.previousIds.delete(leaf);
      // A fallback wrapper stays on this released leaf so disable/restart cannot
      // serialize the old ownership marker. It holds no plugin/host reference.
      this.serializers.delete(leaf);
      this.trace("ownership-released", { id, ordinary: true });
      this.host.requestSaveLayout();
      return true;
    } catch (error) {
      this.fail(error);
      return false;
    }
  }

  finishStartup(): void {
    const passed = !this.failed && this.incomingBeforeReady;
    this.trace("compat-startup-check", {
      coldStart: this.cold, incomingCalls: this.incoming, incomingBeforeReady: this.incomingBeforeReady,
      verified: this.cold ? passed : false,
    });
    if (this.cold && !passed) this.fail(new Error("incoming hook was not observed before layout-ready"));
  }

  audit(): void {
    if (!this.active || this.failed) return;
    try {
      for (const [id, leaf] of this.owned) {
        const found = this.host.getLeafById(id);
        this.trace("ownership-lookup", { id, found: found === leaf, connected: leaf.view.containerEl.isConnected });
        if (!found && !leaf.view.containerEl.isConnected) this.owned.delete(id);
        else if (found !== leaf) this.fail(new Error("owned leaf lookup changed"));
      }
    } catch (error) { this.fail(error); }
  }

  dispose(): void {
    this.active = false;
    this.owned.clear();
    this.previousIds.clear();
    for (const serializer of this.serializers.values()) serializer.restore();
    this.serializers.clear();
    for (const undo of this.undo.reverse()) {
      try { undo(); } catch (error) { this.fail(error); }
    }
    this.undo = [];
  }
}
