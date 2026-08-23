export interface InstallationState {
  readonly installationId: string;
  readonly createdAt: string;
}

export interface CleanShutdownState {
  readonly at: string;
  readonly version: string;
}

export interface ContinuationSecretState {
  readonly secret: string;
  readonly createdAt: string;
}

export interface SystemStateRepository {
  getInstallation(): InstallationState | null;
  initializeInstallation(state: InstallationState): InstallationState;
  getLastCleanShutdown(): CleanShutdownState | null;
  setLastCleanShutdown(state: CleanShutdownState): void;
  getContinuationSecret(): ContinuationSecretState | null;
  initializeContinuationSecret(state: ContinuationSecretState): ContinuationSecretState;
}
