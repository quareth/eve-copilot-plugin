import type { ActionAuditEvent } from '../../domain/action-plan.js';

export interface ActionAuditRepository {
  append(event: ActionAuditEvent): void;
  prune(before: string, maximumCount: number): number;
}
