type OverlayActions = {
  allowed: () => boolean;
  pin: (value: boolean) => boolean;
  opacity: (value: number) => boolean;
};

/** Owns only its controls and DOM listeners; native behavior stays in native.ts. */
export class OverlayControls {
  private document: Document;
  private recovery: HTMLButtonElement;
  private bar: HTMLElement;
  private title: HTMLElement;
  private pinButton: HTMLButtonElement;
  private opacityButton: HTMLButtonElement;
  private panel: HTMLElement;
  private range: HTMLInputElement;
  private output: HTMLElement;
  private disposed = false;
  private expanded = false;
  private panelOpen = false;
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
    this.pinButton.disabled = true;
    this.range.disabled = true;
    this.updateValues();

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
      if (this.panelOpen) {
        this.panelOpen = false;
        this.render();
        this.opacityButton.focus();
      } else {
        this.setExpanded(false);
        const target = this.returnFocus;
        if (target?.isConnected && target.ownerDocument === this.document) target.focus();
        else this.recovery.focus();
      }
    });
    this.listen(this.opacityButton, "click", () => {
      this.panelOpen = !this.panelOpen;
      this.render();
      if (this.panelOpen) this.range.focus();
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
          this.panelOpen = false;
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

  private updateValues(): void {
    const percent = `${Math.round(this.opacity * 100)}%`;
    if (Number(this.range.value) !== this.opacity) this.range.value = String(this.opacity);
    this.range.setAttribute("aria-valuetext", `${Math.round(this.opacity * 100)} percent`);
    this.opacityButton.disabled = this.range.disabled;
    this.opacityButton.textContent = this.range.disabled ? "Opacity" : percent;
    this.opacityButton.title = this.range.disabled ? "Opacity unavailable" : "Window opacity";
    this.output.textContent = percent;
    this.pinButton.setAttribute("aria-pressed", String(this.pinned));
    this.pinButton.title = this.pinButton.disabled ? "Pin unavailable" : "Keep PopNote on top";
    this.range.title = this.range.disabled ? "Opacity unavailable" : "Window opacity";
  }

  private render(): void {
    this.bar.hidden = !this.expanded;
    this.panel.hidden = !this.panelOpen;
    this.recovery.setAttribute("aria-expanded", String(this.expanded));
    this.opacityButton.setAttribute("aria-expanded", String(this.panelOpen));
  }

  private setExpanded(expanded: boolean): void {
    this.expanded = expanded;
    if (!expanded) this.panelOpen = false;
    this.render();
  }

  setNote(note: string): void {
    this.title.textContent = note;
    this.title.title = note;
  }

  setNativeAvailability(pin: boolean, opacity: boolean): void {
    if (!this.allowed()) return;
    this.pinButton.disabled = !pin;
    this.range.disabled = !opacity;
    this.updateValues();
  }

  recover(focus = false): void {
    if (!this.allowed()) return;
    this.rememberFocus(this.document.activeElement);
    this.setExpanded(true);
    if (focus && this.document.hasFocus()) this.recovery.focus();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const remove of this.cleanup.splice(0)) remove();
    this.root.remove();
  }
}
