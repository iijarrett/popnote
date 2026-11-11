import { Notice, Platform } from "obsidian";

declare const require: (name: string) => any;

// Host-provided APIs only. No Electron object leaves this module.
type Rectangle = { x: number; y: number; width: number; height: number };
export type WindowBounds = Partial<Pick<Rectangle, "x" | "y">> & Pick<Rectangle, "width" | "height">;
const boundsEvents = ["move", "resize", "close"] as const;

type NativeWindow = {
  id: number;
  getTitle(): string;
  isDestroyed(): boolean;
  isVisible(): boolean;
  isMinimized(): boolean;
  isFocused(): boolean;
  show(): void;
  showInactive(): void;
  restore(): void;
  focus(): void;
  hide(): void;
  getNormalBounds(): Rectangle;
  setBounds(bounds: WindowBounds): void;
  on(event: string, listener: () => void): void;
  removeListener(event: string, listener: () => void): void;
  setAlwaysOnTop(value: boolean, level?: "pop-up-menu"): void;
  isAlwaysOnTop(): boolean;
  setOpacity(value: number): void;
  getOpacity?(): number;
  setVisibleOnAllWorkspaces(value: boolean): void;
  isVisibleOnAllWorkspaces(): boolean;
};

export class SpikeNative {
  private remote: any = null;
  private window: NativeWindow | null = null;
  private canControl?: () => boolean;
  private binding = 0;
  private stopBounds?: () => void;
  private changes = new Map<string, { undo: () => void }>();
  private accelerator: string | null = null;
  private disabled = new Set<string>();
  private previousId: number | null = null;
  private report: (message: string) => void;

  constructor(
    report: (message: string) => void,
    private trace: (event: string, details: Record<string, unknown>) => void = () => {},
    private pinFallbackLevel?: "pop-up-menu",
  ) {
    this.report = report;
    for (const load of [
      () => require("electron")?.remote,
      () => require("@electron/remote"),
    ]) {
      try {
        const remote = load();
        if (remote?.BrowserWindow || remote?.globalShortcut) {
          this.remote = remote;
          break;
        }
      } catch {
        // Try the next host-provided entry point.
      }
    }
    if (!this.remote) {
      this.disable("Native access", "host remote APIs are unavailable");
    }
  }

  traceWindows(trigger: string): void {
    this.attempt("Native restart diagnostics", () => {
      this.method(this.remote.BrowserWindow, "getAllWindows");
      const windows = this.remote.BrowserWindow.getAllWindows().map((window: NativeWindow) => {
        for (const name of ["isDestroyed", "isVisible", "isMinimized", "isFocused"]) this.method(window, name);
        if (window.isDestroyed()) return { id: window.id, destroyed: true };
        return {
          id: window.id, owned: window.id === this.window?.id, visible: window.isVisible(),
          minimized: window.isMinimized(), focused: window.isFocused(),
          opacity: typeof window.getOpacity === "function" ? window.getOpacity() : undefined,
        };
      });
      this.trace("native-windows", { trigger, processId: this.remote.process?.pid, windows });
    });
  }

  private disable(feature: string, reason: string): void {
    if (this.disabled.has(feature)) return;
    this.disabled.add(feature);
    new Notice(`PopNote: ${feature} disabled: ${reason}.`);
  }

  private attempt<T>(feature: string, action: () => T): T | undefined {
    if (!this.remote || this.disabled.has(feature)) return undefined;
    try {
      return action();
    } catch (error) {
      this.disable(feature, error instanceof Error ? error.message : String(error));
      return undefined;
    }
  }

  private method(target: any, name: string): void {
    if (typeof target?.[name] !== "function") {
      throw new Error(`${name} is unavailable`);
    }
  }

  private liveWindow(): NativeWindow | null {
    const window = this.window;
    if (!window) return null;
    if (!this.canControl?.() || this.window !== window) {
      this.release();
      return null;
    }
    this.method(window, "isDestroyed");
    if (window.isDestroyed()) { this.release(); return null; }
    return window;
  }

  bind(document: Document, canControl: () => boolean): boolean {
    this.release();
    return this.attempt("Native window lookup", () => {
      if (!canControl()) return false;
      const windows = this.remote.BrowserWindow;
      this.method(windows, "getAllWindows");
      const originalTitle = document.title;
      const marker = `popnote-spike-${globalThis.crypto.randomUUID()}`;
      let matched: NativeWindow[];
      try {
        document.title = marker;
        matched = windows.getAllWindows().filter((window: NativeWindow) => {
          this.method(window, "getTitle");
          return window.getTitle() === marker;
        });
      } finally {
        document.title = originalTitle;
      }
      if (matched.length !== 1) {
        throw new Error(`expected one title match, got ${matched.length}`);
      }
      const window = matched[0];
      this.method(window, "isDestroyed");
      if (window.isDestroyed()) throw new Error("pop-out is closed");
      if (!Number.isInteger(window.id)) throw new Error("window ID is unavailable");
      if (!canControl()) return false;
      this.window = window;
      this.canControl = canControl;
      this.report(`Native window ID ${window.id}: created; previous ID ${this.previousId ?? "none"}`);
      this.previousId = window.id;
      return true;
    }) ?? false;
  }

  private change<T>(feature: string, window: NativeWindow, read: () => T, write: (value: T) => void, value: T): boolean {
    if (this.disabled.has(feature)) return false;
    const previous = read();
    const valid = (part: unknown): boolean => typeof part === "boolean" || (typeof part === "number" && Number.isFinite(part));
    const matches = (current: T, expected: T): boolean => {
      if (expected !== null && typeof expected === "object") {
        return current !== null && typeof current === "object" && Object.keys(expected).every((key) =>
          (current as any)[key] === (expected as any)[key]);
      }
      return current === expected;
    };
    if (value !== null && typeof value === "object") {
      if (!previous || Object.keys(value).some((key) => !valid((previous as any)[key]))) throw new Error("native bounds snapshot is unavailable");
    } else if (typeof previous !== typeof value || !valid(previous)) throw new Error("native snapshot is unavailable");
    if (this.liveWindow() !== window) return false;
    const before = value !== null && typeof value === "object"
      ? Object.fromEntries(Object.keys(value).map((key) => [key, (previous as any)[key]])) as T : previous;
    const earlier = this.changes.get(feature) as { undo: () => void; last: T } | undefined;
    const entry = earlier ?? { last: value, undo: () => {
      this.method(window, "isDestroyed");
      if (!window.isDestroyed() && matches(read(), entry.last)) write(before);
    } };
    entry.last = value;
    // Record before calling the setter: a throwing native call may have applied its value.
    this.changes.set(feature, entry);
    write(value);
    return true;
  }

  /** Roll back the captured original window only, without consulting the moved leaf. */
  release(): void {
    this.window = null;
    this.canControl = undefined;
    this.binding++;
    this.stopBounds?.();
    this.stopBounds = undefined;
    const changes = [...this.changes.entries()].reverse();
    this.changes.clear();
    for (const [feature, change] of changes) {
      try { change.undo(); }
      catch (error) {
        this.disable(feature, `cleanup failed (${error instanceof Error ? error.message : String(error)})`);
      }
    }
  }

  toggle(): void {
    this.attempt("Window toggle", () => {
      const window = this.liveWindow();
      if (!window) return;
      for (const method of ["isMinimized", "isVisible", "isFocused", "show", "showInactive", "restore", "focus", "hide"]) {
        this.method(window, method);
      }
      const visible = (value: boolean) => this.change("Window visibility", window, () => window.isVisible(),
        (before) => { if (before) window.showInactive(); else window.hide(); }, value);
      let action: string;
      if (window.isMinimized() || !window.isVisible()) {
        if (window.isMinimized()) {
          if (this.liveWindow() !== window) return;
          window.restore();
        }
        if (!visible(true) || this.liveWindow() !== window) return;
        window.focus();
        action = "shown";
      } else if (window.isFocused()) {
        if (!visible(false)) return;
        action = "hidden";
      } else {
        if (!visible(true) || this.liveWindow() !== window) return;
        window.focus();
        action = "focused";
      }
      this.report(`Native window ID ${window.id}: ${action} (reused)`);
    });
  }

  private canPositionWindow(): boolean {
    return !Platform.isLinux || this.remote.process?.env?.XDG_SESSION_TYPE !== "wayland";
  }

  restoreBounds(bounds: WindowBounds): void {
    this.attempt("Restore window bounds", () => {
      const window = this.liveWindow();
      if (!window) return;
      this.method(window, "setBounds");
      this.method(window, "getNormalBounds");
      const apply = (value: WindowBounds) => this.change("Restore window bounds", window,
        () => window.getNormalBounds(), (before) => window.setBounds(before), value);
      const { x, y, width, height } = bounds;
      if (x === undefined || y === undefined || !this.canPositionWindow()) {
        apply({ width, height });
        return;
      }
      const screen = this.remote.screen;
      this.method(screen, "getDisplayMatching");
      const { workArea } = screen.getDisplayMatching({ x, y, width, height });
      const fittedWidth = Math.min(width, workArea.width);
      const fittedHeight = Math.min(height, workArea.height);
      apply({
        x: Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - fittedWidth)),
        y: Math.max(workArea.y, Math.min(y, workArea.y + workArea.height - fittedHeight)),
        width: fittedWidth,
        height: fittedHeight,
      });
    });
  }

  watchBounds(onChange: (bounds: WindowBounds) => void): (() => void) | undefined {
    return this.attempt("Remember window bounds", () => {
      const window = this.liveWindow();
      if (!window) return;
      for (const method of ["getNormalBounds", "on", "removeListener"]) this.method(window, method);
      const canPosition = this.canPositionWindow();
      const binding = this.binding;
      let active = true;
      const capture = () => {
        this.attempt("Remember window bounds", () => {
          if (!active || binding !== this.binding || this.liveWindow() !== window) return;
          if (window.isDestroyed()) return;
          const { x, y, width, height } = window.getNormalBounds();
          if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
          onChange(canPosition && Number.isFinite(x) && Number.isFinite(y) ? { x, y, width, height } : { width, height });
        });
      };
      const remove = () => {
        active = false;
        this.attempt("Window bounds cleanup", () => {
          if (window.isDestroyed()) return;
          for (const event of boundsEvents) window.removeListener(event, capture);
        });
      };
      try {
        for (const event of boundsEvents) window.on(event, capture);
      } catch (error) {
        remove();
        throw error;
      }
      this.stopBounds = remove;
      return remove;
    });
  }

  pin(value: boolean): boolean {
    return this.attempt("Pin", () => {
      const window = this.liveWindow();
      if (!window) return false;
      this.method(window, "setAlwaysOnTop");
      this.method(window, "isAlwaysOnTop");
      const read = () => window.isAlwaysOnTop();
      return this.change("Pin", window, read, (pinned) => {
        window.setAlwaysOnTop(pinned);
        if (pinned && this.pinFallbackLevel && !read()) {
          window.setAlwaysOnTop(true, this.pinFallbackLevel);
        }
        if (read() !== pinned) throw new Error("the window manager did not apply the requested pin state");
      }, value);
    }) ?? false;
  }

  opacity(value: number): boolean {
    return this.attempt("Opacity", () => {
      const window = this.liveWindow();
      if (!window) return false;
      this.method(window, "setOpacity");
      this.method(window, "getOpacity");
      const read = () => window.getOpacity!();
      return this.change("Opacity", window, read, (opacity) => {
        window.setOpacity(opacity);
        const applied = read();
        if (!Number.isFinite(applied) || Math.abs(applied - opacity) >= 0.005) {
          throw new Error("the window manager did not apply the requested opacity");
        }
      }, Math.min(1, Math.max(0.3, value)));
    }) ?? false;
  }

  allSpaces(enabled: boolean): void {
    if (!enabled) return;
    this.attempt("All Spaces", () => {
      const window = this.liveWindow();
      if (!window) return;
      this.method(window, "setVisibleOnAllWorkspaces");
      this.method(window, "isVisibleOnAllWorkspaces");
      this.change("All Spaces", window, () => window.isVisibleOnAllWorkspaces(), (before) => window.setVisibleOnAllWorkspaces(before), true);
    });
  }

  registerShortcut(accelerator: string, callback: () => void): boolean {
    if (accelerator === this.accelerator) return true;
    return this.attempt("Global shortcut", () => {
      const shortcuts = this.remote.globalShortcut;
      this.method(shortcuts, "register");
      this.method(shortcuts, "unregister");
      const registered = shortcuts.register(accelerator, () => {
        if (this.accelerator !== accelerator) return;
        try {
          callback();
        } catch {
          this.disable("Global shortcut", "callback failed");
        }
      });
      if (!registered) {
        new Notice(`PopNote: shortcut ${accelerator} was refused. Try another combination.`);
        return false;
      }
      // Keep the previous binding until the replacement has registered.
      if (!this.unregisterShortcut()) {
        shortcuts.unregister(accelerator);
        return false;
      }
      this.accelerator = accelerator;
      new Notice(`PopNote: shortcut ${accelerator} registered. Test it from another app.`);
      return true;
    }) ?? false;
  }

  unregisterShortcut(): boolean {
    if (!this.accelerator) return true;
    // Cleanup still runs if normal shortcut operations have been disabled.
    try {
      const shortcuts = this.remote?.globalShortcut;
      this.method(shortcuts, "unregister");
      shortcuts.unregister(this.accelerator);
      this.accelerator = null;
      return true;
    } catch {
      this.disable("Global shortcut cleanup", "could not unregister the owned shortcut");
      return false;
    }
  }

  dispose(): void {
    this.traceWindows("native-dispose");
    const released = this.unregisterShortcut();
    this.trace("shortcut-cleanup", { released });
    this.release();
  }
}
