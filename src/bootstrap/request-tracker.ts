export class RequestTracker {
  #active = 0;
  readonly #idleWaiters = new Set<() => void>();

  get active(): number {
    return this.#active;
  }

  start(): () => void {
    this.#active += 1;
    let completed = false;
    return () => {
      if (completed) return;
      completed = true;
      this.#active -= 1;
      if (this.#active === 0) {
        for (const resolve of this.#idleWaiters) resolve();
        this.#idleWaiters.clear();
      }
    };
  }

  waitForIdle(timeoutMs: number): Promise<void> {
    if (this.#active === 0) return Promise.resolve();
    return new Promise((resolve) => {
      let settled = false;
      const finish = (): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        this.#idleWaiters.delete(finish);
        resolve();
      };
      const timeout = setTimeout(finish, timeoutMs);
      this.#idleWaiters.add(finish);
    });
  }
}
