export class SourceRateLimiter {
  private nextAllowedAt = 0;
  constructor(private readonly minIntervalMs = 750) {}
  async wait(signal?: AbortSignal): Promise<void> {
    const delay = Math.max(0, this.nextAllowedAt - Date.now());
    if (delay) await new Promise<void>((resolve, reject) => { const timer = setTimeout(resolve, delay); signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('Operation aborted')); }, { once: true }); });
    this.nextAllowedAt = Date.now() + this.minIntervalMs;
  }
}
