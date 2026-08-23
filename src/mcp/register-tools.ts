import type { McpServer } from '@modelcontextprotocol/server';
import type { AppServices } from '../application/services/app-services.js';
import type { ToolExecutionDependencies } from './tool-executor.js';
import { registerGetEveCapabilities } from './tools/get-eve-capabilities.js';
import { registerGetEveCopilotProfile } from './tools/get-eve-copilot-profile.js';
import { registerGetServerDiagnostics } from './tools/get-server-diagnostics.js';
import { registerGetServerStatus } from './tools/get-server-status.js';
import { registerIdentityTools } from './tools/identity-tools.js';
import { registerContextTools } from './tools/context-tools.js';
import { registerBoundedReadTools } from './tools/bounded-read-tools.js';
import { registerOperationDiscoveryTools } from './tools/operation-discovery-tools.js';
import { registerActionTools } from './tools/action-tools.js';
import { registerSemanticReadTools } from './tools/semantic-read-tools.js';
import { registerFittingAnalysisTool } from './tools/fitting-analysis-tool.js';
import { registerGuideTools } from './tools/guide-tools.js';

export type { AppServices } from '../application/services/app-services.js';

export function registerTools(
  server: McpServer,
  services: AppServices,
  dependencies: ToolExecutionDependencies,
): void {
  registerGetEveCopilotProfile(server, services.getEveCopilotProfile, dependencies);
  registerGetEveCapabilities(server, services.getEveCapabilities, dependencies);
  registerGetServerDiagnostics(server, services.getServerDiagnostics, dependencies);
  registerGetServerStatus(server, services.getServerStatus, dependencies);
  registerIdentityTools(server, services, dependencies);
  registerContextTools(server, services, dependencies);
  registerBoundedReadTools(server, services.executeBoundedRead, dependencies);
  registerOperationDiscoveryTools(server, services.findEveCapabilities, dependencies);
  registerSemanticReadTools(server, services.executeSemanticRead, dependencies);
  registerFittingAnalysisTool(server, services.analyzeFittingChanges, dependencies);
  registerGuideTools(server, {
    search: services.searchEveGuide,
    read: services.readEveGuidePage,
    maintain: services.maintainEveGuide,
  }, dependencies);
  if (dependencies.config.actionsEnabled && dependencies.config.actionFamilies.length > 0) {
    registerActionTools(server, {
      prepare: services.prepareEveAction,
      execute: services.executeEveAction,
    }, dependencies);
  }
}
