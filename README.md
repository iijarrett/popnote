# PopNote

PopNote gives an Obsidian note its own floating desktop window. Use a global
shortcut to show or hide it, pin it above other apps, and adjust its opacity.

This is a development preview. It requires Obsidian 1.15.0 or newer.
Windows has partial live validation on 1.15.0. macOS and Linux validation
are pending.

## Try the development build

1. Follow [Build](#build) and load the plugin in a disposable vault.
2. Enable **PopNote** under **Settings → Community plugins**.
3. Open a note and run **PopNote: Prepare spike from current note** once.
4. On Windows, press **Ctrl+Alt+P** to summon or hide the pop-out. Use the
   **⋯** button to reveal Pin and opacity.

## Current state

Milestone 2 Stage 1 is implemented with the narrow-window, close-button and
new-tab fixes. The build and all 81 automated checks passed. On Windows with
Obsidian 1.15.0, the controls and slider left the note title visible at 639 px,
the standard window X closed PopNote cleanly, and + and Ctrl+T kept the
dedicated window at its saved 70% opacity. On a full restart with two PopNote
tabs open, the ordinary pop-out restored and PopNote stayed closed until the
shortcut summoned it. The scoped results and remaining checks are below.

The three pinned packages resolved and the lockfile was reviewed. Dependency
installation with scripts disabled and `npm run build` succeeded. The first
sandboxed build was blocked by `spawn EPERM`; the approved retry outside the
sandbox passed type checking and generated the initial `main.js`.
The exclusive-window guard was built on 2026-11-06: `npm run build` and all
64 automated tests passed. Owner GUI checks now pass mixed-tab release and
movement into the main window and another ordinary pop-out, within the limits
recorded below. Disable/re-enable after release and full restart with released
content passed on 2026-11-07. Native pinning and the remaining validation checks
are still pending. The earlier controlled restart observations apply to the
preceding build.
Windows GUI validation is partial: the owner reported the controlled Obsidian
1.15.0 restart and disable/re-enable results below on 2026-11-06. Other GUI
checks remain pending. Do not use a real vault. This remains a spike, not v0.1.
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
Obsidian 1.15.0 archive using host doubles; they never run the full application.
On Windows the default is `%APPDATA%/obsidian/obsidian-1.15.0.asar`. Set
`POPNOTE_OBSIDIAN_ASAR` to that archive's location on other setups. The archive
is not included in this repository. Automated passes do not establish GUI or
cross-platform support.

Use a disposable test vault only. Load the built `main.js`, `manifest.json`
and `styles.css` from `<test-vault>/.obsidian/plugins/popnote/` by copying them
or linking the project folder. Local settings (`data.json`), vault content,
logs, build output and personal planning/instruction files are excluded from Git.

## Local diagnostics

PopNote saves its settings in the vault's plugin data. Recent startup and window
diagnostics, which may include vault-relative note paths, are stored in Obsidian's
local storage for troubleshooting. The plugin makes no network requests.

## GUI coverage and result record

Run Windows first, macOS second, then available Linux setups. Windows has the
limited owner-reported passes below; all other targets remain **unverified**.
Add a separate result row for each actual machine, desktop session and Obsidian
package. A build pass is not a GUI pass.

| Order | Target | Architecture | GUI status |
|---|---|---|---|
| 1 | Windows | Not recorded for reported run | Partial: Obsidian 1.15.0, test_vault; see controlled results below |
| 2 | macOS | ARM64 | Pending (unverified; machine availability to confirm) |
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
2. Create and open a disposable note. Run **PopNote: Prepare spike from current
   note** from the command palette. This captures the note without opening a
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
5. Turn **Pin (spike)** on and click another app: expect PopNote to remain above
   it. Turn pin off: expect ordinary stacking. This differs from desktop pinning.
6. Deferred opacity sweep: 100%, 60%, 30%, then back to 100%, checking that the
   whole window and text fade. Do not run this during the current ownership
   follow-up; leave opacity at 40%.
7. Manually restore Obsidian to open Settings -> PopNote. Enter **Super+Q** and
   click **Apply**. Minimize Obsidian again and test **Win+Q**. Registration
   success and actual behavior are separate results. If refused, try another
   combination; Apply unregisters only PopNote's previous shortcut. A refused
   replacement leaves no active shortcut until another Apply succeeds.
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
also writes a notice and `[PopNote spike]` line in the developer console
(Ctrl+Shift+I on Windows). Record both IDs, action, shortcut, Obsidian version
and OS version. If native lookup fails, the public pop-out remains available
via **PopNote: Toggle spike pop-out**; native features must not target the main
window. An API failure disables the affected feature for this plugin session.

## macOS follow-up - second (pending)

Use a separate Mac test vault with the same built files, never a real vault.
Repeat the Windows tests with **Command+Option+P**, skipping Win+Q and Task View.
The only OS differences are defaults: the shortcut and enabling all Spaces.
All Spaces is attempted once per created window. Test switching Spaces while
visible and hidden, full-screen Spaces separately, and any Dock/window flicker.
Repeat native ID reuse/replacement, pin, opacity, minimized main-window behavior
and plugin-disable cleanup. Record limitations; none of this is GUI-verified.

## Linux follow-up - after Windows and macOS (pending)

Use a separate Linux test vault and copy the same built plugin files. Repeat
the following on **X11 x64, X11 ARM64, Wayland x64 and Wayland ARM64** as test
machines and packages become available. Record the distro, session, desktop
environment/compositor and exact Obsidian package using the record above. No
Linux setup or community port has been GUI-verified.

1. **Public pop-out first:** enable PopNote, open a disposable note and run
   **PopNote: Prepare spike from current note**, then **PopNote: Toggle spike
   pop-out** from Obsidian's command palette. Expect that note in a separate
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
4. **Always-on-top:** turn **Pin (spike)** on, focus another app and observe
   whether PopNote stays above it. Turn pin off and check normal stacking.
   Record ignored behavior, unavailable controls and Notices separately.
5. **Opacity:** test 100%, 60%, 30%, then restore 100%. Expect the whole window
   and text to fade. Record actual behavior even if the API reports success.
6. **Fallback after each unavailable native feature:** close the pop-out
   manually, manually restore Obsidian and run **PopNote: Toggle spike pop-out**
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
The installed-method checks read `obsidian-1.15.0.asar` locally, extract selected
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
the 80-100% / 1% step / 90% default opacity change remain deferred. v0.1 stays on hold.

## Milestone 2 Stage 1 - compact controls and tab behavior

- The controls occupy a slim row above the note, with a stable height when
  hidden, revealed, or showing the inline opacity slider. Hover the row or
  use **Show PopNote controls** (`⋯`) to reveal the drag handle, active tab
  label, Pin and opacity. Obsidian provides the window close button.
- The opacity slider uses 30–100% in 10% steps. The test vault's saved value
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

**Windows hover-reveal result reported 2026-11-07 — pass in test_vault.**

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

**First Windows scenario: hover reveal and note stability (passed; steps retained).**

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

## Technique credits

The unique-title native-window lookup follows the approach credited to
**Desktop Sticky Notes** (MIT). The remote entry-point fallback
follows the approach credited to **Quick Tray** (MIT). The implementations here
were written for this spike; their upstream sources were not fetched or copied.
