// Prints whether PopNote's global shortcut is registered and whether another registration is in the way.
// Run ONLY in a disposable test vault. Then press the shortcut by hand three times and watch the window
// hide, show, hide (same window each time).
(async () => {
  const p = app.plugins.plugins.popnote, gs = require("electron").remote.globalShortcut;
  const key = p.currentShortcut();
  return JSON.stringify({ shortcut: key, registeredBySomeone: gs.isRegistered(key), ownedByPopNote: p.shortcutActive,
    open: p.popout.isOpen(), windowId: p.native.window?.id ?? null });
})()
