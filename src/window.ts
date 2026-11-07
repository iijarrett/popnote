import { WorkspaceWindow, type App, type TFile, type WorkspaceLeaf } from "obsidian";
import type { WorkspaceCompatibility } from "./workspace-compat";

/** Owns only the public Obsidian leaf and its DOM. */
export class SpikeWindow {
  private leaf: WorkspaceLeaf | null = null;
  private document: Document | null = null;
  private container: WorkspaceWindow | null = null;
  private controls: HTMLElement | null = null;
  private controlsHost: HTMLElement | null = null;
  private claimed = false;
  private app: App;
  private cancelAttachment?: () => void;

  constructor(app: App, private compatibility: WorkspaceCompatibility,
    private trace: (event: string, details: Record<string, unknown>) => void = () => {},
    private onRelease: (reason: string) => void = () => {}) {
    this.app = app;
  }

  isOpen(): boolean {
    const open = this.checkOwnership() && !!this.leaf && !!this.document?.defaultView &&
      !this.document.defaultView.closed && this.leaf.view.containerEl.isConnected &&
      this.leaf.view.containerEl.ownerDocument === this.document;
    if (!open && this.document) this.release("previous pop-out is unavailable");
    return open;
  }

  private exclusive(leaf: WorkspaceLeaf, container: WorkspaceWindow): boolean {
    const main = this.app.workspace.containerEl.ownerDocument;
    if (container.doc === main || container.win === main.defaultView || container.win.closed ||
      container.win.document !== container.doc || container.doc.defaultView !== container.win ||
      leaf.getContainer() !== container) return false;
    let count = 0;
    this.app.workspace.iterateAllLeaves((other) => { if (other.getContainer() === container) count++; });
    return count === 1;
  }

  checkOwnership(): boolean {
    if (!this.leaf || !this.container) return false;
    try {
      const host = (this.leaf.view as { contentEl?: HTMLElement }).contentEl;
      const controlsAttached = !this.controls || (host === this.controlsHost && host?.isConnected &&
        this.controls.isConnected && this.controls.parentElement === host &&
        this.controls.ownerDocument === this.document);
      if (controlsAttached && this.exclusive(this.leaf, this.container) &&
        (!this.claimed || this.compatibility.owns(this.leaf))) return true;
    } catch { /* Unknown ownership is never authority to control or detach a window. */ }
    this.release("window is no longer exclusively owned");
    return false;
  }

  ownsDocument(document: Document): boolean {
    return this.document === document && this.isOpen();
  }

  private release(reason: string, detach = false): void {
    const leaf = this.leaf;
    if (!leaf) return;
    const container = this.container;
    this.leaf = null;
    this.container = null;
    this.document = null;
    this.claimed = false;
    this.cancelAttachment?.();
    this.controls?.remove();
    this.controls = null;
    this.controlsHost?.classList.remove("popnote-overlay-host");
    this.controlsHost = null;
    this.onRelease(reason);
    // Keep the marker until detach: a synchronous host save during close must
    // not serialize this still-live owned leaf as an ordinary restorable tab.
    if (detach && container) {
      try {
        if (this.exclusive(leaf, container)) {
          leaf.detach();
          this.trace("popout-detach", { completed: true });
        }
      } catch { this.trace("popout-detach", { completed: false }); }
    }
    this.compatibility.release(leaf);
    this.trace("popout-released", { reason });
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
    if (!separate || !this.exclusive(leaf, container)) throw new Error("Obsidian did not return a separate pop-out with one leaf.");
    this.leaf = leaf;
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
    const host = (this.leaf.view as { contentEl?: HTMLElement }).contentEl;
    if (!host || host.ownerDocument !== this.document || !this.leaf.view.containerEl.contains(host)) {
      throw new Error("Note content container is unavailable; standard window controls remain available.");
    }
    const controls = this.document.createElement("div");
    controls.className = "popnote-overlay";
    this.controls = controls;
    this.controlsHost = host;
    host.classList.add("popnote-overlay-host");
    host.append(controls);
    return controls;
  }

  close(): void {
    const detach = this.checkOwnership();
    this.release("closed", detach);
  }
}
