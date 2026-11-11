import { Notice, Platform, Plugin, PluginSettingTab, Setting, TFile, apiVersion } from "obsidian";
import { RestartTrace } from "./src/diagnostics";
import { SpikeNative, type WindowBounds } from "./src/native";
import { OverlayControls } from "./src/overlay";
import { SpikeWindow } from "./src/window";
import { WorkspaceCompatibility } from "./src/workspace-compat";

export default class PopNoteSpike extends Plugin {
  private native: SpikeNative | null = null;
  private popout: SpikeWindow | null = null;
  private notePath: string | null = null;
  private overlay?: OverlayControls;
  private busy = false;
  private operation = 0;
  private stopped = false;
  private pinned = false;
  private opacity = 1;
  private bounds?: WindowBounds;
  private stopWatchingBounds?: () => void;
  private storedData: Record<string, unknown> = {};
  private saveTimer?: ReturnType<typeof setTimeout>;
  private saveQueue = Promise.resolve();
  private saveRevision = 0;
  private pendingSaves = 0;
  private savedShortcut?: string;
  private restartTrace?: RestartTrace;
  private compatibility?: WorkspaceCompatibility;
  private shortcut = "";
  private shortcutActive = false;
  private allSpaces = false;

  async onload(): Promise<void> {
    if (!Platform.isDesktop) return;
    const mainWindow = this.app.workspace.containerEl.ownerDocument.defaultView;
    this.restartTrace = new RestartTrace(this.app.vault.getName(), () => mainWindow?.localStorage);
    this.trace("plugin-load", { layoutReady: this.app.workspace.layoutReady, obsidianVersion: apiVersion });
    // Install before loadData or any other await, not merely before layout-ready.
    this.compatibility = new WorkspaceCompatibility(this.app.workspace,
      (message) => { new Notice(message); }, (event, details) => this.trace(event, details),
      () => { this.popout?.checkOwnership(); });
    this.compatibility.install();
    const defaults = {
      shortcut: Platform.isMacOS ? "Command+Option+P" : "Control+Alt+P",
      allSpaces: Platform.isMacOS,
      pinFallbackLevel: Platform.isWin ? "pop-up-menu" as const : undefined,
    };
    this.shortcut = defaults.shortcut;
    await this.loadWindowSettings();
    if (this.stopped) return;
    this.allSpaces = defaults.allSpaces;
    this.popout = new SpikeWindow(this.app, this.compatibility, (event, details) => this.trace(event, details),
      (reason) => this.releaseWindowBinding(reason));
    this.native = new SpikeNative((message) => {
      console.info(`[PopNote spike] ${message}`);
      this.trace("native-action", { message });
    }, (event, details) => this.trace(event, details), defaults.pinFallbackLevel);
    this.registerEvent(this.app.workspace.on("window-open", () => this.traceLayout("workspace-window-open")));
    this.registerEvent(this.app.workspace.on("window-close", () => this.traceLayout("workspace-window-close")));
    this.registerEvent(this.app.workspace.on("layout-change", () => {
      this.popout?.checkOwnership();
      this.compatibility?.audit();
      this.refreshOverlayLabel();
    }));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.refreshOverlayLabel()));
    this.app.workspace.onLayoutReady(() => {
      if (!this.stopped) {
        this.compatibility?.finishStartup();
        this.traceLayout("layout-ready");
      }
    });
    if (mainWindow) this.registerDomEvent(mainWindow, "beforeunload", () => {
      this.trace("main-beforeunload", { pendingSaves: this.pendingSaves, boundsSaveScheduled: this.saveTimer !== undefined });
      this.flushWindowSave();
    });
    this.traceLayout("startup-snapshot");
    this.addCommand({
      id: "prepare-spike",
      name: "Prepare spike from current note",
      callback: () => {
        if (this.popout?.isOpen()) {
          new Notice("PopNote: close the spike pop-out before choosing another test note.");
          return;
        }
        const file = this.app.workspace.getActiveFile();
        if (!file) {
          new Notice("PopNote: open a disposable note in the test vault first.");
          return;
        }
        this.notePath = file.path;
        this.trace("note-prepared", { notePath: this.notePath });
        this.queueSave("note");
        new Notice(this.shortcutActive
          ? `PopNote: prepared ${file.path}. Minimize Obsidian, then press ${this.shortcut}.`
          : `PopNote: prepared ${file.path}. No shortcut registered; apply one in settings or use Toggle spike pop-out.`);
      },
    });
    this.addCommand({
      id: "toggle-spike",
      name: "Toggle spike pop-out",
      callback: () => { void this.toggle("command"); },
    });
    this.addCommand({
      id: "show-controls",
      name: "Show controls",
      callback: () => { this.overlay?.recover(true); },
    });
    this.addSettingTab(new SpikeSettings(this));
    this.applyShortcut(this.shortcut, false);
  }

  private trace(event: string, details: Record<string, unknown> = {}): void {
    this.restartTrace?.record(event, details);
  }

  private traceLayout(event: string): void {
    try {
      const mainDocument = this.app.workspace.containerEl.ownerDocument;
      const floatingDocuments = new Set<Document>();
      const floatingFiles: string[] = [];
      this.app.workspace.iterateAllLeaves((leaf) => {
        const document = leaf.view.containerEl.ownerDocument;
        if (document === mainDocument) return;
        floatingDocuments.add(document);
        const file = leaf.getViewState().state?.file;
        if (typeof file === "string") floatingFiles.push(file);
      });
      this.trace(event, {
        layoutReady: this.app.workspace.layoutReady, ownedPopoutOpen: this.popout?.isOpen() ?? false,
        floatingWindows: floatingDocuments.size, floatingFiles,
      });
      this.native?.traceWindows(event);
    } catch {
      this.trace("layout-diagnostic-unavailable", { trigger: event });
    }
  }

  private async loadWindowSettings(): Promise<void> {
    try {
      const data = await this.loadData();
      if (typeof data !== "object" || data === null || Array.isArray(data)) return;
      this.storedData = data;
      const { windowBounds, opacity, notePath, shortcut } = data;
      if (typeof notePath === "string" && notePath.trim()) this.notePath = notePath;
      if (typeof shortcut === "string" && shortcut.trim()) {
        this.savedShortcut = shortcut.trim();
        this.shortcut = this.savedShortcut;
      }
      if (typeof opacity === "number" && Number.isFinite(opacity)) {
        this.opacity = Math.min(1, Math.max(0.3, opacity));
      }
      if (windowBounds && Number.isFinite(windowBounds.width) && Number.isFinite(windowBounds.height) &&
        windowBounds.width > 0 && windowBounds.height > 0) {
        const { x, y, width, height } = windowBounds;
        this.bounds = Number.isFinite(x) && Number.isFinite(y) ? { x, y, width, height } : { width, height };
      }
    } catch {
      this.trace("settings-load-failed");
      new Notice("PopNote: saved window settings could not be read.");
    } finally {
      this.trace("settings-loaded", { notePath: this.notePath, shortcut: this.shortcut, windowBounds: this.bounds, opacity: this.opacity });
    }
  }

  private scheduleWindowSave(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flushWindowSave(), 250);
  }

  private flushWindowSave(): void {
    if (this.saveTimer === undefined) return;
    this.queueSave("bounds");
  }

  private queueSave(reason: string): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    const snapshot = {
      ...this.storedData, notePath: this.notePath, shortcut: this.savedShortcut,
      windowBounds: this.bounds, opacity: this.opacity,
    };
    const revision = ++this.saveRevision;
    this.pendingSaves++;
    this.trace("save-requested", {
      revision, reason, notePath: snapshot.notePath, shortcut: snapshot.shortcut,
      windowBounds: snapshot.windowBounds, opacity: snapshot.opacity,
    });
    this.saveQueue = this.saveQueue.then(async () => {
      this.trace("save-start", { revision, reason });
      try {
        await this.saveData(snapshot);
        this.trace("save-complete", { revision, reason, notePath: snapshot.notePath, shortcut: snapshot.shortcut, windowBounds: snapshot.windowBounds, opacity: snapshot.opacity });
      } catch {
        this.trace("save-failed", { revision, reason });
        new Notice("PopNote: settings could not be saved.");
      } finally {
        this.pendingSaves--;
      }
    });
  }

  applyShortcut(value: string, persist = true): void {
    const accelerator = value.trim();
    if (!accelerator) {
      new Notice("PopNote: enter a shortcut first.");
      return;
    }
    this.shortcutActive = this.native?.registerShortcut(accelerator, () => { void this.toggle("shortcut"); }) ?? false;
    this.trace("shortcut-registration", { accelerator, success: this.shortcutActive, source: persist ? "apply" : "startup" });
    if (this.shortcutActive) {
      this.shortcut = accelerator;
      if (persist) {
        this.savedShortcut = accelerator;
        this.queueSave("shortcut");
      }
    }
  }

  currentShortcut(): string {
    return this.shortcut;
  }

  private refreshOverlayLabel(): void {
    if (!this.overlay) return;
    const label = this.popout?.noteLabel();
    if (label !== undefined) this.overlay?.setNote(label);
  }

  private releaseWindowBinding(reason: string): void {
    this.operation++;
    this.busy = false;
    this.stopWatchingBounds?.();
    this.stopWatchingBounds = undefined;
    this.flushWindowSave();
    const overlay = this.overlay;
    this.overlay = undefined;
    try { overlay?.dispose(); }
    finally { this.native?.release(); }
    if (reason === "window is no longer exclusively owned" && !this.stopped) {
      new Notice("PopNote: window released as ordinary workspace content. Summon again for a dedicated PopNote.");
    }
  }

  private async toggle(source: "command" | "shortcut"): Promise<void> {
    this.trace("toggle-request", { source, busy: this.busy, stopped: this.stopped, notePath: this.notePath });
    if (this.stopped || !this.native || !this.popout) return;
    const open = this.popout.isOpen();
    if (this.busy) return;
    this.busy = true;
    const operation = ++this.operation;
    try {
      if (open) {
        this.native.toggle();
        return;
      }
      const file = this.notePath ? this.app.vault.getAbstractFileByPath(this.notePath) : null;
      if (!(file instanceof TFile)) {
        this.trace("summon-note-unavailable", { notePath: this.notePath });
        new Notice(this.notePath
          ? `PopNote: saved note ${this.notePath} is unavailable. Prepare a test note again.`
          : "PopNote: run Prepare spike from current note first.");
        return;
      }
      this.trace("popout-create-request", { source, notePath: file.path });
      const document = await this.popout.open(file);
      this.trace("popout-created", { source, notePath: file.path });
      if (this.stopped) {
        this.popout.close();
        return;
      }
      // Each callback belongs to this exact opening, never to a later native binding.
      const allowed = () => !this.stopped && this.popout?.ownsDocument(document) === true;
      if (!allowed()) return;
      const controls = this.popout.mountControls();
      const overlay = this.overlay = new OverlayControls(controls, file.path, this.pinned, this.opacity, {
        allowed,
        pin: (value) => {
          if (!allowed() || !this.native?.pin(value)) return false;
          this.pinned = value;
          return true;
        },
        opacity: (value) => {
          if (!allowed() || !this.native?.opacity(value)) return false;
          this.opacity = value;
          this.trace("opacity-changed", { opacity: value });
          this.queueSave("opacity");
          return true;
        },
      });
      this.stopWatchingBounds?.();
      this.stopWatchingBounds = undefined;
      if (!this.native.bind(document, allowed)) return;
      if (this.bounds) this.native.restoreBounds(this.bounds);
      this.trace("restore-request", { windowBounds: this.bounds, opacity: this.opacity });
      this.stopWatchingBounds = this.native.watchBounds((bounds) => {
        if (!allowed()) return;
        overlay.movement();
        this.bounds = bounds;
        this.scheduleWindowSave();
      });
      this.native.allSpaces(this.allSpaces);
      const pinApplied = this.native.pin(this.pinned);
      const opacityApplied = this.native.opacity(this.opacity);
      this.trace("opacity-restore", { opacity: this.opacity, applied: opacityApplied });
      overlay.setNativeAvailability(pinApplied, opacityApplied);
      this.native.traceWindows("explicit-summon-complete");
      // Creation already shows the public pop-out; do not toggle it back to hidden.
    } catch (error) {
      this.trace("summon-failed", { message: error instanceof Error ? error.message : String(error) });
      new Notice(`PopNote: spike could not open: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (this.operation === operation) this.busy = false;
    }
  }

  onunload(): void {
    this.trace("plugin-unload", { pendingSaves: this.pendingSaves, boundsSaveScheduled: this.saveTimer !== undefined, ownedPopoutOpen: this.popout?.isOpen() ?? false });
    this.stopped = true;
    this.stopWatchingBounds?.();
    this.flushWindowSave();
    this.native?.dispose();
    this.trace("owned-popout-close-request");
    this.popout?.close();
    this.compatibility?.dispose();
    this.trace("plugin-unload-return", { pendingSaves: this.pendingSaves });
    this.overlay?.dispose();
    this.overlay = undefined;
  }
}

class SpikeSettings extends PluginSettingTab {
  private spike: PopNoteSpike;

  constructor(spike: PopNoteSpike) {
    super(spike.app, spike);
    this.spike = spike;
  }

  display(): void {
    this.containerEl.empty();
    this.containerEl.createEl("p", {
      text: "Prepare a note once. The note, successfully applied shortcut, size, position, and opacity are remembered. Show controls can be assigned a hotkey in Settings > Hotkeys; it does not change editor Tab behavior. Use Super+Q to test Win+Q. Restart diagnostics are kept locally and in the console.",
    });
    let accelerator = this.spike.currentShortcut();
    new Setting(this.containerEl).setName("Global shortcut (spike)")
      .addText((text) => text.setValue(accelerator).onChange((value) => { accelerator = value; }))
      .addButton((button) => button.setButtonText("Apply").onClick(() => {
        this.spike.applyShortcut(accelerator);
      }));
  }
}
