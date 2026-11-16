/** Optional console log of lifecycle events. Off unless "Debug logging" is on in settings; it never stores anything. */
export class RestartTrace {
  enabled = false;
  private session = globalThis.crypto.randomUUID();

  constructor(private vault: string) {}

  record(event: string, details: Record<string, unknown> = {}): void {
    if (!this.enabled) return;
    console.info(`[PopNote restart] ${JSON.stringify({
      time: new Date().toISOString(), session: this.session, vault: this.vault, event, ...details,
    })}`);
  }
}
