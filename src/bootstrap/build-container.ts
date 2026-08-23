import type { AppConfig } from '../config/config-schema.js';
import { GetEveCapabilities } from '../application/services/get-eve-capabilities.js';
import { GetEveCopilotProfile } from '../application/services/get-eve-copilot-profile.js';
import { GetServerDiagnostics } from '../application/services/get-server-diagnostics.js';
import { GetServerStatus } from '../application/services/get-server-status.js';
import { RepositoryCharacterContext } from '../application/ports/character-context.js';
import { buildCapabilityRegistry } from '../capabilities/registry.js';
import { buildEsiOperationCatalog } from '../capabilities/operation-catalog.js';
import { createLogger } from '../observability/logger.js';
import {
  createDiagnosticChecks,
  MutableProtocolState,
  SqliteMetadataPort,
} from '../observability/diagnostic-checks.js';
import { SystemClock } from '../platform/system-clock.js';
import { UuidGenerator } from '../platform/uuid-generator.js';
import { Base64UrlCursorCodec } from '../platform/base64url-cursor-codec.js';
import { ensurePrivateDirectory } from '../storage/file-permissions.js';
import { openDatabase } from '../storage/sqlite/open-database.js';
import { SqliteSystemStateRepository } from '../storage/sqlite/system-state-repository.js';
import { AppContainer } from './app-container.js';
import { RequestTracker } from './request-tracker.js';
import { getRuntimeInfo } from './runtime-info.js';
import { AppError } from '../domain/errors.js';
import { SqliteAuthorizationSessionRepository } from '../storage/sqlite/authorization-session-repository.js';
import { SqliteCharacterRepository } from '../storage/sqlite/character-repository.js';
import { SqliteTokenRefreshCoordinator } from '../storage/sqlite/token-refresh-coordinator.js';
import {
  DisabledCredentialStore,
  SystemCredentialStore,
} from '../infrastructure/credentials/system-credential-store.js';
import { EveSsoGateway } from '../infrastructure/sso/eve-sso-gateway.js';
import { LoopbackCallbackServer } from '../infrastructure/sso/loopback-callback-server.js';
import { SystemBrowserLauncher } from '../platform/system-browser-launcher.js';
import { Sha256OAuthStateHasher } from '../platform/sha256-oauth-state-hasher.js';
import { CompleteCharacterConnection } from '../application/services/complete-character-connection.js';
import { ConnectCharacter } from '../application/services/connect-character.js';
import { GetCharacterConnectionStatus } from '../application/services/get-character-connection-status.js';
import { CancelCharacterConnection } from '../application/services/cancel-character-connection.js';
import { ReauthorizeCharacter } from '../application/services/reauthorize-character.js';
import { ListCharacters } from '../application/services/list-characters.js';
import { SelectCharacter } from '../application/services/select-character.js';
import { DisconnectCharacter } from '../application/services/disconnect-character.js';
import { SystemDelay } from '../platform/system-delay.js';
import { ManagedCharacterAccessTokenProvider } from '../application/services/managed-character-access-token-provider.js';
import { SqliteEsiCacheRepository } from '../storage/sqlite/esi-cache-repository.js';
import { CatalogEsiGateway } from '../infrastructure/esi/catalog-esi-gateway.js';
import { FileSdeRepository } from '../infrastructure/sde/file-sde-repository.js';
import { GetCharacterOverview } from '../application/services/get-character-overview.js';
import { GetCurrentLocation } from '../application/services/get-current-location.js';
import { GetCurrentShip } from '../application/services/get-current-ship.js';
import { SqliteCoordinationLeaseRepository } from '../storage/sqlite/coordination-lease-repository.js';
import { SqliteCredentialCleanupRepository } from '../storage/sqlite/credential-cleanup-repository.js';
import { SystemLeaseHeartbeat } from '../platform/system-lease-heartbeat.js';
import { GeneratedEsiOperationExecutor } from '../infrastructure/esi/operation-executor.js';
import { ExecuteBoundedRead } from '../application/services/execute-bounded-read.js';
import { FindEveCapabilities } from '../application/services/find-eve-capabilities.js';
import { randomBytes } from 'node:crypto';
import { SqliteContinuationRepository } from '../storage/sqlite/continuation-repository.js';
import { HmacContinuationTokenCodec } from '../platform/hmac-continuation-token-codec.js';
import { SqliteActionPlanRepository } from '../storage/sqlite/action-plan-repository.js';
import { SqliteActionAuditRepository } from '../storage/sqlite/action-audit-repository.js';
import { Sha256Digest } from '../platform/sha256-digest.js';
import { ErrorMetrics } from '../observability/error-metrics.js';
import { PrepareEveAction } from '../application/services/prepare-eve-action.js';
import { ExecuteEveAction } from '../application/services/execute-eve-action.js';
import { ActionServiceContext } from '../application/services/action-support.js';
import { InMemoryEsiRateLimitCoordinator } from '../infrastructure/esi/rate-limit-coordinator.js';
import { ExecuteSemanticRead } from '../application/services/execute-semantic-read.js';
import { ESI_COVERAGE_SNAPSHOT, ESI_COVERAGE_SUMMARY } from '../capabilities/generated/coverage-summary.js';
import { ESI_SCOPE_BUNDLES } from '../capabilities/generated/scope-bundles.js';
import { AnalyzeFittingChanges } from '../application/services/analyze-fitting-changes.js';
import { OneShotDogmaEngine } from '../infrastructure/fitting/one-shot-dogma-engine.js';
import { FileGuideRepository } from '../storage/file-guide-repository.js';
import { SearchEveGuide } from '../application/services/search-eve-guide.js';
import { ReadEveGuidePage } from '../application/services/read-eve-guide-page.js';
import { MaintainEveGuide } from '../application/services/maintain-eve-guide.js';
import { join } from 'node:path';

export function buildContainer(config: Readonly<AppConfig>): AppContainer {
  const clock = new SystemClock();
  const idGenerator = new UuidGenerator();
  const logger = createLogger({
    level: config.logLevel,
    format: config.logFormat,
    now: () => clock.now(),
  });
  let database;
  try {
    ensurePrivateDirectory(config.dataDir);
    database = openDatabase({
      path: config.databasePath,
      busyTimeoutMs: config.databaseBusyTimeoutMs,
      clock,
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError({
      code: 'DATABASE_UNAVAILABLE',
      safeMessage: 'The local data directory could not be initialized.',
      cause: error,
    });
  }
  try {
    const systemState = new SqliteSystemStateRepository(database);
    const installation = systemState.initializeInstallation({
      installationId: idGenerator.next(),
      createdAt: clock.now().toISOString(),
    });
    const continuationSecret = systemState.initializeContinuationSecret({
      secret: randomBytes(32).toString('base64url'),
      createdAt: clock.now().toISOString(),
    });
    const runtime = getRuntimeInfo();
    const registry = buildCapabilityRegistry({
      actionsEnabled: config.actionsEnabled && config.actionFamilies.length > 0,
    });
    const operationCatalog = buildEsiOperationCatalog();
    const protocolState = new MutableProtocolState();
    const databaseMetadata = new SqliteMetadataPort(database);
    const rootController = new AbortController();
    const requestTracker = new RequestTracker();
    const characters = new SqliteCharacterRepository(database);
    const sessions = new SqliteAuthorizationSessionRepository(database);
    const credentialCleanup = new SqliteCredentialCleanupRepository(database);
    const coordination = new SqliteCoordinationLeaseRepository(database);
    const refreshCoordinator = new SqliteTokenRefreshCoordinator(coordination);
    refreshCoordinator.removeExpired(clock.now().toISOString());
    const credentials = config.credentialBackend === 'disabled'
      ? new DisabledCredentialStore()
      : new SystemCredentialStore({
        installationId: installation.installationId,
        idGenerator,
      });
    const sso = new EveSsoGateway({
      timeoutMs: config.ssoTimeoutMs,
      maxResponseBytes: config.httpMaxResponseBytes,
      now: () => clock.now(),
    });
    const stateHasher = new Sha256OAuthStateHasher();
    const completeCharacterConnection = new CompleteCharacterConnection({
      clock,
      credentials,
      sessions,
      characters,
      sso,
      clientId: config.eveClientId,
      stateHasher,
      cleanup: credentialCleanup,
    });
    const callbackListener = new LoopbackCallbackServer({
      redirectUri: config.ssoRedirectUri,
      coordination,
      clock,
      ownerId: idGenerator.next(),
      async handler(input) {
        try {
          await completeCharacterConnection.execute({
            ...input,
            signal: rootController.signal,
          });
        } finally {
          if (sessions.countActive(clock.now().toISOString()) === 0) {
            void callbackListener.close();
          }
        }
      },
    });
    const connectCharacter = new ConnectCharacter({
      clock,
      idGenerator,
      credentials,
      sessions,
      characters,
      sso,
      listener: callbackListener,
      browser: new SystemBrowserLauncher(),
      clientId: config.eveClientId,
      redirectUri: config.ssoRedirectUri,
      sessionTtlMs: config.oauthSessionTtlMs,
      stateHasher,
      cleanup: credentialCleanup,
    });
    const delay = new SystemDelay();
    const tokenProvider = new ManagedCharacterAccessTokenProvider({
      clock,
      credentials,
      characters,
      sso,
      coordinator: refreshCoordinator,
      idGenerator,
      delay,
      clientId: config.eveClientId,
      heartbeat: new SystemLeaseHeartbeat(),
    });
    const esiCache = new SqliteEsiCacheRepository(database);
    const rateLimits = new InMemoryEsiRateLimitCoordinator({ clock, delay });
    const operationExecutor = new GeneratedEsiOperationExecutor({
      compatibilityDate: config.esiCompatibilityDate,
      userAgent: config.esiUserAgent,
      timeoutMs: config.esiTimeoutMs,
      maxResponseBytes: config.httpMaxResponseBytes,
      cacheMaxBytes: config.esiCacheMaxBytes,
      clock,
      delay,
      cache: esiCache,
      tokens: tokenProvider,
      rateLimits,
    });
    const esi = new CatalogEsiGateway({
      catalog: operationCatalog,
      executor: operationExecutor,
    });
    const continuations = new SqliteContinuationRepository(database);
    continuations.removeExpired(clock.now().toISOString());
    const actionPlans = new SqliteActionPlanRepository(database);
    const actionAudit = new SqliteActionAuditRepository(database);
    const digest = new Sha256Digest();
    const errorMetrics = new ErrorMetrics(clock);
    const boundedReads = new ExecuteBoundedRead({
      catalog: operationCatalog,
      characters,
      identity: esi,
      executor: operationExecutor,
      continuations,
      continuationTokens: new HmacContinuationTokenCodec(continuationSecret.secret),
      clock,
      idGenerator,
      digest,
    });
    const sde = new FileSdeRepository(config.sdeDir);
    const guideDir = join(config.dataDir, 'guide');
    const guide = new FileGuideRepository(guideDir);
    const checks = createDiagnosticChecks({
      config,
      clock,
      idGenerator,
      runtime,
      database,
      registry,
      credentials,
      sde,
      guide,
      transportState: () => container.transportState(),
    });
    const actionServices = new ActionServiceContext({
      catalog: operationCatalog,
      characters,
      actions: operationExecutor,
      reads: operationExecutor,
      plans: actionPlans,
      audit: actionAudit,
      clock,
      idGenerator,
      digest,
      enabled: config.actionsEnabled,
      families: config.actionFamilies,
    });
    const services = {
      getEveCopilotProfile: new GetEveCopilotProfile({
        clock,
        faction: config.personaFaction,
      }),
      getEveCapabilities: new GetEveCapabilities({
        clock,
        registry,
        characterContext: new RepositoryCharacterContext({ characters, sessions, clock }),
        cursorCodec: new Base64UrlCursorCodec(),
      }),
      getServerDiagnostics: new GetServerDiagnostics({
        clock,
        runtime,
        database: databaseMetadata,
        dataDirectoryKind: config.dataDirectoryKind,
        checks,
        stageThree: async () => {
          const rate = rateLimits.snapshot();
          const cache = operationExecutor.diagnostics();
          const sdeStatus = await sde.status();
          const selected = characters.selected();
          return {
            compatibility_date: ESI_COVERAGE_SNAPSHOT.compatibilityDate,
            snapshot_sha256: ESI_COVERAGE_SNAPSHOT.sha256,
            surface_profile: 'complete' as const,
            coverage: {
              total: ESI_COVERAGE_SUMMARY.total_operations,
              semantic: ESI_COVERAGE_SUMMARY.dispositions.implemented_semantic,
              bounded: ESI_COVERAGE_SUMMARY.dispositions.implemented_bounded_low_level,
              excluded: ESI_COVERAGE_SUMMARY.dispositions.excluded_policy,
              planned: ESI_COVERAGE_SUMMARY.dispositions.planned,
              accounted_percent: ESI_COVERAGE_SUMMARY.accounted.percent,
              allowed_execution_percent: ESI_COVERAGE_SUMMARY.allowed_execution.percent,
              by_pack: ESI_COVERAGE_SUMMARY.by_pack,
              by_access: ESI_COVERAGE_SUMMARY.by_access,
              by_class: ESI_COVERAGE_SUMMARY.by_class,
            },
            actions: {
              enabled: config.actionsEnabled,
              enabled_families: config.actionFamilies,
              plans_by_state: actionPlans.counts(),
            },
            rate_limits: {
              delayed_requests: rate.delayedRequests,
              total_delay_ms: rate.totalDelayMs,
              active_buckets: rate.activeBuckets,
              globally_blocked_until: rate.globallyBlockedUntil,
              groups: rate.groups.map((group) => ({
                group: group.group,
                active_buckets: group.activeBuckets,
                reserved_tokens: group.reservedTokens,
                delayed_requests: group.delayedRequests,
                total_delay_ms: group.totalDelayMs,
                blocked_until: group.blockedUntil,
              })),
            },
            sde: {
              state: sdeStatus.state,
              build_number: sdeStatus.buildNumber,
              release_date: sdeStatus.releaseDate,
            },
            cache: {
              size_bytes: esiCache.totalBytes(),
              hits: cache.cacheHits,
              misses: cache.cacheMisses,
              revalidations: cache.cacheRevalidations,
              stale_served: cache.staleServed,
            },
            retries: { read_retries: cache.readRetries },
            recent_error_categories: errorMetrics.snapshot(),
            scope_bundles: ESI_SCOPE_BUNDLES.map((bundle) => {
              const missing = bundle.scopes.filter((scope) => !selected?.grantedScopes.includes(scope));
              return {
                bundle: bundle.name,
                kind: bundle.kind,
                selected_character_granted: selected !== null && missing.length === 0,
                missing_scopes: missing,
                application_registration_check: 'verify_in_eve_developer_portal' as const,
              };
            }),
          };
        },
      }),
      getServerStatus: new GetServerStatus({
        clock,
        runtime,
        database: databaseMetadata,
        registry,
        checks,
        protocol: protocolState,
      }),
      connectCharacter,
      getCharacterConnectionStatus: new GetCharacterConnectionStatus({
        clock, sessions, credentials, characters, listener: callbackListener, cleanup: credentialCleanup,
      }),
      cancelCharacterConnection: new CancelCharacterConnection({
        clock, sessions, credentials, listener: callbackListener,
      }),
      reauthorizeCharacter: new ReauthorizeCharacter({
        connect: connectCharacter,
        characters,
        catalog: operationCatalog,
      }),
      listCharacters: new ListCharacters({
        clock,
        characters,
        cursorCodec: new Base64UrlCursorCodec(),
      }),
      selectCharacter: new SelectCharacter({ clock, characters }),
      disconnectCharacter: new DisconnectCharacter({ clock, characters, credentials, guide }),
      getCharacterOverview: new GetCharacterOverview({ characters, clock, esi, sde }),
      getCurrentLocation: new GetCurrentLocation({ characters, esi, sde }),
      getCurrentShip: new GetCurrentShip({ characters, esi, sde }),
      executeBoundedRead: boundedReads,
      executeSemanticRead: new ExecuteSemanticRead({
        bounded: boundedReads,
        catalog: operationCatalog,
        clock,
        sde,
      }),
      analyzeFittingChanges: new AnalyzeFittingChanges({
        reads: boundedReads,
        sde,
        engine: new OneShotDogmaEngine(),
      }),
      searchEveGuide: new SearchEveGuide({ guide, characters, clock }),
      readEveGuidePage: new ReadEveGuidePage({ guide, characters, sde, clock }),
      maintainEveGuide: new MaintainEveGuide({ guide, characters, clock }),
      findEveCapabilities: new FindEveCapabilities({
        catalog: operationCatalog,
        characters,
        clock,
      }),
      prepareEveAction: new PrepareEveAction(actionServices),
      executeEveAction: new ExecuteEveAction(actionServices),
    };
    const container = new AppContainer({
      config,
      logger,
      runtime,
      services,
      rootController,
      requestTracker,
      clock,
      idGenerator,
      database,
      systemState,
      protocolState,
      callbackListener,
      sde,
      errorMetrics,
    });
    return container;
  } catch (error) {
    database.close();
    if (error instanceof AppError) throw error;
    throw new AppError({
      code: 'DATABASE_UNAVAILABLE',
      safeMessage: 'A local startup dependency could not be initialized.',
      cause: error,
    });
  }
}
