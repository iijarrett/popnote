# PopNote

PopNote gives an Obsidian note its own floating desktop window. A global shortcut (or an optional tray icon) shows
and hides it, Pin keeps it above other apps, and an opacity slider fades it. It uses Obsidian's own pop-out window, so
it looks like your theme and fonts. Desktop only; it does nothing on mobile.

Requires Obsidian 1.5.12 or newer.

## Install

1. Download `main.js`, `manifest.json` and `styles.css` from the
   [latest release](https://github.com/iijarrett/popnote/releases/latest).
2. Copy the three files into `.obsidian/plugins/popnote/` in your vault, then restart Obsidian.
3. Enable **PopNote** in **Settings -> Community plugins**.

## Use

- Press **Ctrl+Alt+P** (Windows, Linux) or **Command+Option+P** (macOS) to show or hide the window. Pressing it again
  while PopNote is focused hides it. You can also run **PopNote: Toggle window** from the command palette.
- The first time, PopNote shows the note you have open. To pick another, open **⋯** in the window's tab strip and use
  **Note**: type part of a name or folder, then press Enter or click a result. The choice is remembered, as are the
  window's size and position, Pin and opacity.
- **⋯** also holds **Pin** (keep on top) and the opacity value (click it for the slider).
- **PopNote: Use current note** switches the window to the note you are looking at. **PopNote: Show controls** can be
  given a hotkey in Settings -> Hotkeys.
- The window cannot be made smaller than 340 x 160.

## Settings

- **Global shortcut**: write it without spaces, for example `Ctrl+Alt+P`. Use `Super` for the Windows key
  (`Super+Q`) and `Command` on a Mac. Spellings such as `Win + Q` can fail. A refused shortcut keeps the previous one.
- **Show on all desktops**: macOS Spaces and similar. Applies the next time PopNote opens.
- **Tray icon**: off by default. Click it to show or hide PopNote. Right-click for a menu: show or hide, **Keep on top**,
  **Opacity** (presets, or **Slider…**), **Find note…** (opens the search box) and **Switch note** (your five most recent
  notes). Windows may place a new icon behind the **^**
  in the taskbar; drag it out to keep it visible. Some Linux desktops have no tray.

On Windows, PopNote cannot pin itself to every virtual desktop. Press Win+Tab, right-click the PopNote window and
choose **Show this window on all desktops**.

## What has been tested

Windows 11 (Obsidian 1.15.1) is tested the most. Linux was checked under WSLg only (window opacity is not applied
there, so that control is disabled). macOS (Apple Silicon, Obsidian 1.15.0) was tested with real shortcut, menu-bar icon and
window input; Intel Macs, several desktops and a light menu bar are not yet confirmed. On a Mac, if a full-screen app is in front,
the shortcut switches to PopNote's own desktop instead of floating over that app. See [TESTING.md](TESTING.md) for dated results and what is
still unconfirmed. Native features (shortcut, tray, pin, opacity) use Electron access that Obsidian does not document;
if one is unavailable PopNote turns just that feature off with a notice and keeps working.

## Privacy

PopNote makes no network requests. Settings are saved in the vault's plugin data (`data.json`).

## Build

`npm ci --ignore-scripts`, then `npm run build` (type-check and bundle to `main.js`). `node --test tests/*.test.mjs`
runs the checks. `tests/installed-workspace.test.mjs` reads an installed Obsidian archive (set
`POPNOTE_OBSIDIAN_ASAR` if it is not at the Windows default); after an Obsidian update its name table needs re-mapping.
Build-time dependencies are `obsidian@1.14.4`, `typescript@5.8.3` and `esbuild@0.25.5`; nothing is shipped at runtime.
Test in a disposable vault only. `data.json`, build output and personal planning files are excluded from Git.

## License

PopNote is released under the [MIT License](LICENSE).

## Technique credits

The unique-title native-window lookup follows the approach credited to **Desktop Sticky Notes** (MIT). The remote
entry-point fallback follows the approach credited to **Quick Tray** (MIT). The implementations here were written for
this project; their upstream sources were not fetched or copied.
