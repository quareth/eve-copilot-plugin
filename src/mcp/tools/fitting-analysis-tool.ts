import type { McpServer } from '@modelcontextprotocol/server';
import type { AnalyzeFittingChanges } from '../../application/services/analyze-fitting-changes.js';
import type { AnalyzeFittingChangesInput } from '../../application/dto/fitting-analysis.js';
import { contextToolAnnotations } from '../schemas/common.js';
import {
  analyzeFittingChangesInputSchema,
  analyzeFittingChangesOutputSchema,
} from '../schemas/fitting-analysis.js';
import { executeTool, type ToolExecutionDependencies } from '../tool-executor.js';

export function registerFittingAnalysisTool(
  server: McpServer,
  service: AnalyzeFittingChanges,
  dependencies: ToolExecutionDependencies,
): void {
  server.registerTool('analyze_fitting_changes', {
    title: 'Analyze fitting changes',
    description: 'Deterministically validates one EVE fitting baseline and up to five candidates for CPU, powergrid, slots, hardpoints, rigs, drones, skills, and explicit capacitor profiles. It is read-only and never changes a fitting in EVE.',
    inputSchema: analyzeFittingChangesInputSchema,
    outputSchema: analyzeFittingChangesOutputSchema,
    annotations: contextToolAnnotations,
  }, (args, context) => executeTool({
    name: 'analyze_fitting_changes',
    outputSchema: analyzeFittingChangesOutputSchema,
    context,
    dependencies,
    execute: (requestId, signal) => service.execute(args as AnalyzeFittingChangesInput, { requestId, signal }),
  }));
}
