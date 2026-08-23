import type { LeaseHeartbeat } from '../application/ports/lease-heartbeat.js';

export class SystemLeaseHeartbeat implements LeaseHeartbeat {
  start(input: {
    readonly intervalMs: number;
    readonly signal: AbortSignal;
    readonly beat: () => void;
  }): () => void {
    const interval = setInterval(input.beat, input.intervalMs);
    interval.unref();
    const stop = (): void => {
      clearInterval(interval);
      input.signal.removeEventListener('abort', stop);
    };
    input.signal.addEventListener('abort', stop, { once: true });
    return stop;
  }
}
