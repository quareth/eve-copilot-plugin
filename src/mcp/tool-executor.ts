import {
  PROTOCOL_VERSION_META_KEY,
  type CallToolResult,
  type ServerContext,
} from '@modelcontextprotocol/server';
import type { z } from 'zod';
import type { AppConfig } from '../config/config-schema.js';
import type { IdGenerator } from '../application/ports/id-generator.js';
import type { Logger } from '../observability/logger.js';
import type { RequestTracker } from '../bootstrap/request-tracker.js';
import type { MutableProtocolState } from '../observability/diagnostic-checks.js';
import { presentError } from './error-presenter.js';
import { presentResult } from './result-presenter.js';
import type { ErrorMetrics } from '../observability/error-metrics.js';

export interface ToolExecutionDependencies {
  readonly config: Readonly<AppConfig>;
  readonly idGenerator: IdGenerator;
  readonly logger: Logger;
  readonly requestTracker: RequestTracker;
  readonly rootSignal: AbortSignal;
  readonly protocolState: MutableProtocolState;
  readonly errorMetrics?: ErrorMetrics;
  readonly negotiatedProtocolVersion: () => string | undefined;
}

export async function executeTool(input: {
  readonly name: string;
  readonly outputSchema: z.ZodType;
  readonly context: ServerContext;
  readonly dependencies: ToolExecutionDependencies;
  readonly execute: (requestId: string, signal: AbortSignal) => Promise<unknown>;
}): Promise<CallToolResult> {
  const requestId = input.dependencies.idGenerator.next();
  const logger = input.dependencies.logger.child({ request_id: requestId, component: 'mcp' });
  const finish = input.dependencies.requestTracker.start();
  const startedAt = performance.now();
  const timeoutSignal = AbortSignal.timeout(input.dependencies.config.requestTimeoutMs);
  const signal = AbortSignal.any([
    input.context.mcpReq.signal,
    input.dependencies.rootSignal,
    timeoutSignal,
  ]);
  const envelope = input.context.mcpReq.envelope as Readonly<Record<string, unknown>> | undefined;
  const requestProtocolVersion = envelope?.[PROTOCOL_VERSION_META_KEY];
  input.dependencies.protocolState.setNegotiatedVersion(typeof requestProtocolVersion === 'string'
    ? requestProtocolVersion
    : input.dependencies.negotiatedProtocolVersion() ?? null);
  logger.info('tool_call_started', { tool: input.name });
  try {
    const result = await input.execute(requestId, signal);
    const presented = presentResult(input.outputSchema, result);
    logger.info('tool_call_completed', {
      tool: input.name,
      duration_ms: Math.round(performance.now() - startedAt),
    });
    return presented;
  } catch (error) {
    input.dependencies.errorMetrics?.record(error);
    logger.error('tool_call_failed', {
      tool: input.name,
      duration_ms: Math.round(performance.now() - startedAt),
      error,
    });
    return presentError(error, requestId);
  } finally {
    finish();
  }
}
