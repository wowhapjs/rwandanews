export interface RetryOptions { attempts?: number; baseDelayMs?: number; signal?: AbortSignal; }
export async function withRetry<T>(operation: (attempt: number) => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const attempts = Math.max(1, Math.min(options.attempts ?? 3, 5));
  const base = Math.max(50, options.baseDelayMs ?? 350);
  let last: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (options.signal?.aborted) throw new Error('Operation aborted');
    try { return await operation(attempt); } catch (error) { last = error; if (attempt === attempts) break; await new Promise<void>((resolve, reject) => { const timer = setTimeout(resolve, base * 2 ** (attempt - 1)); options.signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('Operation aborted')); }, { once: true }); }); }
  }
  throw last;
}
