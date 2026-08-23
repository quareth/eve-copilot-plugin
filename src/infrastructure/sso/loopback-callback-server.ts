import { createServer, type Server, type ServerResponse } from 'node:http';
import type {
  AuthorizationCallbackHandler,
  AuthorizationCallbackListener,
} from '../../application/ports/authorization-callback-listener.js';
import { AppError, throwIfAborted } from '../../domain/errors.js';
import type { CoordinationLeaseRepository } from '../../application/ports/coordination-lease-repository.js';
import type { Clock } from '../../application/ports/clock.js';

const SUCCESS_HTML = '<!doctype html><meta charset="utf-8"><title>EVE Copilot MCP</title><p>Character authorization completed. You can close this window.</p>';
const FAILURE_HTML = '<!doctype html><meta charset="utf-8"><title>EVE Copilot MCP</title><p>Character authorization could not be completed. Return to your assistant for a safe next step.</p>';

export class LoopbackCallbackServer implements AuthorizationCallbackListener {
  readonly #url: URL;
  readonly #handler: AuthorizationCallbackHandler;
  readonly #coordination: CoordinationLeaseRepository | null;
  readonly #clock: Clock | null;
  readonly #ownerId: string | null;
  readonly #leaseKey: string;
  #server: Server | null = null;
  #startPromise: Promise<void> | null = null;
  #renewal: NodeJS.Timeout | null = null;
  #abortSignal: AbortSignal | null = null;
  #abortHandler: (() => void) | null = null;

  constructor(input: {
    readonly redirectUri: string;
    readonly handler: AuthorizationCallbackHandler;
    readonly coordination?: CoordinationLeaseRepository;
    readonly clock?: Clock;
    readonly ownerId?: string;
  }) {
    this.#url = new URL(input.redirectUri);
    this.#handler = input.handler;
    this.#coordination = input.coordination ?? null;
    this.#clock = input.clock ?? null;
    this.#ownerId = input.ownerId ?? null;
    this.#leaseKey = `oauth-callback:${this.#url.host}`;
    if ((this.#coordination === null) !== (this.#clock === null)
      || (this.#coordination === null) !== (this.#ownerId === null)) {
      throw new TypeError('Callback lease dependencies must be configured together.');
    }
  }

  ensureListening(signal: AbortSignal): Promise<void> {
    throwIfAborted(signal);
    if (this.#server?.listening === true) return Promise.resolve();
    this.#startPromise ??= this.#start(signal);
    return this.#startPromise;
  }

  close(): Promise<void> {
    const server = this.#server;
    this.#server = null;
    this.#startPromise = null;
    if (this.#renewal !== null) clearInterval(this.#renewal);
    this.#renewal = null;
    if (this.#abortSignal !== null && this.#abortHandler !== null) {
      this.#abortSignal.removeEventListener('abort', this.#abortHandler);
    }
    this.#abortSignal = null;
    this.#abortHandler = null;
    if (server?.listening !== true) {
      this.#releaseLease();
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      server.close((error) => {
        this.#releaseLease();
        if (error === undefined) resolve();
        else reject(error);
      });
    });
  }

  #start(signal: AbortSignal): Promise<void> {
    if (!this.#acquireLease()) {
      return Promise.reject(new AppError({
        code: 'AUTHORIZATION_CALLBACK_UNAVAILABLE',
        safeMessage: 'Another server process owns the local EVE authorization callback.',
        details: { next_step: 'Close the other server process or retry after its callback lease expires.' },
      }));
    }
    return new Promise((resolve, reject) => {
      const server = createServer({ maxHeaderSize: 8_192 }, (request, response) => {
        void this.#handle(request.method ?? '', request.headers.host ?? '', request.url ?? '', response);
      });
      this.#server = server;
      const abort = (): void => { void this.close(); };
      this.#abortSignal = signal;
      this.#abortHandler = abort;
      signal.addEventListener('abort', abort, { once: true });
      server.once('error', (error) => {
        signal.removeEventListener('abort', abort);
        this.#startPromise = null;
        this.#server = null;
        this.#releaseLease();
        reject(new AppError({
          code: 'AUTHORIZATION_CALLBACK_UNAVAILABLE',
          safeMessage: 'The local EVE authorization callback could not be started.',
          details: { next_step: 'Close another process using the configured callback port, then retry.' },
          cause: error,
        }));
      });
      server.listen({
        host: '127.0.0.1',
        port: Number(this.#url.port),
        exclusive: true,
      }, () => {
        server.removeAllListeners('error');
        server.on('error', () => { void this.close(); });
        this.#startRenewal();
        resolve();
      });
    });
  }

  #releaseLease(): void {
    if (this.#coordination !== null && this.#ownerId !== null) {
      this.#coordination.release(this.#leaseKey, this.#ownerId);
    }
  }

  #acquireLease(): boolean {
    if (this.#coordination === null || this.#clock === null || this.#ownerId === null) return true;
    const now = this.#clock.now();
    return this.#coordination.acquire(
      this.#leaseKey,
      this.#ownerId,
      now.toISOString(),
      new Date(now.getTime() + 15_000).toISOString(),
    ) !== null;
  }

  #startRenewal(): void {
    if (this.#coordination === null || this.#clock === null || this.#ownerId === null) return;
    this.#renewal = setInterval(() => {
      const now = this.#clock?.now();
      if (now === undefined || this.#coordination === null || this.#ownerId === null) return;
      const renewed = this.#coordination.renew(
        this.#leaseKey,
        this.#ownerId,
        new Date(now.getTime() + 15_000).toISOString(),
      );
      if (!renewed) void this.close();
    }, 5_000);
    this.#renewal.unref();
  }

  async #handle(method: string, host: string, requestTarget: string, response: ServerResponse): Promise<void> {
    response.setHeader('content-type', 'text/html; charset=utf-8');
    response.setHeader('cache-control', 'no-store');
    response.setHeader('x-content-type-options', 'nosniff');
    if (method !== 'GET' || host !== this.#url.host || requestTarget.length > 4_096) {
      respond(response, 400, FAILURE_HTML);
      return;
    }
    let callback: URL;
    try {
      callback = new URL(requestTarget, this.#url.origin);
    } catch {
      respond(response, 400, FAILURE_HTML);
      return;
    }
    if (callback.pathname !== this.#url.pathname) {
      respond(response, 404, FAILURE_HTML);
      return;
    }
    const states = callback.searchParams.getAll('state');
    const codes = callback.searchParams.getAll('code');
    const errors = callback.searchParams.getAll('error');
    if (states.length !== 1 || states[0] === undefined || !bounded(states[0])
      || codes.length > 1 || errors.length > 1 || (codes.length === 1) === (errors.length === 1)) {
      respond(response, 400, FAILURE_HTML);
      return;
    }
    const code = codes[0] ?? null;
    const providerError = errors[0] ?? null;
    if ((code !== null && !bounded(code)) || (providerError !== null && !bounded(providerError))) {
      respond(response, 400, FAILURE_HTML);
      return;
    }
    try {
      await this.#handler({ state: states[0], code, providerError });
      respond(response, 200, SUCCESS_HTML);
    } catch {
      respond(response, 400, FAILURE_HTML);
    }
  }
}

function bounded(value: string): boolean {
  return value.length >= 1 && value.length <= 2_048;
}

function respond(response: ServerResponse, status: number, body: string): void {
  response.statusCode = status;
  response.end(body);
}
