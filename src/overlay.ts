type OverlayActions = {
  allowed: () => boolean;
  pin: (value: boolean) => boolean;
  opacity: (value: number) => boolean;
  /** Vault note paths matching what was typed, best first; an empty query returns recent notes. */
  notes: (query: string) => string[];
  /** Shows the note in the window. Resolves false if it could not. */
  choose: (path: string) => Promise<boolean>;
  /** Extra help for the Pin button, such as how to show the window on every desktop. */
  pinHint?: string;
};

/** Owns only its controls and DOM listeners; native behavior stays in native.ts. */
export class OverlayControls {
  private document: Document;
  private recovery: HTMLButtonElement;
  private bar: HTMLElement;
  private title: HTMLElement;
  private noteButton: HTMLButtonElement;
  private pinButton: HTMLButtonElement;
  private opacityButton: HTMLButtonElement;
  private panel: HTMLElement;
  private notePanel: HTMLElement;
  private search: HTMLInputElement;
  private results: HTMLElement;
  private range: HTMLInputElement;
  private output: HTMLElement;
  private disposed = false;
  private expanded = false;
  private panelOpen = false;
  private notesOpen = false;
  private returnFocus: HTMLElement | null = null;
  private cleanup: Array<() => void> = [];

  constructor(private root: HTMLElement, note: string, private pinned: boolean,
    private opacity: number, private actions: OverlayActions) {
    this.document = root.ownerDocument;
    const id = `popnote-controls-${globalThis.crypto.randomUUID()}`;
    this.recovery = this.button("⋯", "Show PopNote controls", root);
    this.recovery.className = "popnote-overlay-recovery";
    this.recovery.setAttribute("aria-controls", id);
    this.bar = this.element("div", "popnote-overlay-bar", root);
    this.bar.id = id;
    this.bar.setAttribute("role", "group");
    this.bar.setAttribute("aria-label", "PopNote controls");
    const drag = this.element("div", "popnote-overlay-drag", this.bar);
    drag.textContent = "⠿";
    drag.title = "Drag to move window. The standard title bar remains available.";
    drag.setAttribute("aria-hidden", "true");
    this.title = this.element("span", "popnote-overlay-note", this.bar);
    this.noteButton = this.button("Note", "Choose the note to show", this.bar);
    this.setNote(note);
    this.pinButton = this.button("Pin", "Keep PopNote on top", this.bar);
    this.opacityButton = this.button("", "Window opacity", this.bar);
    this.panel = this.element("div", "popnote-overlay-panel", this.bar);
    this.panel.id = `${id}-opacity`;
    this.panel.setAttribute("role", "group");
    this.panel.setAttribute("aria-label", "Window opacity controls");
    this.opacityButton.setAttribute("aria-controls", this.panel.id);
    const label = this.element("label", "popnote-overlay-label", this.panel);
    label.textContent = "Opacity";
    this.range = this.element("input", "popnote-overlay-range", this.panel);
    this.range.id = `${id}-range`;
    this.range.type = "range";
    this.range.min = "0.3";
    this.range.max = "1";
    this.range.step = "0.01";
    this.range.setAttribute("aria-label", "Opacity");
    label.htmlFor = this.range.id;
    this.output = this.element("output", "popnote-overlay-value", this.panel);
    this.notePanel = this.element("div", "popnote-overlay-panel popnote-overlay-notes", this.bar);
    this.notePanel.id = `${id}-notes`;
    this.notePanel.setAttribute("role", "group");
    this.notePanel.setAttribute("aria-label", "Choose note");
    this.noteButton.setAttribute("aria-controls", this.notePanel.id);
    this.search = this.element("input", "popnote-overlay-search", this.notePanel);
    this.search.type = "search";
    this.search.placeholder = "Find a note";
    this.search.setAttribute("aria-label", "Find a note");
    this.results = this.element("div", "popnote-overlay-results", this.notePanel);
    this.results.setAttribute("role", "listbox");
    this.pinButton.disabled = true;
    this.range.disabled = true;
    this.updateValues();

    // The three-dots button shows a focus ring only for real keyboard use (Tab, or the Show controls command), never when
    // focus lands on it by itself after the window is shown again.
    this.listen(this.document, "keydown", (event) => {
      if ((event as KeyboardEvent).key === "Tab") root.classList.add("popnote-keyboard");
    }, true);
    this.listen(this.document, "pointerdown", () => root.classList.remove("popnote-keyboard"), true);
    this.listen(this.recovery, "click", () => {
      if (this.expanded) this.setExpanded(false);
      else this.recover();
    });
    this.listen(root, "focusin", (event) => {
      this.rememberFocus((event as FocusEvent).relatedTarget);
    });
    this.listen(this.document, "pointerdown", (event) => {
      if (this.expanded && !root.contains(event.target as Node | null)) this.setExpanded(false);
    }, true);
    this.listen(root, "keydown", (event) => {
      if ((event as KeyboardEvent).key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      if (this.panelOpen || this.notesOpen) {
        const note = this.notesOpen;
        this.panelOpen = this.notesOpen = false;
        this.render();
        (note ? this.noteButton : this.opacityButton).focus();
      } else {
        this.setExpanded(false);
        const target = this.returnFocus;
        if (target?.isConnected && target.ownerDocument === this.document) target.focus();
        else this.recovery.focus();
      }
    });
    this.listen(this.opacityButton, "click", () => {
      this.panelOpen = !this.panelOpen;
      this.notesOpen = false;
      this.render();
      if (this.panelOpen) this.range.focus();
    });
    this.listen(this.noteButton, "click", () => {
      this.notesOpen = !this.notesOpen;
      this.panelOpen = false;
      if (this.notesOpen) {
        this.search.value = "";
        this.showResults();
      }
      this.render();
      if (this.notesOpen) this.search.focus();
    });
    this.listen(this.search, "input", () => this.showResults());
    this.listen(this.search, "keydown", (event) => {
      const key = (event as KeyboardEvent).key;
      if (key === "Enter") {
        event.preventDefault();
        const first = this.results.querySelector("button");
        if (first) void this.choose(first.dataset.path ?? "");
      } else if (key === "ArrowDown") {
        event.preventDefault();
        this.results.querySelector("button")?.focus();
      }
    });
    this.listen(this.results, "keydown", (event) => {
      const key = (event as KeyboardEvent).key;
      if (key !== "ArrowDown" && key !== "ArrowUp") return;
      event.preventDefault();
      const items = Array.from(this.results.querySelectorAll("button"));
      const next = items.indexOf(this.document.activeElement as HTMLButtonElement) + (key === "ArrowDown" ? 1 : -1);
      if (next < 0) this.search.focus();
      else items[Math.min(next, items.length - 1)]?.focus();
    });
    this.listen(this.results, "click", (event) => {
      const button = (event.target as Element | null)?.closest?.("button");
      if (button) void this.choose(button.dataset.path ?? "");
    });
    this.listen(this.pinButton, "click", () => {
      if (this.pinButton.disabled) return;
      if (this.actions.pin(!this.pinned)) this.pinned = !this.pinned;
      else this.pinButton.disabled = true;
      this.updateValues();
    });
    this.listen(this.range, "input", () => {
      if (this.range.disabled) return;
      const value = Number(this.range.value);
      if (Number.isFinite(value) && value >= 0.3 && value <= 1) {
        if (this.actions.opacity(value)) this.opacity = value;
        else {
          this.range.disabled = true;
          this.panelOpen = this.notesOpen = false;
          this.render();
          this.recovery.focus();
        }
      }
      this.updateValues();
    });
    this.render();
    this.allowed();
  }

  private element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent: HTMLElement): HTMLElementTagNameMap[K] {
    const element = this.document.createElement(tag);
    element.className = className;
    parent.append(element);
    return element;
  }

  private button(text: string, label: string, parent: HTMLElement): HTMLButtonElement {
    const button = this.element("button", "popnote-overlay-button", parent);
    button.type = "button";
    button.textContent = text;
    button.title = label;
    button.setAttribute("aria-label", label);
    return button;
  }

  private allowed(): boolean {
    if (this.disposed) return false;
    if (!this.actions.allowed()) { this.dispose(); return false; }
    return !this.disposed;
  }

  private listen(target: EventTarget, type: string, action: (event: Event) => void, capture = false): void {
    const listener = (event: Event) => { if (this.allowed()) action(event); };
    target.addEventListener(type, listener, capture);
    this.cleanup.push(() => target.removeEventListener(type, listener, capture));
  }

  private rememberFocus(target: EventTarget | null): void {
    const element = target as HTMLElement | null;
    if (element?.ownerDocument === this.document && typeof element.focus === "function" && !this.root.contains(element)) {
      this.returnFocus = element;
    }
  }

  private showResults(): void {
    this.results.replaceChildren();
    for (const path of this.actions.notes(this.search.value)) {
      const item = this.element("button", "popnote-overlay-result", this.results);
      item.type = "button";
      item.dataset.path = path;
      item.setAttribute("role", "option");
      item.title = path;
      item.textContent = path.replace(/\.md$/i, "");
    }
    if (!this.results.firstChild) {
      const empty = this.element("div", "popnote-overlay-empty", this.results);
      empty.textContent = "No matching notes";
    }
  }

  private async choose(path: string): Promise<void> {
    if (!path || !this.allowed()) return;
    let chosen = false;
    try { chosen = await this.actions.choose(path); } catch { chosen = false; }
    if (this.disposed || !chosen) return;
    this.notesOpen = false;
    this.render();
    this.noteButton.focus();
  }

  private updateValues(): void {
    const percent = `${Math.round(this.opacity * 100)}%`;
    if (Number(this.range.value) !== this.opacity) this.range.value = String(this.opacity);
    this.range.setAttribute("aria-valuetext", `${Math.round(this.opacity * 100)} percent`);
    this.opacityButton.disabled = this.range.disabled;
    this.opacityButton.textContent = this.range.disabled ? "Opacity" : percent;
    this.opacityButton.title = this.range.disabled ? "Opacity unavailable" : "Window opacity";
    this.output.textContent = percent;
    this.pinButton.setAttribute("aria-pressed", String(this.pinned));
    this.pinButton.title = this.pinButton.disabled ? "Pin unavailable"
      : ["Keep PopNote on top", this.actions.pinHint].filter(Boolean).join(". ");
    this.range.title = this.range.disabled ? "Opacity unavailable" : "Window opacity";
  }

  private render(): void {
    this.bar.hidden = !this.expanded;
    this.panel.hidden = !this.panelOpen;
    this.notePanel.hidden = !this.notesOpen;
    this.noteButton.setAttribute("aria-expanded", String(this.notesOpen));
    this.recovery.setAttribute("aria-expanded", String(this.expanded));
    this.opacityButton.setAttribute("aria-expanded", String(this.panelOpen));
  }

  private setExpanded(expanded: boolean): void {
    this.expanded = expanded;
    if (!expanded) this.panelOpen = this.notesOpen = false;
    this.render();
  }

  setNote(note: string): void {
    this.title.textContent = note;
    this.title.title = note;
    this.noteButton.title = `Showing ${note}. Choose another note`;
  }

  /** Opens the note picker or the opacity slider from outside the window, such as the tray menu. */
  openPanel(panel: "notes" | "opacity"): void {
    if (!this.allowed()) return;
    this.recover();
    this.notesOpen = panel === "notes";
    this.panelOpen = !this.notesOpen;
    if (this.notesOpen) {
      this.search.value = "";
      this.showResults();
    }
    this.render();
    const focus = () => {
      if (this.disposed) return;
      if (panel === "notes" ? this.notesOpen : this.panelOpen) (panel === "notes" ? this.search : this.range).focus();
    };
    focus();
    // Obsidian hands focus to the note editor just after a window opens; take it back.
    this.document.defaultView?.setTimeout?.(focus, 150);
  }

  /** The tray changed pin or opacity: show the new values. */
  sync(pinned: boolean, opacity: number): void {
    if (!this.allowed()) return;
    this.pinned = pinned;
    this.opacity = opacity;
    this.updateValues();
  }

  setNativeAvailability(pin: boolean, opacity: boolean): void {
    if (!this.allowed()) return;
    this.pinButton.disabled = !pin;
    this.range.disabled = !opacity;
    this.updateValues();
  }

  /** True while the note picker or the opacity slider is open, so the window should not take focus away from it. */
  hasOpenPanel(): boolean { return this.panelOpen || this.notesOpen; }

  recover(focus = false): void {
    if (!this.allowed()) return;
    this.rememberFocus(this.document.activeElement);
    this.setExpanded(true);
    if (focus && this.document.hasFocus()) { this.root.classList.add("popnote-keyboard"); this.recovery.focus(); }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const remove of this.cleanup.splice(0)) remove();
    this.root.remove();
  }
}
