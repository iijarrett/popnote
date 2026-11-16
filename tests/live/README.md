# Live checks

Scripts that drive a running Obsidian through its command line and print one JSON line, so the same checks can be run
on Windows, macOS and Linux. **Disposable test vault only.** They create sample notes, open windows, pin, change opacity
and turn the tray on and off.

## Run

1. Copy `main.js`, `manifest.json` and `styles.css` into `<test vault>/.obsidian/plugins/popnote/`, enable PopNote, and
   turn on **Settings -> General -> Command line interface** (Obsidian 1.12 or newer).
2. From this folder, for each script (the command is `Obsidian.com` on Windows, `obsidian` elsewhere):

   `obsidian vault=<test vault name> eval "code=$(cat tests/live/scenario.js)"`

   If the vault was just reloaded, give it ten seconds first. Run `scenario.js`, `tray.js` and `shortcut.js`.

## What to expect (as seen on Windows 11, Obsidian 1.15.1)

`scenario.js`: `opened`, `bound`, `pickerOpen`, `shown` and `sameId` are true; `hidden` is true; `tripResults` is
`["Plans/Trip to Lisbon.md"]`; `afterChoose` shows that note, the same window and a closed picker; every `sizes` entry has
`overlap:false`, `allInView:true` and `spacer` of at least 32 (the 250 request is held at 340); `panel` sits inside the window
(`left>=0`, `right<=vw`, `bottom<=vh`); `pinned` is true in the window and saved, `unpinned` true; `opacity` is 0.6 in the
window and saved (on desktops that do not support window opacity the control is disabled and this stays 1).

`tray.js`: `created` and `hasIcon` true; `menu` reads `Show or hide PopNote`, `Keep on top [ ]`, `Opacity > ...`, `-`,
`Find note…`, `Switch note > ...`; after the first click the window is open and visible, after the second it is not;
`afterOff` false.

`shortcut.js`: `ownedByPopNote` true. After a full quit and reopen, and after **Reload app without saving** (the
same-process restart that used to leave a dead shortcut on the Mac), it must still be true and pressing the shortcut must
still work.

## Checks that need a person

Pressing the shortcut three times (hide, show, hide, same window); a real click and a right-click on the tray / menu-bar
icon (menu entries Keep on top, Opacity > Slider…, Find note… with typing going into the search box, Switch note);
dragging the window by the empty part of the tab strip; dragging it smaller (it should stop at 340 x 160); and, on a
Mac, the window across Spaces (Show on all desktops is on by default) and next to a full-screen app. Turn **Debug
logging** on in Settings -> PopNote before a failing check and copy the `[PopNote]` lines from the developer console
(Cmd+Option+I).
