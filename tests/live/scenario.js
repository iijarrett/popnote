// Live check of the main PopNote behaviors in a running Obsidian. Run it ONLY in a disposable test vault:
//   obsidian vault=<test vault> eval "code=$(cat tests/live/scenario.js)"
// (the command is `Obsidian.com` on Windows; on macOS/Linux use the Obsidian command line after enabling it in Settings -> General).
// It adds two sample notes if missing, opens PopNote, uses the note picker, resizes the window, pins, changes opacity and
// hides/shows it, then prints one JSON line. Compare with the expectations in tests/live/README.md.
(async () => {
  const p = app.plugins.plugins.popnote, sleep = ms => new Promise(r => setTimeout(r, ms)), r = {};
  for (const [path, body] of [["Plans/Trip to Lisbon.md", "# Trip\n"], ["Journal/2026-11-16.md", "# Today\n"]]) {
    if (!app.vault.getAbstractFileByPath(path)) {
      const dir = path.split("/")[0];
      if (!app.vault.getAbstractFileByPath(dir)) await app.vault.createFolder(dir);
      await app.vault.create(path, body);
    }
  }
  await p.toggle("command");
  const w = p.native.window, o = p.overlay;
  r.opened = p.popout.isOpen(); r.bound = !!w; r.winId = w?.id; r.firstNote = p.popout.noteLabel();
  o.recovery.click(); o.noteButton.click();
  r.pickerOpen = !o.notePanel.hidden;
  const names = () => Array.from(o.results.querySelectorAll("button")).map(b => b.dataset.path);
  r.recent = names();
  const win = o.root.ownerDocument.defaultView;
  o.search.value = "trip"; o.search.dispatchEvent(new win.Event("input"));
  r.tripResults = names();
  o.results.querySelector("button").click();
  await sleep(1200);
  r.afterChoose = { note: p.popout.noteLabel(), saved: p.notePath, pickerClosed: o.notePanel.hidden, sameWindow: p.native.window?.id === r.winId };
  r.sizes = [];
  for (const width of [700, 500, 400, 340, 250]) {
    w.setSize(width, 320); await sleep(700);
    const rs = [o.noteButton, o.pinButton, o.opacityButton, o.recovery].map(e => { const q = e.getBoundingClientRect(); return [Math.round(q.left), Math.round(q.right)]; });
    const ov = (a, b) => a[1] > b[0] && b[1] > a[0];
    const sp = o.root.ownerDocument.querySelector(".workspace-tab-header-spacer");
    r.sizes.push({ asked: width, actual: w.getSize()[0], viewport: win.innerWidth,
      overlap: [ov(rs[0], rs[1]), ov(rs[1], rs[2]), ov(rs[2], rs[3])].some(Boolean),
      allInView: rs.every(q => q[0] >= 0 && q[1] <= win.innerWidth), spacer: sp ? Math.round(sp.getBoundingClientRect().width) : null });
  }
  o.noteButton.click(); await sleep(400);
  const pr = o.notePanel.getBoundingClientRect();
  r.panel = { left: Math.round(pr.left), right: Math.round(pr.right), top: Math.round(pr.top), bottom: Math.round(pr.bottom), vw: win.innerWidth, vh: win.innerHeight };
  o.noteButton.click();
  o.pinButton.click(); await sleep(400);
  r.pinned = { window: w.isAlwaysOnTop(), saved: p.pinned };
  o.pinButton.click(); await sleep(300); r.unpinned = !w.isAlwaysOnTop();
  o.opacityButton.click(); o.range.value = "0.6"; o.range.dispatchEvent(new win.Event("input")); await sleep(400);
  r.opacity = { window: w.getOpacity(), saved: p.opacity };
  o.range.value = "1"; o.range.dispatchEvent(new win.Event("input")); await sleep(300);
  await p.toggle("command"); r.hidden = !w.isVisible();
  await p.toggle("command"); r.shown = w.isVisible(); r.sameId = p.native.window?.id === r.winId;
  return JSON.stringify(r);
})()
