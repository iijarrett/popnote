import { Notice, Platform, Plugin, PluginSettingTab, Setting, TFile, apiVersion } from "obsidian";
import { PopNoteNative, type TrayItem, type WindowBounds } from "./src/native";
import { rankNotes } from "./src/notes";
import { OverlayControls } from "./src/overlay";
import { PopNoteWindow } from "./src/window";
import { WorkspaceCompatibility } from "./src/workspace-compat";

export default class PopNotePlugin extends Plugin {
  private native: PopNoteNative | null = null;
  private popout: PopNoteWindow | null = null;
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
  private pendingSaves = 0;
  private savedShortcut?: string;
  private compatibility?: WorkspaceCompatibility;
  private shortcut = "";
  private shortcutActive = false;
  private allSpaces = false;
  private tray = false;
  private debug = false;
  private helpShown = false;

  async onload(): Promise<void> {
    if (!Platform.isDesktop) return;
    const mainWindow = this.app.workspace.containerEl.ownerDocument.defaultView;
    // Install before loadData or any other await, not merely before layout-ready.
    this.compatibility = new WorkspaceCompatibility(this.app.workspace,
      (message) => { new Notice(message); }, (event, details) => this.log(event, details),
      () => { this.popout?.checkOwnership(); });
    this.compatibility.install();
    const defaults = {
      shortcut: Platform.isMacOS ? "Command+Option+P" : "Control+Alt+P",
      allSpaces: Platform.isMacOS,
      pinFallbackLevel: Platform.isWin ? "pop-up-menu" as const : undefined,
    };
    this.shortcut = defaults.shortcut;
    this.allSpaces = defaults.allSpaces;
    await this.loadWindowSettings();
    if (this.stopped) return;
    this.log("plugin-load", { layoutReady: this.app.workspace.layoutReady, obsidianVersion: apiVersion });
    this.popout = new PopNoteWindow(this.app, this.compatibility, (event, details) => this.log(event, details),
      (reason) => this.releaseWindowBinding(reason));
    this.native = new PopNoteNative((message) => this.log("native-action", { message }),
      (event, details) => this.log(event, details), defaults.pinFallbackLevel);
    if (this.tray) this.applyTray(true);
    this.registerEvent(this.app.workspace.on("layout-change", () => {
      this.popout?.checkOwnership();
      this.compatibility?.audit();
      this.refreshOverlayLabel();
    }));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.refreshOverlayLabel()));
    this.app.workspace.onLayoutReady(() => {
      if (!this.stopped) this.compatibility?.finishStartup();
    });
    this.registerEvent(this.app.workspace.on("quit", (tasks) => {
      this.flushShutdownBounds();
      if (this.pendingSaves > 0) tasks.addPromise(this.saveQueue);
    }));
    if (mainWindow) {
      this.registerDomEvent(mainWindow, "beforeunload", (event) => {
        this.log("main-beforeunload", { pendingSaves: this.pendingSaves, boundsSaveScheduled: this.saveTimer !== undefined });
        if (!event.defaultPrevented) this.finishRendererShutdown("beforeunload");
      });
      this.registerDomEvent(mainWindow, "pagehide", (event) => {
        if (!event.persisted) this.finishRendererShutdown("pagehide");
      });
    }
    this.addCommand({
      id: "use-current-note",
      name: "Use current note",
      callback: () => {
        const file = this.app.workspace.getActiveFile();
        if (!file) {
          new Notice("PopNote: open a note first.");
          return;
        }
        void this.chooseNote(file.path).then((chosen) => {
          if (chosen) {
            new Notice(this.shortcutActive
              ? `PopNote: showing ${file.path}. Press ${this.shortcut} to open it.`
              : `PopNote: showing ${file.path}. No shortcut is registered; set one in settings or run "PopNote: Toggle window".`);
          }
        });
      },
    });
    this.addCommand({
      id: "toggle",
      name: "Toggle window",
      callback: () => { void this.toggle("command"); },
    });
    this.addCommand({
      id: "show-controls",
      name: "Show controls",
      callback: () => { this.overlay?.recover(true); },
    });
    this.addSettingTab(new PopNoteSettings(this));
    this.applyShortcut(this.shortcut, false);
  }

  /** Debug logging: console only, never stored, and silent unless switched on in settings. */
  private log(event: string, details: Record<string, unknown> = {}): void {
    if (this.debug) console.info(`[PopNote] ${JSON.stringify({ time: new Date().toISOString(), event, ...details })}`);
  }

  private async loadWindowSettings(): Promise<void> {
    try {
      const data = await this.loadData();
      if (typeof data !== "object" || data === null || Array.isArray(data)) return;
      this.storedData = data;
      const { windowBounds, opacity, notePath, shortcut, pinned, allSpaces, tray, debug, helpShown } = data;
      if (typeof pinned === "boolean") this.pinned = pinned;
      if (typeof allSpaces === "boolean") this.allSpaces = allSpaces;
      this.tray = tray === true;
      this.debug = debug === true;
      this.helpShown = helpShown === true;
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
      this.log("settings-load-failed");
      new Notice("PopNote: saved window settings could not be read.");
    } finally {
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

  private flushShutdownBounds(): void {
    this.stopWatchingBounds?.();
    this.stopWatchingBounds = undefined;
    this.flushWindowSave();
  }

  private finishRendererShutdown(source: "beforeunload" | "pagehide"): void {
    this.flushShutdownBounds();
    this.native?.destroyTray();
    if (!this.shortcutActive || !this.native) return;
    // Obsidian can replace the renderer without calling the plugin's unload hook.
    const released = this.native.unregisterShortcut();
    if (released) this.shortcutActive = false;
    this.log("shortcut-cleanup", { released, source });
  }

  private queueSave(reason: string): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    const snapshot = {
      ...this.storedData, notePath: this.notePath, shortcut: this.savedShortcut,
      windowBounds: this.bounds, opacity: this.opacity, pinned: this.pinned,
      allSpaces: this.allSpaces, tray: this.tray, debug: this.debug, helpShown: this.helpShown,
    };
    this.pendingSaves++;
    this.saveQueue = this.saveQueue.then(async () => {
      try {
        await this.saveData(snapshot);
        this.log("save-complete", { reason });
      } catch {
        this.log("save-failed", { reason });
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
    const registered = this.native?.registerShortcut(accelerator, () => { void this.toggle("shortcut"); }, !persist) ?? false;
    this.log("shortcut-registration", { accelerator, success: registered, source: persist ? "apply" : "startup" });
    if (registered) {
      this.shortcutActive = true;
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

  settingsSnapshot(): { allSpaces: boolean; tray: boolean; debug: boolean } {
    return { allSpaces: this.allSpaces, tray: this.tray, debug: this.debug };
  }

  setAllSpaces(value: boolean): void {
    this.allSpaces = value;
    this.queueSave("all-spaces");
    if (value && this.popout?.isOpen()) this.native?.allSpaces(true);
  }

  setTray(value: boolean): boolean {
    const applied = this.applyTray(value);
    this.tray = value && applied;
    this.queueSave("tray");
    return this.tray === value;
  }

  setDebug(value: boolean): void {
    this.debug = value;
    this.queueSave("debug");
  }

  private applyTray(enabled: boolean): boolean {
    if (!this.native) return false;
    if (!enabled) { this.native.destroyTray(); return true; }
    return this.native.createTray(() => { void this.toggle("tray"); }, () => this.trayItems());
  }

  /** The right-click menu, read each time it opens so it shows current state. */
  private trayItems(): TrayItem[] {
    const percent = Math.round(this.opacity * 100);
    const notes = this.noteMatches("").slice(0, 5);
    const synced = (changed: boolean) => { if (changed) this.overlay?.sync(this.pinned, this.opacity); };
    return [
      { label: "Show or hide PopNote", click: () => { void this.toggle("tray"); } },
      { label: "Keep on top", checked: this.pinned, click: () => synced(this.setPinned(!this.pinned)) },
      { label: "Opacity", submenu: [
        ...[100, 80, 60, 40].map((value) => ({
          label: `${value}%`, checked: value === percent, click: () => synced(this.setOpacityValue(value / 100)),
        })),
        "separator" as const,
        { label: "Slider…", click: () => { void this.openPanel("opacity"); } },
      ] },
      "separator",
      { label: "Find note…", click: () => { void this.openPanel("notes"); } },
      { label: "Switch note", submenu: notes.length ? notes.map((path) => ({
        label: path.replace(/\.md$/i, ""), checked: path === this.notePath, click: () => { void this.showNote(path); },
      })) : [{ label: "No notes", disabled: true }] },
    ];
  }

  /** Pin from the window's button or the tray. With no open window it is just remembered for the next summon. */
  private setPinned(value: boolean): boolean {
    if (this.popout?.isOpen() && !this.native?.pin(value)) return false;
    this.pinned = value;
    this.queueSave("pin");
    this.native?.refreshTrayMenu();
    return true;
  }

  private setOpacityValue(value: number): boolean {
    if (this.popout?.isOpen() && !this.native?.opacity(value)) return false;
    this.opacity = value;
    this.queueSave("opacity");
    this.native?.refreshTrayMenu();
    return true;
  }

  /** Bring the window up with the note picker or the opacity slider open, for the tray menu. */
  private async openPanel(panel: "notes" | "opacity"): Promise<void> {
    if (this.popout?.isOpen()) this.native?.toggle("show");
    else await this.toggle("tray");
    this.overlay?.openPanel(panel);
  }

  /** Choose a note from the tray and bring the window up with it. */
  private async showNote(path: string): Promise<void> {
    if (!(await this.chooseNote(path))) return;
    if (this.popout?.isOpen()) this.native?.toggle("show");
    else await this.toggle("tray");
  }

  private noteMatches(query: string): string[] {
    const notes = this.app.vault.getMarkdownFiles().map((file) => ({ path: file.path, modified: file.stat?.mtime ?? 0 }));
    const recent = [this.notePath, ...(this.app.workspace.getLastOpenFiles?.() ?? [])]
      .filter((path): path is string => typeof path === "string");
    return rankNotes(notes, query, recent);
  }

  /** Shows `path` in the open window, or just remembers it for the next summon. */
  private async chooseNote(path: string): Promise<boolean> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      new Notice(`PopNote: ${path} is not a note in this vault.`);
      return false;
    }
    if (this.popout?.isOpen() && !(await this.popout.showNote(file))) {
      new Notice(`PopNote: could not show ${path}.`);
      return false;
    }
    this.notePath = file.path;
    this.queueSave("note");
    this.overlay?.setNote(file.path);
    this.native?.refreshTrayMenu();
    return true;
  }

  /** The note to show when none was ever chosen: the one in front, else the last one opened, else any. */
  private firstNote(): TFile | null {
    const active = this.app.workspace.getActiveFile();
    if (active) return active;
    const recent = this.app.workspace.getLastOpenFiles?.()[0];
    const file = recent ? this.app.vault.getAbstractFileByPath(recent) : null;
    return file instanceof TFile ? file : this.app.vault.getMarkdownFiles()[0] ?? null;
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

  private async toggle(source: "command" | "shortcut" | "tray"): Promise<void> {
    if (this.stopped || !this.native || !this.popout) return;
    const open = this.popout.isOpen();
    if (this.busy) return;
    this.busy = true;
    const operation = ++this.operation;
    try {
      if (open) {
        this.native.toggle(source === "tray" ? "hide-if-visible" : "toggle");
        return;
      }
      const saved = this.notePath ? this.app.vault.getAbstractFileByPath(this.notePath) : null;
      // A saved note that no longer exists (or never existed in this vault) falls back to the note in front.
      const file = saved instanceof TFile ? saved : this.firstNote();
      if (!(file instanceof TFile)) {
        new Notice("PopNote: this vault has no notes to show yet.");
        return;
      }
      if (this.notePath && !(saved instanceof TFile)) {
        new Notice(`PopNote: saved note ${this.notePath} is unavailable, so showing ${file.path} instead.`);
      }
      const document = await this.popout.open(file);
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
        pin: (value) => allowed() && this.setPinned(value),
        notes: (query) => this.noteMatches(query),
        choose: (path) => allowed() ? this.chooseNote(path) : Promise.resolve(false),
        pinHint: Platform.isWin
          ? "To show it on every desktop: press Win+Tab, right-click the PopNote window, then choose Show this window on all desktops"
          : undefined,
        opacity: (value) => allowed() && this.setOpacityValue(value),
      });
      this.stopWatchingBounds?.();
      this.stopWatchingBounds = undefined;
      if (!this.native.bind(document, allowed)) return;
      this.native.minimumSize();
      if (this.bounds) this.native.restoreBounds(this.bounds);
      this.stopWatchingBounds = this.native.watchBounds((bounds) => {
        if (!allowed()) return;
        this.bounds = bounds;
        this.scheduleWindowSave();
      });
      this.native.allSpaces(this.allSpaces);
      const pinApplied = this.native.pin(this.pinned);
      const opacityApplied = this.native.opacity(this.opacity);
      overlay.setNativeAvailability(pinApplied, opacityApplied);
      
      if (this.notePath !== file.path) { this.notePath = file.path; this.queueSave("note"); }
      if (Platform.isWin && !this.helpShown) {
        this.helpShown = true;
        this.queueSave("help");
        new Notice("PopNote tip: to show it on every desktop, press Win+Tab, right-click the PopNote window, then choose Show this window on all desktops.", 15000);
      }
      // Creation already shows the public pop-out; do not toggle it back to hidden.
    } catch (error) {
      this.log("summon-failed", { message: error instanceof Error ? error.message : String(error) });
      new Notice(`PopNote: could not open: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (this.operation === operation) this.busy = false;
    }
  }

  onunload(): void {
    this.log("plugin-unload", { pendingSaves: this.pendingSaves, boundsSaveScheduled: this.saveTimer !== undefined, ownedPopoutOpen: this.popout?.isOpen() ?? false });
    this.stopped = true;
    this.flushShutdownBounds();
    this.native?.dispose();
    this.popout?.close();
    this.compatibility?.dispose();
    this.overlay?.dispose();
    this.overlay = undefined;
  }
}

class PopNoteSettings extends PluginSettingTab {
  private plugin: PopNotePlugin;

  constructor(plugin: PopNotePlugin) {
    super(plugin.app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    this.containerEl.empty();
    this.containerEl.createEl("p", {
      text: "Press the shortcut to open PopNote, then use its Note button to pick what it shows. The note, shortcut, size, position, pin and opacity are remembered. \"PopNote: Show controls\" can be given a hotkey in Settings > Hotkeys.",
    });
    let accelerator = this.plugin.currentShortcut();
    new Setting(this.containerEl).setName("Global shortcut")
      .setDesc("A refused shortcut keeps the previous one. Write shortcuts without spaces, such as Ctrl+Alt+P. Use Super for the Windows key (Super+Q); on a Mac use Command, for example Command+Option+P. Spellings such as \"Win + Q\" can fail.")
      .addText((text) => text.setValue(accelerator).onChange((value) => { accelerator = value; }))
      .addButton((button) => button.setButtonText("Apply").onClick(() => {
        this.plugin.applyShortcut(accelerator);
      }));
    const current = this.plugin.settingsSnapshot();
    new Setting(this.containerEl).setName("Show on all desktops")
      .setDesc("macOS Spaces and similar. Applies the next time PopNote opens. On Windows see the tip below.")
      .addToggle((toggle) => toggle.setValue(current.allSpaces).onChange((value) => this.plugin.setAllSpaces(value)));
    new Setting(this.containerEl).setName("Tray icon")
      .setDesc("Adds a system tray icon. Clicking it shows or hides PopNote. Some Linux desktops have no tray.")
      .addToggle((toggle) => toggle.setValue(current.tray).onChange((value) => {
        if (!this.plugin.setTray(value)) toggle.setValue(!value);
      }));
    new Setting(this.containerEl).setName("Debug logging")
      .setDesc("Writes PopNote lifecycle events to the developer console. Nothing is stored.")
      .addToggle((toggle) => toggle.setValue(current.debug).onChange((value) => this.plugin.setDebug(value)));
    if (Platform.isWin) {
      this.containerEl.createEl("p", {
        text: "Windows tip: Pin keeps PopNote on top. To show it on every virtual desktop, press Win+Tab, right-click the PopNote window, then choose Show this window on all desktops.",
      });
    }
  }
}
