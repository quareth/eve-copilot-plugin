export interface AuthorizationMaterial {
  readonly state: string;
  readonly verifier: string;
  readonly authorizationUrl: string;
}

export interface VerifiedSsoGrant {
  readonly characterId: number;
  readonly characterName: string;
  readonly subject: string;
  readonly grantedScopes: readonly string[];
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly accessExpiresAt: string;
}

export interface RefreshedSsoGrant extends Omit<VerifiedSsoGrant, 'refreshToken'> {
  readonly refreshToken: string | null;
}

export interface SsoGateway {
  beginAuthorization(input: {
    readonly clientId: string;
    readonly redirectUri: string;
    readonly scopes: readonly string[];
    readonly signal: AbortSignal;
  }): Promise<AuthorizationMaterial>;
  exchangeCode(input: {
    readonly clientId: string;
    readonly redirectUri: string;
    readonly code: string;
    readonly verifier: string;
    readonly expectedScopes: readonly string[];
    readonly signal: AbortSignal;
  }): Promise<VerifiedSsoGrant>;
  refresh(input: {
    readonly clientId: string;
    readonly refreshToken: string;
    readonly expectedCharacterId: number;
    readonly expectedScopes: readonly string[];
    readonly signal: AbortSignal;
  }): Promise<RefreshedSsoGrant>;
}
