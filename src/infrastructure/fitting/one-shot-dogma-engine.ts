import { Worker } from 'node:worker_threads';
import type {
  FittingCalculationEngine,
  FittingEngineRequest,
  FittingEngineResponse,
} from '../../application/ports/fitting-calculation-engine.js';
import { AppError, throwIfAborted } from '../../domain/errors.js';

const WORKER_DEADLINE_MS = 20_000;

interface WorkerMessage {
  readonly ok: boolean;
  readonly value?: FittingEngineResponse;
  readonly error?: string;
}

export class OneShotDogmaEngine implements FittingCalculationEngine {
  async calculate(input: FittingEngineRequest, signal: AbortSignal): Promise<FittingEngineResponse> {
    throwIfAborted(signal);
    const runningTypeScript = import.meta.url.endsWith('.ts');
    const workerUrl = new URL(runningTypeScript ? './dogma-worker.ts' : './dogma-worker.js', import.meta.url);
    const worker = new Worker(workerUrl, {
      workerData: input,
      execArgv: runningTypeScript ? ['--import', 'tsx'] : [],
      resourceLimits: {
        maxOldGenerationSizeMb: 192,
        maxYoungGenerationSizeMb: 32,
        stackSizeMb: 4,
      },
    });
    const deadline = AbortSignal.timeout(WORKER_DEADLINE_MS);
    const workSignal = AbortSignal.any([signal, deadline]);
    try {
      const response = await new Promise<FittingEngineResponse>((resolve, reject) => {
        const onAbort = (): void => {
          reject(new AppError({
            code: signal.aborted ? 'CANCELLED' : 'UPSTREAM_SERVICE_FAILED',
            safeMessage: signal.aborted
              ? 'The fitting calculation was cancelled.'
              : 'The bounded fitting calculation timed out.',
          }));
        };
        workSignal.addEventListener('abort', onAbort, { once: true });
        worker.once('message', (message: WorkerMessage) => {
          workSignal.removeEventListener('abort', onAbort);
          if (!message.ok || message.value === undefined) {
            reject(new AppError({
              code: 'UPSTREAM_SERVICE_FAILED',
              safeMessage: 'The isolated fitting calculation failed safely.',
              cause: new Error(message.error ?? 'Unknown Dogma worker failure.'),
            }));
            return;
          }
          resolve(message.value);
        });
        worker.once('error', (error) => {
          workSignal.removeEventListener('abort', onAbort);
          reject(new AppError({
            code: 'UPSTREAM_SERVICE_FAILED',
            safeMessage: 'The isolated fitting worker could not complete.',
            cause: error,
          }));
        });
        worker.once('exit', (code) => {
          if (code !== 0) {
            workSignal.removeEventListener('abort', onAbort);
            reject(new AppError({
              code: 'UPSTREAM_SERVICE_FAILED',
              safeMessage: 'The isolated fitting worker exited before returning a result.',
              cause: new Error(`Worker exit code ${String(code)}.`),
            }));
          }
        });
      });
      assertResponse(response, input.fits.length);
      return response;
    } finally {
      await worker.terminate();
    }
  }
}

function assertResponse(response: FittingEngineResponse, expectedFits: number): void {
  if (!Number.isFinite(response.durationMs)
    || response.durationMs < 0
    || response.evaluations.length !== expectedFits) {
    throw new AppError({
      code: 'UPSTREAM_CONTRACT_MISMATCH',
      safeMessage: 'The fitting worker returned an invalid result contract.',
    });
  }
}
