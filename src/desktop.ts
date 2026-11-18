export type WindowState = { visible: boolean; minimized: boolean; focused: boolean };

/**
 * Windows keeps a window on the virtual desktop where it was created, so showing it again switches back to that desktop.
 * PopNote avoids that by closing such a window and opening a new one, which Windows places on the current desktop.
 *
 * `documentVisible` is the pop-out page's visibility. Windows reports a window on another desktop (or fully covered) as
 * not visible even though it is not hidden.
 */
export function shouldReopenOnThisDesktop(state: WindowState | undefined, documentVisible: boolean): boolean {
  if (!state) return false;
  // Hidden or minimized: showing it again would bring back the desktop it was left on.
  if (!state.visible || state.minimized) return true;
  // Focus is not trusted: Windows can keep reporting a window on another desktop as focused. A window that is visible but whose
  // page is not showing is on another desktop (or fully covered), so a new one is opened here.
  return !documentVisible;
}
