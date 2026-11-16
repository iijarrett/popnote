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
  setMinimumSize?(width: number, height: number): void;
  getMinimumSize?(): number[];
  on(event: string, listener: () => void): void;
  removeListener(event: string, listener: () => void): void;
  setAlwaysOnTop(value: boolean, level?: "pop-up-menu"): void;
  isAlwaysOnTop(): boolean;
  setOpacity(value: number): void;
  getOpacity?(): number;
  setVisibleOnAllWorkspaces(value: boolean): void;
  isVisibleOnAllWorkspaces(): boolean;
  setFullScreenable?(value: boolean): void;
  isFullScreenable?(): boolean;
};

/** Below this the tab strip cannot hold PopNote's controls plus a place to grab the window. */
export const MINIMUM_WINDOW = { width: 340, height: 160 };

// 64 x 64 notepad-and-pencil icons (shrunk to 16): dark and light for the taskbar theme (dark also serves as the macOS template image), gray when unknown.
const png = (data: string) => `data:image/png;base64,${data}`;
const ICON_DARK = png("iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAADlElEQVR42u1bLWwqQRBGIBCIihGICsQTyIonKhDICsQTyCcQlUhExRMklScqEAjESQSiAvFEBRKJRCAqEE8gKioQFX3vkrlks9m/m9293eu7JpM0Ye9u5ruZ2Zlv5xoA0PifpVEDUANAvrgHAAlKz/Oa6ADIFH0HgE+Ud4HyrtZECUDCKJ1L4mlNlACkAsVTT2tqAGoAagBqAIID0AeAKQAsUMGjQPEj/pY6XLPA5/ZDATACgINAyRByQH1U+l4DwB4AhrYANAFgGYnhvCxRP5HeGy6UrqgAxGo8CwKv80/Buj86r5G5/Wfk8sp5QfZ3VqxfA0DHFABZzGcPWJWcBFcSw/gYXxuA9gYAYx0AfQWC7UC9QJszkN8mWwCwLeA9WZ7oygCYSt58O3A32EY9zlxiazH/T/Atm4AwkQGwECxeRcIHrAQJLcW332W2wY3G+K0qBIJXZgrh437A6HhB720yO4Iod1xY968aAHxIvAp03TFeBILkONUlwaoAMFe4+Me/NTPGG34AwAnBaX4FAG7RSF2i2+PaBibOrkkdEDsArYK9yQcm15ZpJWgCQJ61UwuhMsCPhKpxr+gdCgPA79s2UpQBvjF0fd4Dbov0AjoAEsc1vSkD3MQ36fz+VQHggXDvoyr2qxQCPSxgit5/QCFEYkyCO4LxcyojFNs2OCEYfxI0b5UEoEsMt6ENKRoTAC8E41NbVjgWAMYE48/YAHkHwEUSVCXD6wLEBisjF+cCZW6Dsu1qTbjH2tXBSNmF0NIBI/2GXlM5AE4cv6ejtmUydnk0VmYIDA2erZMX12eDZSXBmYDvo5TS3RAA+OD3TgQAJj5Oh0MAMCcYv/N1PF42AAOC8ReXo3QhAWhJzgZ18uBzQMJHEpS1volrfi/mbZAnP3pEfu+G0/e+bABsCqE75j53hOsfBVxBWiUABhbd3oHj93KuIK1SCHSITI+I2v7tKkGHSoIzC35v7HKHCrUNPhWYBWL5vQ7HFVQWgNSwzdVxBZUFYKOp9BLBjN/Ih242IzI2spUku4VsnA314K9ZuAbAdEjKVg6c4dmb/KbpGEVkydQ1AKZjcraSj7c8C6q7hmZMjpW+awBMByWLyr2A8/+uOBB50gxK5sWRl2lxH6OyJnmkg4ZffNLgoYalVXnkCguji+WwtFMAfIzL83kkq+1/EQ5Bli5b4rI/mMjzyIpAgR9cub2LT2bKkuCfzHx5+QulxNeXN/2+FwAAAABJRU5ErkJggg==");
const ICON_LIGHT = png("iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAADlElEQVR42u1bLWwqQRBGIBCIigpEBeIJZMUTFQhkBeIJZAWiEomoeIKk8kQFAoE4iUBUICoqkEgkAlGBeALRSSoQFX2PZC7ZbPbvZndv9/pOTNKkyzHz3ey3M98ONQCo/c9WqwCoACB/uAMACVrH85roADg7+gEAX2gfAuddrYkSgIRxOrPE05ooAUgFjqee1lQAVABUAFQABAegCwBjAJihg3uB43v8X+pwzQy/txsKgAEA7AROhrAd+qPy9woAtgDQtwWgDgDzSALnbY7+ifxecVvpggpArMGzIPA+3wnW/dFljSztvyK3Ny4LLgHgqFi/BICWKQCyPX/+gkXBJLiQBMbv8aUBaO8AMNQB0FUg2AzUCzS5APljsgEA6xzZc+aJtgyAseTNNwN3g03048gRW4P5e4Rv2QSEkQyAmWDxIhI9YCEgtBTffps5Blea4NeqLRC8MlMYv+97jI8nzN46cyKIuOPEpn/ZAOC3xJvA1w2TRZcCchzrSLAsAEwVKf75b82EyYZfAHBAcOrfAYAbDFJHdFtcW0PibJvUAbED0MjZm3wiuTZMK0ETADLWTi2MqgA/EqrGraJ3yA0Af27bWF4F+Now9fkMuMnTC+gASBzX9KYKcB3fpPPnlwWAB8Kz96q9X6Yt0MECJu/zexRBJEYS3BCCn1IVodiOwREh+IOgeSslAG3iduvbiKIxAfBKCD61VYVjAWBICP6IDZB3AFyQoIoMr3IIG6wNXNwLFHkMyo6rJeEZS1cXI0UXQnMHivQ7Zk3pADhw+p5O2pbZ0OXVWJFboG/w3Tp7dX03WBQJTgR6H6WUbocAwIe+dyAAMPJxOxwCgCkh+I2v6/GiAegRgj+5HKULCUBDcjeoswefAxI+SFDW+iau9b2Yj0Fe/OgQ9b1rzt/7ogGwKYRumefcEj7/KNAK0jIB0LPo9nacvpdpBWmZtkCLqPSIpO0XVwQdigQnFvre0OUJFeoYfMoxC8Tqey1OKygtAKlhm6vTCkoLwEpT6SWCGb+BD99sRmRsbC0hu5lsnA394D8zcw2A6ZCUre24wM9v8oemYxSJJWPXAJiOydlaNt7yLKjuapoxOda6rgEwHZTMa/cCzf+n4kLkSTMomRVHXqbFfYzKmvBICwM/+ZTBQw1Lq3jkAgujk+WwtFMAfIzL8zxyru1/Ey5B5i5b4qJ/MJHxyIIgge9cpb2Ln8wUZcF/MvPt7S/w2hoNeSKc6gAAAABJRU5ErkJggg==");
// macOS menu bar: the same notepad-and-pencil drawing with a white outline, 76 px, shown at 18 px like other menu-bar icons. A black template glyph is invisible on a dark menu bar (the template
// flag does not survive the call into the main process), so the white outline keeps it readable on dark bars and the dark drawing on light ones.
const ICON_MAC = "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";
const ICON_GRAY = png("iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAADlElEQVR42u1bLWwqQRBGIBCIigpEBeIJZMUTFQhkBeIJZAWiEomoeIKk8kQFySAQJxGIJxAVFUgkEoGoQDyBqKhAVPQ9krlks9m/m9293WtPTNKkyzHz3ey3M98ONQCofWerVQBUAJA/3AGABK3jeU10AJwdfQeAT7R3gfOu1kQJQMI4nVniaU2UAKQCx1NPayoAKgAqACoAggPQBYAxAMzQwb3A8T3+L3W4Zobf2w0FwAAAdgInQ9gO/VH5ewUAWwDo2wJQB4B5JIHzNkf/RH6vuK10QQUg1uBZEHif7wTr/uqyRpb2n5HbK5cFlwBwVKxfAkDLFADZnj9/waJgElxIAuP3+NIAtDcAGOoA6CoQbAbqBZpcgPwx2QCAdY7sOfNEWwbAWPLmm4G7wSb6ceSIrcH8PcK3bALCSAbATLB4EYkesBAQWopvv80cgytN8GvVFghemSmM3/c9xscTZm+dORFE3HFi079sAPBb4lXg64bJoksBOY51JFgWAKaKFP/4v2bCZMMvADggOPWvAMANBqkjui2urSFxtk3qgNgBaOTsTT6QXBumlaAJABlrpxZGVYAfCVXjVtE75AaAP7dtLK8CfG2Y+nwG3OTpBXQAJI5relMFuI5v0vnzywLAA+HZe9XeL9MW6GABk/f5PYogEiMJbgjBT6mKUGzH4IgQ/EHQvJUSgDZxu/VtRNGYAHghBJ/aqsKxADAkBH/EBsg7AC5IUEWGVzmEDdYGLu4FijwGZcfVkvCMpauLkaILobkDRfoNs6Z0ABw4fU8nbcts6PJqrMgt0Df4bp29uL4bLIoEJwK9j1JKt0MA4EPfOxAAGPm4HQ4BwJQQ/MbX9XjRAPQIwZ9cjtKFBKAhuRvU2YPPAQkfJChrfRPX+l7MxyAvfnSI+t415+990QDYFEK3zHNuCZ9/FGgFaZkA6Fl0eztO38u0grRMW6BFVHpE0vazK4IORYITC31v6PKECnUMPuWYBWL1vRanFZQWgNSwzdVpBaUFYKWp9BLBjN/Ah282IzI2tpaQ3Uw2zoZ+8J+ZuQbAdEjK1nZc4Oc3+UPTMYrEkrFrAEzH5GwtG2/5I6juapoxOda6rgEwHZTMa/cCzf+n4kLkSTMomRVHXqbFfYzKmvBICwM/+ZTBQw1Lq3jkAgujk+WwtFMAfIzL8zxyru1/Ey5B5i5b4qJ/MJHxyIIgge9cpb2Ln8wUZcF/MvPl7R+63jkOf5P4pwAAAABJRU5ErkJggg==");

/** A tray menu entry described as plain data, so no Electron object leaves this file. */
export type TrayItem = { label: string; checked?: boolean; disabled?: boolean; click?: () => void; submenu?: TrayItem[] } | "separator";

export class PopNoteNative {
  private remote: any = null;
  private window: NativeWindow | null = null;
  private canControl?: () => boolean;
  private binding = 0;
  private stopBounds?: () => void;
  private changes = new Map<string, { undo: () => void }>();
  private accelerator: string | null = null;
  private disabled = new Set<string>();
  private previousId: number | null = null;
  private trayIcon: { destroy?(): void; isDestroyed?(): boolean } | null = null;
  private trayMenu: (() => unknown) | null = null;
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
      const marker = `popnote-window-${globalThis.crypto.randomUUID()}`;
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

  /**
   * "toggle": hide when focused, otherwise show or focus. "hide-if-visible" is for the tray icon, whose click takes focus
   * away, so a visible window must still hide. "show" never hides.
   */
  toggle(mode: "toggle" | "hide-if-visible" | "show" = "toggle"): "shown" | "focused" | "hidden" | undefined {
    return this.attempt("Window toggle", (): "shown" | "focused" | "hidden" | undefined => {
      const window = this.liveWindow();
      if (!window) return;
      for (const method of ["isMinimized", "isVisible", "isFocused", "show", "showInactive", "restore", "focus", "hide"]) {
        this.method(window, method);
      }
      const visible = (value: boolean) => this.change("Window visibility", window, () => window.isVisible(),
        (before) => { if (before) window.showInactive(); else window.hide(); }, value);
      let action: "shown" | "focused" | "hidden";
      if (window.isMinimized() || !window.isVisible()) {
        if (window.isMinimized()) {
          if (this.liveWindow() !== window) return;
          window.restore();
        }
        if (!visible(true) || this.liveWindow() !== window) return;
        window.focus();
        this.bringForward(window);
        action = "shown";
      } else if (mode === "hide-if-visible" || (mode === "toggle" && window.isFocused())) {
        if (!visible(false)) return;
        action = "hidden";
      } else {
        if (!visible(true) || this.liveWindow() !== window) return;
        window.focus();
        this.bringForward(window);
        action = "focused";
      }
      this.report(`Native window ID ${window.id}: ${action} (reused)`);
      return action;
    });
  }

  /**
   * macOS: a click on the menu-bar icon or a global shortcut does not make Obsidian the active app, so a shown window can stay
   * behind other apps' windows. Activate the app and raise the window. Optional and silent: both calls are skipped if missing.
   */
  private bringForward(window: NativeWindow): void {
    if (!Platform.isMacOS) return;
    try { this.remote?.app?.focus?.({ steal: true }); } catch { /* Raising is a convenience. */ }
    try { (window as { moveTop?: () => void }).moveTop?.(); } catch { /* Same. */ }
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
      const width = Math.max(bounds.width, MINIMUM_WINDOW.width);
      const height = Math.max(bounds.height, MINIMUM_WINDOW.height);
      const { x, y } = bounds;
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

  /** Stops the window being dragged smaller than its controls; undone with the other native changes. */
  minimumSize(): void {
    this.attempt("Minimum window size", () => {
      const window = this.liveWindow();
      if (!window) return;
      this.method(window, "setMinimumSize");
      this.method(window, "getMinimumSize");
      this.change("Minimum window size", window,
        () => { const [width, height] = window.getMinimumSize!(); return { width, height }; },
        (size) => window.setMinimumSize!(size.width, size.height), { ...MINIMUM_WINDOW });
    });
  }

  /**
   * macOS only. Summoned from another app's or Obsidian's own full-screen Space, a small note window would otherwise be
   * turned into a full-screen window itself (seen live at 1728 x 1084). A note pop-up has no use for full screen.
   */
  keepOutOfFullScreen(): void {
    if (!Platform.isMacOS) return;
    this.attempt("Full screen guard", () => {
      const window = this.liveWindow();
      if (!window) return;
      this.method(window, "setFullScreenable");
      this.method(window, "isFullScreenable");
      this.change("Full screen guard", window, () => window.isFullScreenable!(), (value) => window.setFullScreenable!(value), false);
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

  /**
   * `reclaim` is for PopNote's own startup shortcut: after a reload or a replaced renderer,
   * Electron may still hold the old registration with a dead callback, so release it first.
   */
  registerShortcut(accelerator: string, callback: () => void, reclaim = false): boolean {
    if (accelerator === this.accelerator) return true;
    return this.attempt("Global shortcut", () => {
      const shortcuts = this.remote.globalShortcut;
      this.method(shortcuts, "register");
      this.method(shortcuts, "unregister");
      if (reclaim && typeof shortcuts.isRegistered === "function" && shortcuts.isRegistered(accelerator)) {
        shortcuts.unregister(accelerator);
        this.trace("shortcut-reclaimed", { accelerator });
      }
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
      new Notice(`PopNote: shortcut ${accelerator} registered.`);
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

  /**
   * Optional tray icon. A click runs `onClick`. `items` is read each time the menu opens, so it always shows current
   * state. Windows and macOS pop the menu up on right-click; Linux has no such event, so there it is set up front and
   * `refreshTrayMenu` renews it.
   */
  createTray(onClick: () => void, items: () => TrayItem[]): boolean {
    if (this.trayIcon) return true;
    return this.attempt("Tray icon", () => {
      const { Tray, nativeImage, Menu } = this.remote;
      if (typeof Tray !== "function" || typeof nativeImage?.createFromDataURL !== "function") {
        throw new Error("Tray is unavailable");
      }
      const mac = Platform.isMacOS;
      const dark = this.remote.nativeTheme?.shouldUseDarkColorsForSystemUI;
      let image = nativeImage.createFromDataURL(mac ? png(ICON_MAC) : dark === true ? ICON_LIGHT : dark === false ? ICON_DARK : ICON_GRAY);
      if (typeof image.resize === "function") image = mac ? image.resize({ width: 18, height: 18, quality: "best" }) : image.resize({ width: 16, height: 16 });
      const tray = new Tray(image);
      this.trayIcon = tray;
      // A failing action must never throw into the host, and one bad action should not switch the whole tray off.
      const safely = (action?: () => void) => () => { try { action?.(); } catch { /* the action reports its own failure */ } };
      const convert = (item: TrayItem): unknown => item === "separator" ? { type: "separator" } : {
        label: item.label.replace(/&/g, "&&"), enabled: !item.disabled,
        ...(item.checked !== undefined ? { type: "checkbox", checked: item.checked } : {}),
        ...(item.submenu ? { submenu: item.submenu.map(convert) } : { click: safely(item.click) }),
      };
      const build = () => Menu.buildFromTemplate(items().map(convert));
      try {
        tray.setToolTip?.("PopNote");
        tray.on("click", () => { try { onClick(); } catch { this.disable("Tray icon", "click handler failed"); } });
        if (typeof Menu?.buildFromTemplate === "function") {
          if (Platform.isLinux) {
            this.trayMenu = () => tray.setContextMenu?.(build());
            this.trayMenu();
          } else tray.on("right-click", () => tray.popUpContextMenu?.(build()));
        }
      } catch (error) {
        this.destroyTray();
        throw error;
      }
      return true;
    }) ?? false;
  }

  /** Linux only: renew the tray menu after state changed. Elsewhere the menu is built when it opens. */
  refreshTrayMenu(): void {
    try { this.trayMenu?.(); } catch { /* A stale menu is better than a failed action. */ }
  }

  destroyTray(): void {
    const tray = this.trayIcon;
    this.trayIcon = null;
    this.trayMenu = null;
    try {
      if (tray && !tray.isDestroyed?.()) tray.destroy?.();
    } catch {
      this.disable("Tray cleanup", "could not destroy the tray icon");
    }
  }

  dispose(): void {
    this.destroyTray();
    const released = this.unregisterShortcut();
    this.trace("shortcut-cleanup", { released });
    this.release();
  }
}
