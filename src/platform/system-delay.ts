import type { Delay } from '../application/ports/delay.js';
import { AppError, throwIfAborted } from '../domain/errors.js';

export class SystemDelay implements Delay {
  async wait(milliseconds: number, signal: AbortSignal): Promise<void> {
    throwIfAborted(signal);
    try {
      await new Promise<void>((resolve, reject) => {
        const finish = (): void => {
          signal.removeEventListener('abort', abort);
          resolve();
        };
        const timeout = setTimeout(finish, milliseconds);
        const abort = (): void => {
          clearTimeout(timeout);
          signal.removeEventListener('abort', abort);
          reject(new AppError({ code: 'CANCELLED', safeMessage: 'The request was cancelled.' }));
        };
        signal.addEventListener('abort', abort, { once: true });
        timeout.unref();
      });
    } finally {
      throwIfAborted(signal);
    }
  }
}
