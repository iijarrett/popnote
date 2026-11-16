# PopNote

PopNote gives an Obsidian note its own floating desktop window. Use a global
shortcut to show or hide it, pin it above other apps, and adjust its opacity.

This is a development preview. It requires Obsidian 1.15.0 or newer.
Windows, macOS ARM64, and Kali WSLg have partial validation on Obsidian 1.15.0.
A macOS restart and shortcut registration issue remains open.

## Install from GitHub

1. Download `main.js`, `manifest.json`, and `styles.css` from the
   [GitHub release](https://github.com/iijarrett/popnote/releases/latest).
2. Copy all three files into `.obsidian/plugins/popnote/` in a disposable
   vault. Restart Obsidian or reload its Community plugins list.
3. Enable **PopNote** in **Settings → Community plugins** and follow the
   note and shortcut steps below.

## Open your first PopNote

1. Enable PopNote. There is nothing to prepare: the first time you summon it, it
   shows the note you have in front (or the last one you opened).
2. Press **Ctrl+Alt+P** on Windows or **Command+Option+P** on macOS to summon
   or hide the pop-out. If the shortcut is unavailable, use **PopNote: Toggle window** from the command palette.
   **Choosing a shortcut:** type it in Settings -> PopNote without spaces, such
   as `Ctrl+Alt+P`. Use **Super** for the Windows key, so Win+Q is `Super+Q`. On a
   Mac use `Command+Option+P`. Owner report: `Win + Q` brought PopNote up and hid
   it once, then stopped responding, and `Super+Q` worked repeatedly. Whether the
   spelling or something else caused the failure was not established.
3. Open **⋯** in the window's tab strip to reveal **Note**, **Pin** and the
   opacity control. **Note** opens a search box: type part of a note's name or
   folder, then press Enter or click a result to show that note in the same
   window. The choice is remembered. Select the displayed percentage to adjust
   opacity. Pin and opacity are remembered too.
4. Optional, in Settings -> PopNote: **Show on all desktops** (macOS Spaces),
   **Tray icon** (off by default; a click shows or hides PopNote) and **Debug
   logging** (off by default; writes lifecycle events to the developer console
   and stores nothing). **PopNote: Use current note** still switches the window
   to the note you are looking at. On Windows, PopNote cannot pin itself to every
   virtual desktop: press Win+Tab, right-click the PopNote window and choose
   **Show this window on all desktops**. A one-time tip says so on first use.

## Current state

Review follow-up, 2026-11-15: the note picker, saved pin, settings for all
desktops, tray and debug logging are in, and the minimum window width is now 340
px. Restart diagnostics used to write every event to the console and to
`localStorage`; they are now off unless Debug logging is on, and nothing is ever
stored. The build and all 104 automated checks pass. In the isolated Kali test
vault (Obsidian 1.15.0, WSLg) the new build was driven from its command line:
with no saved note the first summon opened the note in front and saved it; the
picker listed recent notes, filtered on "trip" and switched the open window to
that note in place; at the 340 px minimum Note, Pin, the opacity value and the
controls button did not overlap, the strip kept a 32 px gap and the picker
stayed inside the window; Pin and saved settings worked; the tray icon was
created and destroyed without error (whether that desktop shows a tray icon was
not observed). This was read from page layout and Electron state, not
screenshots, and the new build has not been run on Windows or a Mac yet.

Milestone 2 Stage 1 is implemented with the narrow-window, close-button and
new-tab fixes. The build and all 81 automated checks passed. On Windows with
Obsidian 1.15.0, the controls and slider left the note title visible at 639 px,
the standard window X closed PopNote cleanly, and + and Ctrl+T kept the
dedicated window at its saved 70% opacity. On a full restart with two PopNote
tabs open, the ordinary pop-out restored and PopNote stayed closed until the
shortcut summoned it. The scoped results and remaining checks are below.

The commands are now **PopNote: Use current note** (`popnote:use-current-note`) and
**PopNote: Toggle window** (`popnote:toggle`). Results recorded below before
2026-11-15 used their old names, "Prepare spike from current note" and "Toggle
spike pop-out"; hotkeys assigned to the old IDs must be set again. Restart
protection is now optional: if it is unavailable PopNote still opens, with a
Notice, and the window may restore after a restart. At startup PopNote also
releases a stale registration of its own saved shortcut before registering it.
The build and all 87 automated checks pass; none of this has been checked in a
live GUI yet.

Screen-driven Windows check, 2026-11-15, test_vault, Obsidian 1.15.1
(Obsidian updated itself from 1.15.0 during the session), build
0b274ca0... plus the settings-text change. Window state was read from Win32
(visible, foreground, topmost, layered alpha), not from screenshots. With the
default Ctrl+Alt+P and a maximized Notepad behind: create, hide, show, hide, show
worked in front each time; a visible PopNote behind Notepad was raised by the
shortcut. Pin made the window topmost over Notepad and unpin released it.
The slider set native alpha 127 (50%) and saved 0.5; a full quit to zero
processes and relaunch left PopNote closed, and the shortcut then restored the
note, bounds and 50%. Opacity was set back to 100%. Not covered: Super+Q
(another vault held it), pointer drag and resize, and virtual desktops.

The installed-method tests were then ported to the Obsidian 1.15.1 archive: the
minified names were re-mapped, and the tab-rendering check now follows the new
path (a tab group asks the workspace for a layout update, which runs on the next
microtask). All 87 checks pass, including the 5 installed-method ones.

Small-window fix, 2026-11-15, test_vault, Obsidian 1.15.1, Windows. Reported
problem: in a small window the tab strip filled up with the PopNote buttons,
Pin and the opacity control overlapped, and no empty part of the strip was left
to grab. A real mouse drag could shrink the window to 161 px wide, narrower than
the window buttons alone. Changes: (1) a minimum window size of 300 x 160, set
through `setMinimumSize` in `src/native.ts` (feature-detected, undone on
release) and also applied to saved bounds; (2) the opacity slider opens as a
popover under the tab strip, not inside it; (3) the empty part of the strip keeps
at least 2 rem and is marked as a drag region; (4) below 32 rem the tab, "+" and
tab-list buttons are hidden, because the note title is already in the view
header. Checked on the running window: at 312, 360, 440 and 600 px Pin, the
opacity value and the ⋯ button are readable and do not overlap; Pin made the
window topmost and the slider changed native alpha (255 to 163) from inside the
popover; a mouse drag below the minimum stopped at the minimum. Windows reported
a drag (title bar) region in the strip at every width tested, 312 to 640 px. A
simulated mouse drag on that region did not move the window, so dragging the
window by the strip with a real mouse is not yet confirmed. Once, after a reload,
the window reopened at a small size drawn as if it were wider (controls off the
right edge); that came right after I had resized the window from outside
Obsidian and did not recur after the minimum size was added.

The three pinned packages resolved and the lockfile was reviewed. Dependency
installation with scripts disabled and `npm run build` succeeded. The first
sandboxed build was blocked by `spawn EPERM`; the approved retry outside the
sandbox passed type checking and generated the initial `main.js`.
The exclusive-window guard was built on 2026-11-06: `npm run build` and all
64 automated tests passed. Owner GUI checks now pass mixed-tab release and
movement into the main window and another ordinary pop-out, within the limits
recorded below. Disable/re-enable after release and full restart with released
content passed on 2026-11-07. Those results apply to the earlier build. The
latest Windows smoke test below includes native pin-state readback, with
pointer dragging, border resizing, and the listed regression checks still
pending. PopNote 0.0.2 is a development preview.
The Windows test-vault junction now points from
`<test-vault>\.obsidian\plugins\popnote` to this
project. `manifest.json`, `main.js` and `styles.css` were verified through the
junction against the source files by SHA-256 on 2026-11-05.
Tray support and Floating Quick Note source research remain pending.

Windows, macOS and Linux desktop use the same generated `main.js`,
`manifest.json` and `styles.css`; there is no platform-specific plugin bundle.
Keep `isDesktopOnly: true` and the desktop guard. Mobile is unsupported; actual
mobile exclusion is unverified until tested.

## Build

`npm run build` type-checks and builds `main.js`. `npm run dev` watches and
transpiles only; it does not type-check. Build-time dependencies are exactly
`obsidian@1.8.7`, `typescript@5.8.3` and `esbuild@0.25.5`.
Electron and remote access must come from Obsidian, never an installed package.

For a fresh checkout, run `npm ci --ignore-scripts`, then `npm run build`.
Run the existing regression suite with `node --test tests/*.test.mjs` after the
build. Installed-workspace tests read selected methods from an installed
Obsidian 1.15.1 archive using host doubles; they never run the full application.
On Windows the default is `%APPDATA%/obsidian/obsidian-1.15.1.asar`. Set
`POPNOTE_OBSIDIAN_ASAR` to that archive's location on other setups. The archive
is not included in this repository. Obsidian renames its internal classes in
every release, so after an Obsidian update these tests fail with a version or
"class was renamed" message; the name table at the top of
`tests/installed-workspace.test.mjs` then needs re-mapping. Automated passes do
not establish GUI or cross-platform support.

Use a disposable test vault only. Load the built `main.js`, `manifest.json`
and `styles.css` from `<test-vault>/.obsidian/plugins/popnote/` by copying them
or linking the project folder. Local settings (`data.json`), vault content,
logs, build output and personal planning/instruction files are excluded from Git.

## Local diagnostics

PopNote saves its settings in the vault's plugin data. Recent startup and window
diagnostics, which may include vault-relative note paths, are stored in Obsidian's
local storage for troubleshooting. The plugin makes no network requests.

## Linux smoke test

In an isolated Kali amd64 WSLg environment on Obsidian 1.15.0, the command
opened the note and the compact controls in both Wayland and XWayland. The
toggle hid and restored the same native window. Both sessions kept the
window at full opacity, so PopNote disabled the opacity control. Native
readback alone does not establish visible stacking. Global shortcut delivery,
pointer movement and resizing, and independent desktop sessions still need
testing. Arch, Omarchy, Ubuntu and Debian remain unverified.

On 2026-11-15 the three plugin files in the isolated Kali QA vault (under
`/tmp/popnote-kali-runtime.*/qa/vault/.obsidian/plugins/popnote`, a temporary
folder inside the Kali distribution) were replaced with the current build and
their SHA-256 values matched the project folder. Its `data.json` was kept.
Later the same day Obsidian 1.15.0 (Linux x86_64, WSLg, XWayland, GPU disabled,
unprivileged test user, no network) was started from that folder and driven through
its command line. The build loaded, and the pop-out opened with the controls expanded.
With the window resized from code to 700, 500, 400, 330 and 300 px, Pin, the opacity
value and the controls button never overlapped, all stayed inside the window, and the
empty strip kept 120, 206, 106, 52 and 32 px. A request for 200 px was held at 300
(minimum size 300 x 160 as set). Pin set and cleared always-on-top, and two toggles hid
and showed the same native window ID. Opacity stayed disabled, as in the earlier Kali
run, because this display does not apply window opacity. This was read from the page
layout and Electron window state, not from screenshots, and only on this one
WSLg/XWayland setup; pointer dragging, real desktop sessions and other distributions
and Wayland-native sessions are still untested.

## GUI coverage and result record

Run Windows first, macOS second, then available Linux setups. Windows has the
limited passes below. See the separate Kali WSLg results above.
Add a separate result row for each actual machine, desktop session and Obsidian
package. A build pass is not a GUI pass.

| Order | Target | Architecture | GUI status |
|---|---|---|---|
| 1 | Windows | Not recorded for reported run | Partial: Obsidian 1.15.0, test_vault; see controlled results below |
| 2 | macOS | ARM64 | Partial on Obsidian 1.15.0. Same-process shortcut registration failed after restart. Desktop input and full process restart are unverified. |
| 2 | macOS | x64 | Pending (unverified; machine availability to confirm) |
| 3 | Linux X11 | x64 | Pending (unverified; as machine/package available) |
| 3 | Linux X11 | ARM64 | Pending (unverified; as machine/package available) |
| 3 | Linux Wayland | x64 | Pending (unverified; as machine/package available) |
| 3 | Linux Wayland | ARM64 | Pending (unverified; as machine/package available) |

For every new run, use this template; the dated record below overrides these
pending placeholders only for the observations it explicitly supplies:

- Date, OS/distro and version, CPU architecture: **pending**.
- Desktop environment/compositor and desktop session (X11/Wayland on Linux):
  **pending**; use not applicable only where appropriate.
- Obsidian app version, package format, package source and package version:
  **pending**. Record the actual format/source (for example AppImage, deb/rpm,
  Flatpak, Snap or another package); listing a format does not claim support.
- Obsidian display backend (native Wayland, XWayland, X11, or unknown):
  **pending** for Linux; do not infer it from the desktop session alone.
- SHA-256 of the shared `main.js`, shortcut used, and native IDs before/after
  hide/show and manual close: **pending**.
- Separate results for public pop-out, native lookup, shortcut registration,
  shortcut keypress, focus, always-on-top, opacity, workspaces and cleanup:
  **pending**. Record pass, fail or unavailable, with the observed behavior and
  Notice/error; unknown or untested results stay pending.

Community ports and untested setups/packages remain **unverified**. A result
applies only to the exact tested setup and does not establish general support
for an OS, architecture, session or package format.

## Windows owner test - first (partial)

These are test instructions, not a blanket pass. The dated record below states
exactly which checks the owner completed. Keep the saved opacity at 40% during
the ownership follow-up; do not repeat the older slider sweep unless approved.

1. Open only `<test-vault>`. Enable PopNote under
   Settings -> Community plugins. Expect a shortcut registration notice.
2. Create and open a disposable note. Run **PopNote: Use current note** from the command palette. This captures the note without opening a
   pop-out. This is only needed for initial selection or changing the saved test
   note; the note and window settings persist. There is no note picker yet.
3. Minimize Obsidian before the first summon. From another app press
   **Ctrl+Alt+P**. Expect that note in an Obsidian pop-out with pin/opacity controls
   and a **Native window ID N: created; previous ID none** diagnostic. The main
   window must stay minimized. Record any automatic main-window restoration.
4. Press the shortcut while PopNote is focused: expect it to hide. Press again:
   expect it to return with the same ID. With pin off, focus another app and
   press again: expect PopNote to focus instead of hiding. Also minimize the
   pop-out and summon it; expect the same ID. Never restore the main window.
5. Turn **Pin** on and click another app: expect PopNote to remain above
   it. Turn pin off: expect ordinary stacking. This differs from desktop pinning.
6. Deferred opacity sweep: 100%, 60%, 30%, then back to 100%, checking that the
   whole window and text fade. Do not run this during the current ownership
   follow-up; leave opacity at 40%.
7. Manually restore Obsidian to open Settings -> PopNote. Enter **Super+Q** and
   click **Apply**. Minimize Obsidian again and test **Win+Q**. Registration
   success and actual behavior are separate results. If refused, try another
   combination. Apply replaces the old binding after the new one registers.
   A refused combination leaves the previous binding active.
8. Use **Win+Tab**, right-click PopNote -> **Show this window on all desktops**.
   Switch desktops while visible, then hidden; summon it again. Record the ID,
   whether the desktop pin survives, and whether Windows changes desktops.
   Also test summoning an unpinned hidden pop-out from another desktop and record
   where it appears. No desktop automation or reopen workaround is implemented.
9. Close the pop-out with its title-bar X. Summon it again: expect a new ID with
   the previous ID included. Record the desktop and whether the manual desktop
   pin is lost. Move and resize PopNote, keeping opacity at 40%, then close it
   and summon again. Expect the new window to restore those settings. Restart
   Obsidian and summon directly without preparing again; confirm the same
   settings. If the old display is disconnected, verify the new window opens on
   a visible display.
   On Wayland, record whether the size restores and let the desktop choose the
   position. The always-on-top toggle lasts only for the enabled session.
10. Disable PopNote. Expect its pop-out to close and shortcut to stop responding.
    Re-enable and summon without preparing again to check cleanup.

### Controlled Windows results reported 2026-11-06

Owner observations in `<test-vault>`, Obsidian
1.15.0. Windows version, CPU architecture, package/source and the tested
`main.js` hash were not supplied for this run; do not infer them from older
records. PopNote is currently enabled. The saved opacity remains 40%.

- [x] Full shutdown reached zero Obsidian processes before reopening.
- [x] Reopening restored the ordinary floating window with both `Welcome.md`
  and `Other.md` tabs. PopNote stayed closed until explicitly summoned.
- [x] Startup diagnostics showed `incoming-layout-filter`, then
  `incoming-layout-delegate`, then ordinary window creation, followed by
  `compat-startup-check` with `coldStart:true` and `verified:true`.
- [x] Ctrl+Alt+P summoned `Welcome.md` at the saved 40% opacity without
  preparation. The main window remained minimized.
- [x] Hide/show reused native window ID 3.
- [x] Manual close followed by summon created native window ID 4, retained
  40% opacity and left no empty window.
- [x] Disabling closed only PopNote; the main window and ordinary floating
  `Welcome.md` / `Other.md` tabs remained. The shortcut did nothing while disabled.
- [x] Re-enabling restored shortcut summoning of `Welcome.md` at 40% opacity
  without preparation. This late enable does not independently prove cold-start
  timing; that was verified by the full restart above.

An earlier unexpected Obsidian exit did not recur during this controlled
disable/re-enable test. Its cause remains unknown; no crash fix is established.

Still pending:

- [x] Restart preservation of released tabs on the guard build passed on
  2026-11-07, as recorded below. Native pinning, interrupted shutdown and
  frame-by-frame startup-flash detection remain unverified.
- [ ] Crash or interrupted shutdown.
- [ ] Windows virtual-desktop pinning and behavior after hide/show or replacement.
- [ ] macOS and Linux, including their native features and cleanup.
- [ ] Frame-by-frame confirmation of no startup flash. Passive startup passed
  by normal observation only.

Other earlier spike checks are not implied by these passes: theme/font variety,
Win+Q, separate focus/always-on-top checks, geometry changes and off-screen
recovery retain their existing unverified status where no result is recorded.

The current diagnostic is visible in the pop-out. Every creation and toggle
also writes a notice and `[PopNote]` line in the developer console
(Ctrl+Shift+I on Windows). Record both IDs, action, shortcut, Obsidian version
and OS version. If native lookup fails, the public pop-out remains available
via **PopNote: Toggle window**; native features must not target the main
window. An API failure disables the affected feature for this plugin session.

## macOS ARM64 results and remaining checks

Reported on 2026-11-12 for PopNote 0.0.1, macOS 27.2.1 (26B131), ARM64, and
Obsidian 1.15.0. A scratch build matched the supplied main.js byte for byte.
All 81 regression checks passed. The reported vault comparison found all
566 existing note, canvas, and base files at the same paths and with the
same contents.

- Obsidian registered Command+Option+P. The toggle command hid and showed
  native window 4. Closing and summoning created window 5 with the saved note,
  geometry, and 67% opacity.
- Native readback confirmed pin and unpin, opacity at 60%, 30%, 100%, and 67%,
  persistence after programmatic movement and resizing, and the all-Spaces flag.
- Disabling PopNote closed its window and released the shortcut. Re-enabling
  restored registration and settings with passive startup.
- A same-process restart kept startup passive and restored settings, but
  registration of Command+Option+P failed. A separate relaunch attempt also
  stayed in the same process and left the settings file empty. The tester
  restored the settings and cleared the stale registration. The final state was
  enabled, with Command+Option+P registered and the PopNote window closed.
- Desktop input and capture were unavailable. Physical shortcut delivery,
  visible pinning and opacity, pointer dragging and resizing, ordinary and
  full-screen Spaces, and Dock or window flicker remain unverified.

A follow-up run reproduced the shortcut failure twice in a disposable vault
with the same Obsidian main PID and a new renderer each time. The old renderer
logged beforeunload without plugin-unload or shortcut-cleanup. Electron
reported the shortcut was still registered. The toggle command restored the
saved window in both runs. Both settings files stayed byte-identical despite
a second shutdown write with no recorded completion.

The candidate releases PopNote's own shortcut on renderer exit, stops the
bounds watcher before flushing, and lets Obsidian wait for queued settings
writes when its quit hook runs. The three new regressions failed against the
original bundle. The candidate build and all 84 automated checks passed on
Windows. A live Mac retest and recovery from an interrupted write remain open.

For the next run, use a disposable vault with the candidate main.js from
the project folder and its matching manifest.json and styles.css. The
candidate main.js SHA-256 is fae411e1dff6415d8adb315287136e028b082ad71fa3e3fa4caddc94133a56e8
(2026-11-15; it supersedes 4cb8eb45...5f31 and adds the small-window fix, whose files are main.js, styles.css and manifest.json with styles.css SHA-256 3d4135962b14978f4d0cf6f5d3f27f3141230e629c2cd9857b4c7f9fa101a397).
Test a full quit and reopen after confirming all Obsidian processes exit.
Capture the shortcut cleanup and registration events and the settings write
and load events. Repeat the same-process restart as a separate run. Record
whether the pop-out stays closed at startup and the saved settings return on
the first physical shortcut press. Test the remaining visual checks when
desktop input and capture are available.

## Linux follow-up - after Windows and macOS (pending)

Use a separate Linux test vault and copy the same built plugin files. Repeat
the following on **X11 x64, X11 ARM64, Wayland x64 and Wayland ARM64** as test
machines and packages become available. Record the distro, session, desktop
environment/compositor and exact Obsidian package using the record above. No
Linux setup or community port has been GUI-verified.

1. **Public pop-out first:** enable PopNote, open a disposable note and run
   **PopNote: Use current note**, then **PopNote: Toggle window** from Obsidian's command palette. Expect that note in a separate
   pop-out with the vault's theme and fonts. Record native lookup separately;
   unavailable native access must not prevent the public pop-out opening.
2. **Global shortcut:** close the pop-out manually, minimize the main window
   and press **Ctrl+Alt+P** from another app. Record registration and actual
   keypress separately. Expect PopNote to open while the main window stays
   minimized. Test hide/show and minimized-pop-out restore; record whether its
   native ID is reused. If refused, apply another available combination in
   Settings -> PopNote and record it. Do not treat registration as proof that
   the shortcut fires.
3. **Focus:** with pin off, focus another application, then summon PopNote.
   Expect it to come forward and focus; a press while focused should hide it.
   If the shortcut is unavailable, manually restore Obsidian and use the
   palette toggle to test the focus request separately. Record focus behavior
   independently of shortcut support; never infer a pass from an API return.
4. **Always-on-top:** turn **Pin** on, focus another app and observe
   whether PopNote stays above it. Turn pin off and check normal stacking.
   Record ignored behavior, unavailable controls and Notices separately.
5. **Opacity:** test 100%, 60%, 30%, then restore 100%. Expect the whole window
   and text to fade. Record actual behavior even if the API reports success.
6. **Fallback after each unavailable native feature:** close the pop-out
   manually, manually restore Obsidian and run **PopNote: Toggle window**
   in the command palette. Expect the prepared note to open again without
   requiring the unavailable native feature. Record fallback failure if it
   cannot open. Native lookup failure may leave pin/opacity controls absent.
7. **Workspace and replacement observations:** switch workspaces with PopNote
   visible, hidden and minimized; then summon it. Record where it appears and
   whether the main window or desktop focus changes. Close it manually and
   reopen; expect a replacement ID if lookup is available. Record these results
   without assuming Windows Task View or macOS all-Spaces behavior. The Linux
   default reuses the window and does not enable all Spaces.
8. **Cleanup:** disable PopNote, expecting its owned pop-out to close and its
   shortcut to stop responding. Re-enable, prepare the note and repeat.

## Later tray milestone - pending

Tray is not part of this spike. At v0.2, test icon creation, click/toggle,
disable and unload cleanup on Windows, then macOS, then available Linux
X11/Wayland and x64/ARM64 setups. Record the exact setup/package and whether an
icon actually appears and receives clicks. Untested or unavailable behavior
remains unverified. Floating Quick Note research remains separately pending.

If a native check fails, record it, test the public pop-out fallback and stop
for review before further development. Wait for owner GUI results before v0.1;
setups without test machines remain pending, never silently passed.

## Restart compatibility spike - limited Windows pass

All experimental layout hooks and writable leaf-ID access are in
`src/workspace-compat.ts`. Only namespaced PopNote leaves in floating layouts
are filtered; note paths and geometry never establish ownership. Unsupported
layouts are passed through unchanged with a compatibility Notice. Close legacy
unmarked spike pop-outs manually before testing the new build.

Run `npm run build`, then
`node --test tests/*.test.mjs`.
The installed-method checks read `obsidian-1.15.1.asar` locally (1.15.0 when this
passage was written), extract selected
methods in memory and execute them with host doubles. They never launch or
modify Obsidian. `POPNOTE_OBSIDIAN_ASAR` can select another local archive, but
a changed version requires review. All 40 focused checks passed again on
2026-11-06; host doubles do not establish GUI support. Scoped mixing/movement
GUI passes and the later disable/re-enable and full-restart passes are recorded
below; native pinning and crash/interrupted shutdown remain pending. The current saved opacity is
40%; no milestone 2 UI or opacity changes are included. Keep v0.1 on hold.

On a full restart, look for `incoming-layout-filter`, then
`incoming-layout-delegate` before ordinary `workspace-window-open` events, and
`compat-startup-check` with `coldStart:true` and `verified:true`. On explicit
summon, `ownership-claimed` must report lookup and serialization verification.
`ownership-lookup` reports whether the marked leaf still resolves after layout
changes. A late disable/re-enable cannot verify cold-start ordering.

Earlier owner GUI testing confirmed startup-hook timing, but exposed an early DOM
document check that rejected creation and left an empty pop-out. The attachment
correction checks the separate workspace container before marking, then waits
for that leaf's connected view to enter its document before native binding.
Timeout, failed opening and closure paths detach the owned leaf and release
wait resources. The controlled Windows results above now pass direct summon,
replacement without an empty window, restart filtering and basic disable/re-enable.
They do not validate mixed windows, tab movement or abnormal shutdown.

### Exclusive-window guard - implemented, partial Windows GUI pass

Controls and native behavior require the exact owned leaf to be the sole leaf
in its original separate floating container/document. Layout changes, outgoing
serialization, native actions, controls, bounds callbacks and unload check this
boundary. Mixed tabs or movement release the window without closing/detaching
tabs. Controls/listeners are removed and stale opening/control callbacks cannot
act on a later PopNote. An unresolved old note opening does not block a new summon.

Release normally restores the leaf's original ordinary ID, choosing another ID
if it is occupied. A leaf-local serialization guard is prepared before claiming:
if the live ID later becomes immutable, only that released leaf's serialized ID
is replaced. That safety wrapper remains on the ordinary leaf until it closes,
including after plugin disable. No unrelated leaf or prototype is patched.

**Released tabs are ordinary workspace content and may restore on restart.**
They are never reclaimed by PopNote. The next explicit summon creates a new
dedicated window for the saved note at its saved geometry and 40% opacity.

Native rollback uses only the captured original window and original values.
It restores applied opacity, pin, all-Spaces, bounds and visibility only if the
current value still matches the last value PopNote applied; later external
changes are preserved. Bounds rollback may return the released window to its
pre-PopNote size/position if it has not since been moved/resized. Saved PopNote
geometry is retained. Visibility rollback uses inactive showing, without focus.
Missing snapshot methods disable just that feature before applying it; a failed
rollback reports a Notice and disables further application of that feature.
Nothing is transferred to the destination/main window. Own-window close detaches
before unmarking, so an intervening save cannot restore it as ordinary content.

`npm run build` and `node --test tests/*.test.mjs` passed on 2026-11-06: 64 tests,
including bundled lifecycle tests, native rollback/failure tests, asynchronous
release tests, and frozen-leaf release/restart using installed Obsidian 1.15.0
methods with host doubles. These do not establish GUI support. Settings file,
dependency files, manifest and stylesheet were unchanged. No compact UI, opacity
range change or v0.1 is included.

### Windows guard results reported 2026-11-06

Owner-reported checks in test_vault, continuing the Obsidian 1.15.0 Windows
test sequence. These establish only the observations listed; native IDs are
session-specific and must not be assumed to continue across restarts.

- [x] Mixed-tab release, using two Welcome.md tabs: the shared window retained
  both usable tabs, removed PopNote controls and appeared at normal opacity.
  The next shortcut summon created native ID 4, previous ID 3, at 40%.
  The release Notice was not captured; its text remains unverified.
- [x] Movement into the main window, in a fresh Obsidian session: the moved
  Welcome.md tab remained visible, controls disappeared and no empty source
  window remained. The main window appeared at normal opacity. After minimizing
  it, Ctrl+Alt+P created native ID 3, previous ID 2, at 40% with matching saved
  geometry; the main window stayed minimized. These IDs supersede the suggested
  IDs in the earlier instructions for that fresh session.
- [x] Movement into an ordinary floating window: Welcome.md and Other.md both
  remained usable in the destination; controls disappeared, the destination
  appeared at normal opacity and the empty source window closed. With the main
  window minimized, Ctrl+Alt+P created native ID 4, previous ID 3, at 40% with
  saved geometry restored. The ordinary two-tab window remained unchanged and
  the main window stayed minimized.
- [ ] Native pinning, including rollback and absence of transfer, remains
  unverified. Normal-looking opacity does not establish pinning behavior.
- [x] Disable/re-enable with released tabs and a fresh dedicated PopNote open:
  passed on 2026-11-07; see the separate dated record below.
- [x] Full restart preserved released ordinary tabs while dedicated PopNote
  stayed closed until explicitly summoned: passed on 2026-11-07, as recorded below.

The release Notice text is still unverified; do not infer it was seen in the
movement checks. Compact UI and v0.1 remain deferred. Crash/interrupted shutdown,
virtual desktops, macOS/Linux and frame-by-frame no-flash coverage remain pending.

### Windows disable/re-enable results reported 2026-11-07

Owner-reported pass in test_vault. Obsidian had been closed, so the released
Welcome.md / Other.md window was recreated by adding an ordinary tab to PopNote
before testing. This does not verify restoration of released content on restart.

- [x] Disabling closed only the dedicated PopNote. Released Welcome.md / Other.md
  tabs remained usable.
- [x] While disabled, Ctrl+Alt+P opened nothing and the main window stayed minimized.
- [x] Re-enabling did not automatically open PopNote.
- [x] After minimizing again, Ctrl+Alt+P opened Welcome.md without preparation
  at saved geometry and 40%; released tabs remained intact and the main window
  stayed minimized.
- [x] Final diagnostic, exactly as displayed: **native ID 6; previous ID none**.
  Do not substitute IDs from the preceding session.
- [x] The owner reported that saved note, geometry and opacity values remained
  unchanged.

Native pinning remains unverified. Release Notice text remains unverified from
the earlier checks. Released-content full restart was still pending at this
point; its subsequent result is recorded separately below. Compact UI and v0.1
remain deferred.

### Windows full-restart results reported 2026-11-07

Owner-reported pass in test_vault, Obsidian 1.15.0. Setup: recreated the released
Welcome.md / Other.md window and a separate dedicated PopNote before quitting.

- [x] Confirmed zero Obsidian processes before reopening.
- [x] Both released tabs restored and remained usable without PopNote controls.
- [x] Dedicated PopNote stayed closed until explicitly summoned.

Reported startup diagnostics, in order (fields preserved as supplied):

```json
[
  {"event":"incoming-layout-filter","removedIds":[],"layoutReadyAtEntry":false,"incomingCalls":1},
  {"event":"incoming-layout-delegate","incomingCalls":1},
  {"event":"workspace-window-open","layoutReady":false,"ownedPopoutOpen":false},
  {"event":"compat-startup-check","coldStart":true,"incomingCalls":1,"incomingBeforeReady":true,"verified":true},
  {"event":"layout-ready","ownedPopoutOpen":false,"floatingWindows":1,"floatingFiles":["Welcome.md","Other.md"]}
]
```

- [x] After minimizing the main window, Ctrl+Alt+P summoned Welcome.md without
  preparation at saved geometry and 40% opacity.
- [x] Hide/show reused native ID 3. After closing with X, summon created native
  ID 4, previous ID 3. Exact reported diagnostics:

```text
Native window ID 3: created; previous ID none
Native window ID 3: shown (reused)
Native window ID 4: created; previous ID 3
```

- [x] Replacement retained 40% and matching geometry. No empty window remained;
  the main window stayed minimized.

The incoming filter reported `removedIds:[]`; this run does not show removal
of a persisted marked leaf during incoming restoration. The observed pass is
released-tab restoration, passive startup, verified hook timing, direct summon,
native-window reuse/replacement and saved geometry/opacity on this Windows setup.
Native pinning, frame-by-frame flash detection and crash/interrupted-shutdown
behavior remain unverified. Windows virtual desktops, macOS/Linux and release
Notice text also retain their pending status. Compact UI and v0.1 remain deferred.

### Windows acceptance - run one scenario at a time

Scenarios 1-5 have the scoped owner-reported passes above. Use only test_vault;
keep opacity at 40% and do not
prepare again. Stop after each scenario to record its result. Native pinning
and the release Notice text remain unverified. Compact UI and v0.1 stay deferred.

**1. Ordinary tab joins PopNote (passed using two Welcome.md tabs; Notice text unverified).**

1. Settings -> Community plugins -> turn PopNote off, then on to load the build.
   Ordinary windows stay open; re-enable must not summon PopNote.
2. Press Ctrl+Alt+P. Expect Welcome.md at 40% with the existing spike controls.
3. Drag the ordinary Other.md tab into PopNote's tab strip. Expect both notes
   still open, a release Notice, controls gone and the source window's previous
   normal opacity restored. Do not close either tab.
4. Press Ctrl+Alt+P. Expect a new dedicated PopNote at saved geometry and 40%,
   leaving the two-tab ordinary window alone. Stop and record the result.

**2. Owned tab moves into the main window (observed behavior passed; pinning unverified).**

1. From a dedicated PopNote, drag its Welcome.md tab into the main window.
2. Expect the note to remain open, controls removed, no destination opacity/pin
   change and no empty source window. Press Ctrl+Alt+P: a new dedicated PopNote
   opens at saved geometry/40%; the moved note stays ordinary. Stop and record.

**3. Owned tab moves into another ordinary pop-out (observed behavior passed; pinning unverified).**

1. Drag the dedicated PopNote's tab into an ordinary pop-out containing Other.md.
2. Expect both notes intact with no PopNote controls or native changes in the
   destination. Summon again: a fresh dedicated PopNote, no reclaimed window or
   empty source window. Stop and record.

**4. Disable/re-enable after release (passed 2026-11-07; pinning unverified).**

1. Leave the released ordinary tabs and a newly summoned dedicated PopNote open.
2. Settings -> Community plugins -> turn PopNote off. Expect only the dedicated
   PopNote to close; the released Welcome.md / Other.md tabs remain usable and
   their ordinary window stays at normal opacity.
3. Minimize the main window and press Ctrl+Alt+P. Expect no PopNote window and
   no main-window restoration while disabled.
4. Restore the main window manually, then turn PopNote on. Expect no automatic
   PopNote. Minimize the main window and press Ctrl+Alt+P: expect the saved note
   at saved geometry and 40%, without preparation, while the main window stays
   minimized and the released tabs remain unchanged. Record the native ID and
   previous ID exactly as shown; do not require particular numbers after
   re-enable. Stop and report this scenario before proceeding to restart.

**5. Restart preserves released content (passed 2026-11-07; remaining limits above).**

1. Leave released ordinary tabs and a dedicated PopNote open. Quit Obsidian and
   confirm zero processes. Reopen test_vault.
2. Expect released ordinary tabs to restore normally, with no controls. The
   dedicated PopNote must stay closed. Check incoming filter/delegate precede
   ordinary creation and `coldStart:true`, `verified:true`.
3. Minimize the main window and press Ctrl+Alt+P: saved note, geometry and 40%,
   no preparation, main stays minimized. Hide/show reuses its ID; manual close
   and summon replaces the ID without an empty window. Stop and record.

Crash/interrupted shutdown, Windows virtual-desktop pinning, macOS/Linux and
frame-by-frame startup-flash checks remain later validation, not passed by this
step. The unexplained exit's cause is still unknown; investigate if it recurs.
The approved Stage 1 overlay is recorded below. Note picking, chrome hiding and
the proposed 80–100% opacity range and 90% default remain deferred. v0.1 stays on hold.

## Milestone 2 Stage 1 - compact controls and tab behavior

- On the tested tab layout, **⋯** sits in Obsidian's existing tab strip,
  so the controls take no separate row. Click it to toggle the drag handle,
  Pin, and opacity. Clicking the note dismisses the controls. Obsidian's
  navigation and window buttons remain available.
- The opacity slider uses 30–100% in 1% steps. The test vault's saved value
  was 70% during the latest checks. **PopNote: Show controls** can be assigned
  an Obsidian hotkey. Escape closes the slider, then returns to the note.
- Tabs opened with + or Obsidian's New tab command belong to the dedicated
  PopNote window. Moving a tab out or bringing in an ordinary tab releases
  the window and preserves its tabs as ordinary content. The next summon
  opens a new dedicated window for the saved note.
- PopNote-owned tabs are excluded from workspace restoration. The shortcut
  restores the selected note, window geometry, and opacity.

**Latest Windows smoke test — Obsidian 1.15.0 in test_vault.**

- [x] At 639 px, the note title stayed visible with the controls and slider open.
- [x] + and Ctrl+T opened tabs while keeping PopNote controls and 70% opacity.
- [x] The standard X closed a two-tab PopNote. Ctrl+Alt+P reopened Welcome.md
  with the saved size, position, and opacity.
- [x] After quitting with a two-tab PopNote open, the ordinary Other.md pop-out
  restored. PopNote stayed closed until Ctrl+Alt+P summoned it.
- [x] The opacity slider changed from 70% to 80% and saved the value. It was
  restored to 70%.
- [x] The Windows Move and Size menu commands changed the saved position and
  width. Resummoning restored the new bounds and 70% opacity.
- [x] Pin and unpin matched Electron's native state, including after the
  pop-out lost focus. On Windows the fallback pin level may sit above the
  taskbar if the window overlaps it.
- [ ] Pointer dragging by the PopNote handle and pointer resizing by the
  window border. Automated pointer input also failed to move Obsidian's
  title bar. The keyboard Move and Size checks cover geometry persistence.
- [ ] Repeat mixed-tab movement, disable/re-enable, and keyboard focus recovery
  with this build. The earlier GUI results below apply to the earlier build.
- [ ] Alternate themes and fonts, narrower sizes, zoom, interrupted shutdown,
  frame-by-frame flash detection, macOS, and Linux.

The build and all 81 automated checks passed, including tab ownership,
release cleanup, restart filtering, and pin readback. Stage 2 and v0.1 remain deferred.

The latest Windows check on Obsidian 1.15.0 confirmed that the same window
comes forward when behind the main window, hides when focused, and returns
when toggled again. The ⋯ button opened and closed the controls, and the
slider changed native opacity from 70% to 71% before restoring 70%.

**Historical Windows hover-reveal result reported 2026-11-07.**

After toggling PopNote off/on, it stayed closed. Ctrl+Alt+P opened Welcome.md at
40% while the main window remained minimized. Existing Obsidian chrome and the
small `⋯` button were visible; bulky diagnostic rows were gone. Controls appeared
when the pointer moved to the top edge below the note header and hid when it
moved back over the note. Note text stayed in place and `⋯` remained available.
Screen control positioned the pointer using a small upward scroll while the
note was already at the top; retain that method as part of this reported run.
Adding a second tab returned the window to normal opacity, consistent with
existing ownership release. That extra observation does not by itself complete
the separate overlay cleanup/movement regression checks. Native pinning and the
remaining pending checks above are not implied by this pass.

**Windows keyboard result reported 2026-11-07 — pass in test_vault.**

Ctrl+Shift+F9 focused `⋯`. Tab moved through Pin and 40%; Enter focused the
slider at 40%. Two Escapes returned focus to the editor. Editor Tab indented
the disposable test note; the change was undone. The temporary hotkey was
removed. This confirms keyboard recovery and normal editor Tab behavior; it
does not establish native pinning or slider value-change behavior.

**Historical Windows scenario: hover reveal and note stability (previous build).**

1. Settings -> Community plugins -> turn PopNote off, then on to load the build.
   Expect passive re-enable; ordinary windows remain.
2. Minimize the main window and press Ctrl+Alt+P without preparing again.
   Expect the saved note/geometry at 40%, existing Obsidian chrome still visible,
   the small `⋯` button, and no bulky spike rows or native-ID Notice.
3. Hover the top edge of the note content, below the existing header. Expect
   the compact controls to appear without moving note text.
4. Move the pointer back over the note without clicking a control. Expect the
   row to hide, note text to stay put and `⋯` to remain available. Stop and report.

**Windows keyboard access and recovery (passed; steps retained, test_vault only).**

The current command is **PopNote: Show controls**, ID `popnote:show-controls`.
It has no default hotkey. Use a temporary Obsidian hotkey to test recovery
directly, keeping the main window minimized and avoiding command-palette focus
restoration as a prerequisite. Do not change the global Ctrl+Alt+P shortcut.

1. Manually open Settings -> Hotkeys in the main window. Search **PopNote: Show
   controls**, click its add-hotkey button and press **Ctrl+Shift+F9**. If Obsidian
   reports a conflict, stop and report it. Close Settings and minimize the main
   window. Leave the released ordinary two-tab window alone.
2. Press **Ctrl+Alt+P** for a dedicated PopNote. Click Welcome.md's editor so a
   caret is visible (if currently reading, use **Ctrl+E** to switch, then click).
   Leave the pointer over note text, away from the reveal edge.
3. Press **Ctrl+Shift+F9**. Expect the overlay to appear and keyboard focus to
   move to the `⋯` **Show PopNote controls** button in this same pop-out. The main
   window must stay minimized; the note/caret position and 40% value stay intact.
4. Press **Tab**: expect focus on **Pin** if enabled. Press **Tab** again for
   **40%** (accessible name **Window opacity**). If Pin is disabled, the first
   Tab should skip it and land on 40%; omit the second Tab. Do not activate Pin.
   The row must remain visible with the pointer still over the note.
5. Press **Enter** on 40%. Expect the opacity panel to open and focus to move
   to its **Opacity** slider, still at 40%. Do not press arrow keys or alter it.
   Press **Escape** once: panel closes, focus returns to the 40% button and the
   row remains visible. Press **Escape** again: focus returns to the prior note
   editor and the row hides with the pointer away; `⋯` stays available.
6. With the caret back in the editor, press **Tab** once. Expect ordinary editor
   behavior, not a jump to PopNote controls. Press **Ctrl+Z** if Tab edited the
   note. Stop and report focus at each step, any hiding, and any main-window
   restoration. The temporary hotkey may be removed after the check.

## License

PopNote is released under the [MIT License](LICENSE).

## Technique credits

The unique-title native-window lookup follows the approach credited to
**Desktop Sticky Notes** (MIT). The remote entry-point fallback
follows the approach credited to **Quick Tray** (MIT). The implementations here
were written for this spike; their upstream sources were not fetched or copied.
