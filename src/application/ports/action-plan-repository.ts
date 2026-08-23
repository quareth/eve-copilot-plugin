import type { ActionPlan, ActionPlanState } from '../../domain/action-plan.js';

export interface ActionPlanRepository {
  create(plan: ActionPlan): void;
  find(planId: string): ActionPlan | null;
  beginExecution(planId: string, now: string): ActionPlan | null;
  finish(planId: string, state: Extract<ActionPlanState, 'succeeded' | 'failed' | 'uncertain'>, now: string): boolean;
  expire(now: string): number;
  prune(before: string, maximumCount: number): number;
  counts(): Readonly<Record<ActionPlanState, number>>;
  invalidateCharacter(characterId: number): number;
}
