import { WorkspaceWindow, type App, type TFile, type WorkspaceLeaf, type WorkspaceParent } from "obsidian";
import type { WorkspaceCompatibility } from "./workspace-compat";

type TabGroup = WorkspaceParent & {
  containerEl: HTMLElement;
  tabHeaderContainerEl: HTMLElement;
  tabsContainerEl: HTMLElement;
  children: WorkspaceLeaf[];
  currentTab: number;
};

/** Tracks the tabs created by PopNote in one dedicated window. */
export class SpikeWindow {
  private leaf: WorkspaceLeaf | null = null;
  private document: Document | null = null;
  private container: WorkspaceWindow | null = null;
  private controls: HTMLElement | null = null;
  private controlsHost: HTMLElement | null = null;
  private claimed = false;
  private ownedLeaves = new Set<WorkspaceLeaf>();
  private tabGroup?: TabGroup;
  private addingTab = false;
  private stopTabInput?: () => void;
  private app: App;
  private cancelAttachment?: () => void;

  constructor(app: App, private compatibility: WorkspaceCompatibility,
    private trace: (event: string, details: Record<string, unknown>) => void = () => {},
    private onRelease: (reason: string) => void = () => {}) {
    this.app = app;
  }

  isOpen(): boolean {
    if (this.addingTab) return false;
    const open = this.checkOwnership() && !!this.leaf && !!this.document?.defaultView &&
      !this.document.defaultView.closed && this.leaf.view.containerEl.isConnected &&
      this.leaf.view.containerEl.ownerDocument === this.document;
    if (!open && this.document) this.release("previous pop-out is unavailable");
    return open;
  }

  private validContainer(container: WorkspaceWindow): boolean {
    const main = this.app.workspace.containerEl.ownerDocument;
    return container.doc !== main && container.win !== main.defaultView && !container.win.closed &&
      container.win.document === container.doc && container.doc.defaultView === container.win;
  }

  private leavesIn(container: WorkspaceWindow): WorkspaceLeaf[] {
    const leaves: WorkspaceLeaf[] = [];
    this.app.workspace.iterateAllLeaves((leaf) => { if (leaf.getContainer() === container) leaves.push(leaf); });
    return leaves;
  }

  checkOwnership(): boolean {
    if (this.addingTab || !this.leaf || !this.container) return false;
    try {
      const container = this.container;
      const group = this.tabGroup;
      const host = group?.containerEl ?? (this.leaf.view as { contentEl?: HTMLElement }).contentEl;
      const controlsAttached = !this.controls || (host === this.controlsHost && host?.isConnected &&
        this.controls.isConnected && this.controls.parentElement === host &&
        this.controls.ownerDocument === this.document);
      const present = new Set<WorkspaceLeaf>();
      let moved = false;
      this.app.workspace.iterateAllLeaves((leaf) => {
        if (leaf.getContainer() === container) present.add(leaf);
        else if (this.ownedLeaves.has(leaf)) moved = true;
      });
      if (controlsAttached && !moved && present.size && this.validContainer(container) &&
        [...present].every((leaf) => this.ownedLeaves.has(leaf) && (!group || leaf.parent === group) &&
          (!this.claimed || this.compatibility.owns(leaf)))) {
        if (!present.has(this.leaf)) this.leaf = present.values().next().value!;
        const closed = [...this.ownedLeaves].filter((leaf) => !present.has(leaf));
        for (const leaf of closed) this.ownedLeaves.delete(leaf);
        for (const leaf of closed) this.compatibility.release(leaf);
        return true;
      }
    } catch { /* Unknown ownership is never authority to control or detach a window. */ }
    this.release("window is no longer exclusively owned");
    return false;
  }

  ownsDocument(document: Document): boolean {
    return this.document === document && (this.addingTab || this.isOpen());
  }

  private release(reason: string, detach = false): void {
    if (!this.leaf) return;
    const { container, controls, controlsHost, ownedLeaves, stopTabInput, cancelAttachment } = this;
    this.leaf = null;
    this.container = null;
    this.document = null;
    this.controls = null;
    this.controlsHost = null;
    this.claimed = false;
    this.ownedLeaves = new Set();
    this.tabGroup = undefined;
    this.stopTabInput = undefined;

    stopTabInput?.();
    cancelAttachment?.();
    // Unregister focus handlers before removing a root that may contain focus.
    try { this.onRelease(reason); }
    catch { this.trace("popout-cleanup-failed", { step: "window binding" }); }
    try { if (controls?.parentElement) controls.remove(); }
    catch { this.trace("popout-cleanup-failed", { step: "controls" }); }
    controlsHost?.classList.remove("popnote-overlay-host");

    // Keep the markers through detach so a synchronous save excludes these tabs.
    if (detach && container) {
      try {
        const present = this.leavesIn(container);
        if (this.validContainer(container) && present.every((leaf) => ownedLeaves.has(leaf))) {
          for (const leaf of present) {
            if (leaf.getContainer() !== container || this.leavesIn(container).some((tab) => !ownedLeaves.has(tab))) break;
            leaf.detach();
          }
          this.trace("popout-detach", { completed: true });
        }
      } catch { this.trace("popout-detach", { completed: false }); }
    }
    for (const leaf of ownedLeaves) this.compatibility.release(leaf);
    this.trace("popout-released", { reason });
  }

  private bindNewTabCommand(document: Document): () => void {
    type NewTabCommand = { checkCallback?: (checking: boolean) => boolean | void };
    const app = this.app as App & { commands?: { findCommand?: (id: string) => NewTabCommand | undefined } };
    const workspace = this.app.workspace;
    const command = app.commands?.findCommand?.("workspace:new-tab");
    const original = command?.checkCallback;
    if (!command || typeof original !== "function") return () => {};
    // Obsidian handles the hotkey on window capture before DOM listeners run.
    const delegate = original;
    let enabled = true;
    const popout = this;
    function wrapped(this: NewTabCommand, checking: boolean): boolean | void {
      if (enabled && !checking && document.hasFocus() && popout.ownsDocument(document)) {
        const active = workspace.getMostRecentLeaf();
        if (active && popout.ownedLeaves.has(active) && popout.addTab()) return true;
      }
      return delegate.call(this, checking);
    }
    try { command.checkCallback = wrapped; }
    catch { return () => {}; }
    return () => {
      enabled = false;
      if (command.checkCallback === wrapped) command.checkCallback = original;
    };
  }

  addTab(): boolean {
    const workspace = this.app.workspace as App["workspace"] & {
      createLeafInTabGroup?: (group: WorkspaceParent) => WorkspaceLeaf;
    };
    if (!this.isOpen() || !this.leaf?.parent || !workspace.createLeafInTabGroup) return false;
    const group = this.leaf.parent;
    const container = this.container;
    const existing = new Set<WorkspaceLeaf>();
    workspace.iterateAllLeaves((leaf) => existing.add(leaf));
    let created: WorkspaceLeaf | undefined;
    this.addingTab = true;
    try {
      const leaf = workspace.createLeafInTabGroup(group);
      if (leaf.parent === group && leaf.getContainer() === container &&
        (this.ownedLeaves.has(leaf) || (!existing.has(leaf) && this.compatibility.claim(leaf)))) {
        this.ownedLeaves.add(leaf);
        created = leaf;
      }
    } catch { this.trace("popout-tab-create-failed", {}); }
    finally { this.addingTab = false; }
    if (!this.checkOwnership() || !created) return false;
    try { workspace.setActiveLeaf(created, { focus: true }); }
    catch { this.trace("popout-tab-focus-failed", {}); }
    return true;
  }

  noteLabel(): string | undefined {
    if (!this.isOpen()) return;
    const group = this.tabGroup;
    const leaf = group?.children[group.currentTab] ?? this.leaf!;
    const file = leaf.getViewState?.().state?.file;
    return typeof file === "string" ? file : leaf.view.getDisplayText?.();
  }

  async open(file: TFile): Promise<Document> {
    if (this.isOpen()) return this.document!;
    this.release("previous pop-out is unavailable");
    const workspace = this.app.workspace;
    if (!this.compatibility.canOpen()) throw new Error("restart compatibility is unavailable or workspace is still loading");
    if (typeof workspace.openPopoutLeaf !== "function") {
      throw new Error("Obsidian pop-out API is unavailable.");
    }
    // The verified API is synchronous: claim identity before the first await.
    const leaf = workspace.openPopoutLeaf();
    const container = leaf.getContainer();
    const mainDocument = workspace.containerEl.ownerDocument;
    const separate = container instanceof WorkspaceWindow && container.doc !== mainDocument &&
      container.win !== mainDocument.defaultView && container.win.document === container.doc &&
      container.doc.defaultView === container.win;
    this.trace("popout-container-check", {
      separateContainer: separate, initialViewInMainDocument: leaf.view.containerEl.ownerDocument === mainDocument,
    });
    // Container identity is available before queued DOM adoption. Never claim or detach a main-window leaf.
    if (!separate || !this.validContainer(container) || this.leavesIn(container).length !== 1 || leaf.getContainer() !== container) throw new Error("Obsidian did not return a separate pop-out with one leaf.");
    this.leaf = leaf;
    this.ownedLeaves.add(leaf);
    this.container = container;
    try {
      if (!this.compatibility.claim(leaf)) throw new Error("owned leaf compatibility check failed");
      this.claimed = true;
      await leaf.openFile(file);
      if (this.leaf !== leaf) throw new Error("Pop-out was closed while opening.");
      const document = await this.waitForAttachment(leaf, container);
      if (this.attachedDocument(leaf, container) !== document) throw new Error("Pop-out attachment changed while opening.");
      this.document = document;
      this.trace("popout-attached", { separateDocument: document !== mainDocument, connected: true });
      return document;
    } catch (error) {
      if (this.leaf === leaf) this.close();
      throw error;
    }
  }

  private attachedDocument(leaf: WorkspaceLeaf, container: WorkspaceWindow): Document | null {
    if (this.leaf !== leaf || container.win.closed) throw new Error("Pop-out was closed while awaiting attachment.");
    if (!this.checkOwnership()) throw new Error("Pop-out ownership was released while opening.");
    if (leaf.getContainer() !== container) throw new Error("Pop-out moved while awaiting attachment.");
    const element = leaf.view.containerEl;
    return element.ownerDocument === container.doc && element.isConnected ? container.doc : null;
  }

  private waitForAttachment(leaf: WorkspaceLeaf, container: WorkspaceWindow): Promise<Document> {
    const document = this.attachedDocument(leaf, container);
    if (document) return Promise.resolve(document);
    this.trace("popout-attachment-wait", { timeoutMs: 5000 });
    return new Promise((resolve, reject) => {
      let finished = false;
      let observer: MutationObserver | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (error?: unknown, attached?: Document) => {
        if (finished) return;
        finished = true;
        observer?.disconnect();
        clearTimeout(timer);
        container.win.removeEventListener("pagehide", cancel);
        if (this.cancelAttachment === cancel) this.cancelAttachment = undefined;
        if (error) reject(error);
        else resolve(attached!);
      };
      const cancel = () => finish(new Error("Pop-out was closed while awaiting attachment."));
      const check = () => {
        try {
          const attached = this.attachedDocument(leaf, container);
          if (attached) finish(undefined, attached);
        } catch (error) { finish(error); }
      };
      this.cancelAttachment = cancel;
      try {
        observer = new MutationObserver(check);
        observer.observe(container.doc, { childList: true, subtree: true });
        container.win.addEventListener("pagehide", cancel);
        timer = setTimeout(() => finish(new Error("Pop-out did not attach to its separate document within 5 seconds.")), 5000);
        check();
      } catch (error) { finish(error); }
    });
  }

  mountControls(): HTMLElement {
    if (!this.isOpen() || !this.leaf || !this.document) throw new Error("Pop-out is closed or ownership was released.");
    const leaf = this.leaf;
    const document = this.document;
    const group = leaf.parent as TabGroup | undefined;
    const stableGroup = group?.tabsContainerEl?.parentElement === group?.containerEl &&
      group?.tabHeaderContainerEl?.parentElement === group?.containerEl && group?.containerEl?.ownerDocument === document;
    const host = stableGroup ? group!.containerEl : (leaf.view as { contentEl?: HTMLElement }).contentEl;
    if (!host || host.ownerDocument !== document || (!stableGroup && !leaf.view.containerEl.contains(host))) {
      throw new Error("Note content container is unavailable; standard window controls remain available.");
    }
    const controls = document.createElement("div");
    controls.className = "popnote-overlay";
    this.controls = controls;
    this.controlsHost = host;
    host.classList.add("popnote-overlay-host");
    if (stableGroup) {
      this.tabGroup = group;
      host.insertBefore(controls, group!.tabsContainerEl);
      const click = (event: MouseEvent) => {
        const button = (event.target as Element | null)?.closest?.(".workspace-tab-header-new-tab");
        if (event.button === 0 && button && group!.tabHeaderContainerEl.contains(button)) openTab(event);
      };
      const openTab = (event: MouseEvent) => {
        const workspace = this.app.workspace as { createLeafInTabGroup?: unknown };
        if (!event.isTrusted || event.defaultPrevented || typeof workspace.createLeafInTabGroup !== "function" ||
          !this.ownsDocument(document)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        this.addTab();
      };
      const restoreCommand = this.bindNewTabCommand(document);
      document.addEventListener("click", click, true);
      this.stopTabInput = () => {
        document.removeEventListener("click", click, true);
        restoreCommand();
      };
    } else if (typeof host.prepend === "function") host.prepend(controls);
    else host.append(controls);
    return controls;
  }

  close(): void {
    const detach = this.checkOwnership();
    this.release("closed", detach);
  }
}
