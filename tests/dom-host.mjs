// Small host double for DOM events/focus only. It does not measure CSS or native dragging.
export function domHost(onListen = () => {}) {
  const targets = [];
  class Target {
    listeners = new Map();
    constructor() { targets.push(this); }
    addEventListener(type, fn, options) {
      const entries = this.listeners.get(type) ?? [];
      entries.push({ fn, capture: options === true || options?.capture === true });
      this.listeners.set(type, entries); onListen(this, type, fn);
    }
    removeEventListener(type, fn) {
      this.listeners.set(type, (this.listeners.get(type) ?? []).filter(entry => entry.fn !== fn));
    }
  }
  const document = new Target(), window = new Target();
  document.defaultView = window; window.document = document; window.closed = false;
  document.activeElement = null; document.focused = true; document.hasFocus = () => document.focused;
  class Element extends Target {
    constructor(tag, owner) {
      super(); this.tagName = tag.toUpperCase(); this.ownerDocument = owner;
      this.children = []; this.attributes = new Map(); this.className = ""; this.textContent = "";
      this.hidden = false; this.disabled = false; this.value = ""; this.style = {};
      this.classList = {
        contains: name => this.className.split(/\s+/).includes(name),
        add: name => { if (!this.classList.contains(name)) this.className = `${this.className} ${name}`.trim(); },
        remove: name => { this.className = this.className.split(/\s+/).filter(value => value !== name).join(" "); },
      };
    }
    get isConnected() { return this.connected !== false && (!!this.parentNode?.isConnected || this.parentNode === document); }
    set isConnected(value) { this.connected = value; }
    get parentElement() { return this.parentNode instanceof Element ? this.parentNode : null; }
    append(...children) { for (const child of children) { child.remove(); child.parentNode = this; this.children.push(child); } }
    insertBefore(child, reference) {
      child.remove();
      child.parentNode = this;
      this.children.splice(this.children.indexOf(reference), 0, child);
    }
    prepend(child) { child.remove(); child.parentNode = this; this.children.unshift(child); }
    remove() {
      if (this.parentNode?.children) this.parentNode.children = this.parentNode.children.filter(child => child !== this);
      this.parentNode = null;
      if (this.contains(this.ownerDocument.activeElement)) this.ownerDocument.activeElement = this.ownerDocument.body;
    }
    contains(target) { for (let node = target; node; node = node.parentNode) if (node === this) return true; return false; }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    focus() {
      for (let node = this; node; node = node.parentNode) if (node.hidden || node.disabled) return;
      if (!this.isConnected) return;
      const previous = this.ownerDocument.activeElement;
      if (previous === this) return;
      if (previous) fire(previous, "focusout", { relatedTarget: this });
      this.ownerDocument.activeElement = this;
      fire(this, "focusin", { relatedTarget: previous });
    }
    blur() {
      if (this.ownerDocument.activeElement !== this) return;
      this.ownerDocument.activeElement = this.ownerDocument.body;
      fire(this, "focusout", { relatedTarget: this.ownerDocument.body });
    }
  }
  document.createElement = tag => new Element(tag, document);
  document.body = document.createElement("body"); document.body.parentNode = document;
  document.activeElement = document.body;
  function fire(target, type, init = {}) {
    const event = { type, target, relatedTarget: null, button: 0, pointerId: 1, defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; },
      stopImmediatePropagation() { this.stopped = true; }, ...init };
    const path = [];
    for (let node = target; node; node = node.parentNode) path.push(node);
    if (!path.includes(document) && target !== window && target.isConnected) path.push(document);
    if (path.includes(document)) path.push(window);
    for (const node of [...path].reverse()) for (const entry of [...(node.listeners.get(type) ?? [])]) {
      if (entry.capture && !event.stopped) entry.fn(event);
    }
    for (const node of path) for (const entry of [...(node.listeners.get(type) ?? [])]) {
      if (!entry.capture && !event.stopped) entry.fn(event);
    }
    return event;
  }
  const all = root => [root, ...root.children.flatMap(all)];
  return { document, window, fire, all,
    label: (root, label) => all(root).find(element => element.getAttribute("aria-label") === label),
    listenerCount: () => targets.reduce((count, target) => count + [...target.listeners.values()].reduce((n, entries) => n + entries.length, 0), 0),
  };
}
