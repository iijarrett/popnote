// Live check of the tray icon and its menu. Run ONLY in a disposable test vault (see scenario.js for how to run).
// It turns the tray on, prints the menu PopNote builds, calls the same handlers a click and the menu entries run,
// then turns the tray off. A real click or right-click on the icon still has to be done by hand.
(async () => {
  const p = app.plugins.plugins.popnote, sleep = ms => new Promise(r => setTimeout(r, ms)), r = {};
  const label = i => i === "separator" ? "-" : i.label + (i.checked !== undefined ? (i.checked ? " [x]" : " [ ]") : "") + (i.submenu ? " > " + i.submenu.map(label).join(" | ") : "");
  r.created = p.setTray(true); await sleep(700);
  const tray = p.native.trayIcon;
  r.hasIcon = !!tray; r.bounds = tray?.getBounds?.();
  r.menu = p.trayItems().map(label);
  await p.toggle("tray"); await sleep(500); r.afterFirstClick = { open: p.popout.isOpen(), visible: p.native.window?.isVisible() };
  await p.toggle("tray"); await sleep(500); r.afterSecondClick = { visible: p.native.window?.isVisible() };
  p.setTray(false); await sleep(400); r.afterOff = !!p.native.trayIcon;
  return JSON.stringify(r);
})()
