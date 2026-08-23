import type { ExecuteEveActionInput, ExecutedActionData } from '../dto/actions.js';
import type { IdGenerator } from '../ports/id-generator.js';
import type { RequestContext, UseCase } from './use-case.js';
import { requireSelectedCharacter } from '../../domain/authorization.js';
import {
  actionServiceContext,
  assertActionScopes,
  assertActionTargetAccess,
  type ActionServiceContext,
  type ActionServiceDependencies,
} from './action-support.js';
import { canonicalJson, requiredFamily } from './prepare-eve-action.js';
import type { ActionAuditEvent, ActionPlan, ActionPlanState } from '../../domain/action-plan.js';
import { AppError, throwIfAborted } from '../../domain/errors.js';
import type { EsiActionFamily } from '../../domain/esi-operation.js';
import type { ResultEnvelope } from '../../domain/result.js';

export class ExecuteEveAction implements UseCase<ExecuteEveActionInput, ResultEnvelope<ExecutedActionData>> {
  readonly #action: ActionServiceContext;

  constructor(input: ActionServiceDependencies | ActionServiceContext) {
    this.#action = actionServiceContext(input);
  }

  async execute(
    input: ExecuteEveActionInput,
    context: RequestContext,
  ): Promise<ResultEnvelope<ExecutedActionData>> {
    throwIfAborted(context.signal);
    const now = this.#action.clock.now();
    this.#action.plans.expire(now.toISOString());
    const plan = this.#action.plans.find(input.plan_id);
    if (plan === null) throw planNotFound();
    if (plan.state === 'expired' || Date.parse(plan.expiresAt) <= now.getTime()) throw planExpired();
    if (plan.state !== 'planned') throw alreadyExecuted();
    if (!this.#action.digest.matches(input.confirmation, plan.confirmationDigest)) {
      throw new AppError({
        code: 'ACTION_REQUIRES_CONFIRMATION',
        safeMessage: 'The confirmation value does not match the prepared action plan.',
      });
    }
    const operation = this.#action.catalog.findOperation(plan.operationId);
    if (operation?.operationClass !== 'action'
      || !operation.capabilityIds.includes(plan.capabilityId)) {
      throw planNotFound();
    }
    const family = requiredFamily(operation);
    if (!this.#action.enabled(family)) throw actionDisabled(plan.capabilityId, family);
    const character = requireSelectedCharacter(this.#action.characters.selected());
    if (character.characterId !== plan.characterId
      || character.authorizationGeneration !== plan.authorizationGeneration) {
      throw new AppError({
        code: 'ACTION_PLAN_EXPIRED',
        safeMessage: 'The selected character or authorization changed after this action was prepared.',
        details: { next_step: 'Prepare the action again.' },
      });
    }
    if (this.#action.digest.hex(canonicalJson(plan.arguments)) !== plan.argumentDigest) throw planNotFound();
    assertActionScopes(operation, character);
    await assertActionTargetAccess({
      operation,
      arguments: plan.arguments,
      character,
      catalog: this.#action.catalog,
      reads: this.#action.reads,
      signal: context.signal,
    });
    const executing = this.#action.plans.beginExecution(plan.planId, now.toISOString());
    if (executing === null) throw alreadyExecuted();
    const targetDigest = this.#action.digest.hex(canonicalJson(plan.summary));
    this.#action.audit.append(event(this.#action.idGenerator, plan, 'executing', targetDigest, null, now.toISOString()));
    try {
      const result = await this.#action.actions.executeAction({
        operation,
        arguments: plan.arguments,
        character,
        signal: context.signal,
      });
      const finishedAt = this.#action.clock.now().toISOString();
      if (!this.#action.plans.finish(plan.planId, 'succeeded', finishedAt)) throw alreadyExecuted();
      this.#action.audit.append(event(this.#action.idGenerator, plan, 'succeeded', targetDigest, null, finishedAt));
      const response: ResultEnvelope<ExecutedActionData> = Object.freeze({
        schema_version: 1,
        request_id: context.requestId,
        character: { id: character.characterId, name: character.verifiedName },
        data: Object.freeze({
          plan_id: plan.planId,
          capability_id: plan.capabilityId,
          operation_id: plan.operationId,
          state: 'succeeded',
          result: result.value,
        }),
        source: {
          kind: 'ESI' as const,
          name: 'EVE Swagger Interface action',
          operation: plan.operationId,
          version: operation.compatibilityDate,
        },
        retrieved_at: result.executedAt,
        expires_at: null,
        cache: 'not_applicable',
        estimated: false,
        partial: false,
        warnings: [],
      });
      return response;
    } catch (error) {
      const uncertain = error instanceof AppError && error.code === 'ACTION_OUTCOME_UNCERTAIN';
      const state = uncertain ? 'uncertain' : 'failed';
      const failedAt = this.#action.clock.now().toISOString();
      this.#action.plans.finish(plan.planId, state, failedAt);
      this.#action.audit.append(event(
        this.#action.idGenerator,
        plan,
        state,
        targetDigest,
        error instanceof AppError ? error.code : 'INTERNAL_ERROR',
        failedAt,
      ));
      throw error;
    }
  }
}

function event(
  idGenerator: IdGenerator,
  plan: ActionPlan,
  state: ActionPlanState,
  targetDigest: string,
  errorCode: string | null,
  createdAt: string,
): ActionAuditEvent {
  return Object.freeze({
    eventId: idGenerator.next(),
    planId: plan.planId,
    capabilityId: plan.capabilityId,
    operationId: plan.operationId,
    characterId: plan.characterId,
    authorizationGeneration: plan.authorizationGeneration,
    state,
    targetDigest,
    errorCode,
    createdAt,
  });
}

function planNotFound(): AppError {
  return new AppError({
    code: 'ACTION_PLAN_NOT_FOUND',
    safeMessage: 'The EVE action plan was not found.',
    details: { next_step: 'Prepare the action again.' },
  });
}

function planExpired(): AppError {
  return new AppError({
    code: 'ACTION_PLAN_EXPIRED',
    safeMessage: 'The EVE action plan expired.',
    details: { next_step: 'Prepare the action again.' },
  });
}

function alreadyExecuted(): AppError {
  return new AppError({
    code: 'ACTION_ALREADY_EXECUTED',
    safeMessage: 'The EVE action plan is no longer executable.',
    details: { next_step: 'Verify the result with a read capability before preparing another action.' },
  });
}

function actionDisabled(capabilityId: string, family: EsiActionFamily): AppError {
  return new AppError({
    code: 'ACTION_DISABLED',
    safeMessage: 'This EVE action family is disabled locally.',
    details: { capability_id: capabilityId, next_step: `Enable the ${family} action family locally.` },
  });
}
