/** Temporary, local-only restart trace. It never opens or changes a window. */
export class RestartTrace {
  private session = globalThis.crypto.randomUUID();
  private storageFailed = false;

  constructor(private vault: string, private getStorage: () => Storage | undefined) {}

  record(event: string, details: Record<string, unknown> = {}): void {
    const line = `[PopNote restart] ${JSON.stringify({
      time: new Date().toISOString(), session: this.session, vault: this.vault, event, ...details,
    })}`;
    console.info(line);
    if (this.storageFailed) return;
    try {
      const storage = this.getStorage();
      if (!storage) throw new Error("local storage unavailable");
      const key = `popnote-spike-restart-trace:${this.vault}`;
      let history: unknown;
      try { history = JSON.parse(storage.getItem(key) ?? "[]"); } catch { history = []; }
      const lines = Array.isArray(history) ? history.filter((entry) => typeof entry === "string").slice(-199) : [];
      lines.push(line);
      storage.setItem(key, JSON.stringify(lines));
    } catch {
      this.storageFailed = true;
      console.warn("[PopNote restart] Trace history unavailable; copy console output before closing Obsidian.");
    }
  }
}
