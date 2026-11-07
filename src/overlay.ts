type OverlayActions = {
  allowed: () => boolean;
  pin: (value: boolean) => boolean;
  opacity: (value: number) => boolean;
  close: () => void;
};

/** Owns only its controls and DOM listeners; native behavior stays in native.ts. */
export class OverlayControls {
  private document: Document;
  private recovery: HTMLButtonElement;
  private bar: HTMLElement;
  private pinButton: HTMLButtonElement;
  private opacityButton: HTMLButtonElement;
  private panel: HTMLElement;
  private range: HTMLInputElement;
  private output: HTMLElement;
  private disposed = false;
  private hover = false;
  private focused = false;
  private manual = false;
  private panelOpen = false;
  private moving = false;
  private motionQuiet = false;
  private pointers = new Set<number>();
  private returnFocus: HTMLElement | null = null;
  private motionTimer?: ReturnType<typeof setTimeout>;
  private cleanup: Array<() => void> = [];

  constructor(private root: HTMLElement, note: string, private pinned: boolean,
    private opacity: number, private actions: OverlayActions) {
    this.document = root.ownerDocument;
    const id = `popnote-controls-${globalThis.crypto.randomUUID()}`;
    const trigger = this.element("div", "popnote-overlay-trigger", root);
    trigger.setAttribute("aria-hidden", "true");
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
    const title = this.element("span", "popnote-overlay-note", this.bar);
    title.textContent = note;
    title.title = note;
    this.pinButton = this.button("Pin", "Keep PopNote on top", this.bar);
    this.opacityButton = this.button("", "Window opacity", this.bar);
    const close = this.button("×", "Close PopNote", this.bar);
    this.panel = this.element("div", "popnote-overlay-panel", root);
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
    this.range.step = "0.1";
    this.range.setAttribute("aria-label", "Opacity");
    label.htmlFor = this.range.id;
    this.output = this.element("output", "popnote-overlay-value", this.panel);
    this.pinButton.disabled = true;
    this.range.disabled = true;
    this.updateValues();

    this.listen(trigger, "pointerenter", () => {
      this.rememberFocus(this.document.activeElement);
      this.hover = true;
      this.render();
    });
    this.listen(this.recovery, "click", () => this.recover());
    this.listen(root, "focusin", (event) => {
      this.rememberFocus((event as FocusEvent).relatedTarget);
      this.focused = true;
      this.render();
    });
    this.listen(root, "focusout", (event) => {
      this.focused = root.contains((event as FocusEvent).relatedTarget as Node | null);
      if (!this.focused && !this.pointers.size) this.panelOpen = false;
      this.render();
    });
    this.listen(this.document, "pointermove", (event) => {
      // Native dragging suppresses client pointer events. A quiet move stream
      // alone cannot prove the user released the drag handle.
      if (this.motionQuiet) this.moving = false;
      this.hover = root.contains(event.target as Node | null);
      if (!this.hover) this.manual = false;
      this.render();
    }, true);
    this.listen(this.document, "pointerdown", (event) => {
      if (this.motionQuiet) this.moving = false;
      if (root.contains(event.target as Node | null)) {
        if ((event as PointerEvent).button === 0) this.pointers.add((event as PointerEvent).pointerId);
      } else {
        this.panelOpen = false;
        this.manual = false;
        this.hover = false;
      }
      this.render();
    }, true);
    const endPointer = (event: Event) => {
      this.pointers.delete((event as PointerEvent).pointerId);
      if (!this.focused && !this.hover) this.panelOpen = false;
      this.render();
    };
    if (this.document.defaultView) {
      this.listen(this.document.defaultView, "pointerup", endPointer, true);
      this.listen(this.document.defaultView, "pointercancel", endPointer, true);
      this.listen(this.document.defaultView, "blur", () => { this.pointers.clear(); this.render(); });
    }
    this.listen(root, "keydown", (event) => {
      if ((event as KeyboardEvent).key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      if (this.panelOpen) {
        this.panelOpen = false;
        this.render();
        this.opacityButton.focus();
      } else {
        this.hover = this.manual = this.focused = false;
        const target = this.returnFocus;
        if (target?.isConnected && target.ownerDocument === this.document) target.focus();
        else (this.document.activeElement as HTMLElement | null)?.blur?.();
        this.render();
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
        else this.range.disabled = true;
      }
      this.updateValues();
    });
    this.listen(close, "click", () => this.actions.close());
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
    this.range.value = String(this.opacity);
    this.range.setAttribute("aria-valuetext", `${Math.round(this.opacity * 100)} percent`);
    this.opacityButton.textContent = percent;
    this.output.textContent = percent;
    this.pinButton.setAttribute("aria-pressed", String(this.pinned));
    this.pinButton.title = this.pinButton.disabled ? "Pin unavailable" : "Keep PopNote on top";
    this.range.title = this.range.disabled ? "Opacity unavailable" : "Window opacity";
  }

  private render(): void {
    const visible = this.hover || this.focused || this.manual || this.panelOpen || this.moving || this.pointers.size > 0;
    this.bar.hidden = !visible;
    this.panel.hidden = !visible || !this.panelOpen;
    this.recovery.setAttribute("aria-expanded", String(visible));
    this.opacityButton.setAttribute("aria-expanded", String(this.panelOpen));
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
    this.manual = true;
    this.render();
    if (focus && this.document.hasFocus()) this.recovery.focus();
  }

  movement(): void {
    if (!this.allowed()) return;
    clearTimeout(this.motionTimer);
    this.moving = true;
    this.motionQuiet = false;
    this.render();
    this.motionTimer = setTimeout(() => {
      this.motionTimer = undefined;
      if (!this.allowed()) return;
      this.motionQuiet = true;
    }, 350);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    clearTimeout(this.motionTimer);
    this.pointers.clear();
    for (const remove of this.cleanup.splice(0)) remove();
    this.root.remove();
  }
}
