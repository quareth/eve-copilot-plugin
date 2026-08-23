import { createHash, randomBytes } from 'node:crypto';
import {
  decodeProtectedHeader,
  importJWK,
  jwtVerify,
  type JSONWebKeySet,
  type JWTPayload,
} from 'jose';
import { z } from 'zod';
import type {
  AuthorizationMaterial,
  RefreshedSsoGrant,
  SsoGateway,
  VerifiedSsoGrant,
} from '../../application/ports/sso-gateway.js';
import {
  AppError,
  throwIfAborted,
  type DiagnosticCode,
} from '../../domain/errors.js';

const DISCOVERY_URL = 'https://login.eveonline.com/.well-known/oauth-authorization-server';
const LOGIN_ORIGIN = 'https://login.eveonline.com';
const ACCESS_TOKEN_ISSUERS = [
  LOGIN_ORIGIN,
  `${LOGIN_ORIGIN}/`,
  'login.eveonline.com',
];
const ACCESS_TOKEN_ALGORITHMS = ['RS256', 'ES256'] as const;

const discoverySchema = z.looseObject({
  issuer: z.string(),
  authorization_endpoint: z.url(),
  token_endpoint: z.url(),
  jwks_uri: z.url(),
  code_challenge_methods_supported: z.array(z.string()).optional(),
});

const tokenSchema = z.looseObject({
  access_token: z.string().min(1).max(131_072),
  refresh_token: z.string().min(1).max(131_072).optional(),
  token_type: z.string().min(1).max(64),
  expires_in: z.number().int().positive().max(86_400).optional(),
});

const jwksSchema = z.looseObject({
  keys: z.array(z.record(z.string(), z.unknown())).min(1).max(100),
});

interface Discovery {
  readonly issuer: string;
  readonly authorizationEndpoint: string;
  readonly tokenEndpoint: string;
  readonly jwksUri: string;
  readonly expiresAtMs: number;
}

interface CachedJwks {
  readonly value: JSONWebKeySet;
  readonly expiresAtMs: number;
}

export class EveSsoGateway implements SsoGateway {
  readonly #fetch: typeof fetch;
  readonly #now: () => Date;
  readonly #timeoutMs: number;
  readonly #maxResponseBytes: number;
  #discovery: Discovery | null = null;
  #jwks: CachedJwks | null = null;

  constructor(input: {
    readonly fetch?: typeof fetch;
    readonly now?: () => Date;
    readonly timeoutMs: number;
    readonly maxResponseBytes: number;
  }) {
    this.#fetch = input.fetch ?? globalThis.fetch;
    this.#now = input.now ?? (() => new Date());
    this.#timeoutMs = input.timeoutMs;
    this.#maxResponseBytes = Math.min(input.maxResponseBytes, 1_048_576);
  }

  async beginAuthorization(input: {
    readonly clientId: string;
    readonly redirectUri: string;
    readonly scopes: readonly string[];
    readonly signal: AbortSignal;
  }): Promise<AuthorizationMaterial> {
    throwIfAborted(input.signal);
    const discovery = await this.#getDiscovery(input.signal);
    const verifier = base64Url(randomBytes(32));
    const state = base64Url(randomBytes(32));
    const challenge = base64Url(createHash('sha256').update(verifier, 'utf8').digest());
    const url = new URL(discovery.authorizationEndpoint);
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: input.clientId,
      redirect_uri: input.redirectUri,
      scope: [...input.scopes].sort().join(' '),
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    }).toString();
    return Object.freeze({ state, verifier, authorizationUrl: url.toString() });
  }

  async exchangeCode(input: {
    readonly clientId: string;
    readonly redirectUri: string;
    readonly code: string;
    readonly verifier: string;
    readonly expectedScopes: readonly string[];
    readonly signal: AbortSignal;
  }): Promise<VerifiedSsoGrant> {
    const discovery = await this.#getDiscovery(input.signal);
    const response = await this.#tokenRequest(discovery.tokenEndpoint, new URLSearchParams({
      grant_type: 'authorization_code',
      code: input.code,
      client_id: input.clientId,
      code_verifier: input.verifier,
      redirect_uri: input.redirectUri,
    }), input.signal);
    if (response.refresh_token === undefined) {
      throw contractMismatch(
        'EVE SSO did not return a refresh token.',
        undefined,
        'SSO_REFRESH_TOKEN_MISSING',
      );
    }
    const identity = await this.#validateAccessToken(
      response.access_token,
      input.clientId,
      input.expectedScopes,
      input.signal,
    );
    return Object.freeze({
      ...identity,
      accessToken: response.access_token,
      refreshToken: response.refresh_token,
    });
  }

  async refresh(input: {
    readonly clientId: string;
    readonly refreshToken: string;
    readonly expectedCharacterId: number;
    readonly expectedScopes: readonly string[];
    readonly signal: AbortSignal;
  }): Promise<RefreshedSsoGrant> {
    const discovery = await this.#getDiscovery(input.signal);
    const response = await this.#tokenRequest(discovery.tokenEndpoint, new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: input.refreshToken,
      client_id: input.clientId,
    }), input.signal);
    const identity = await this.#validateAccessToken(
      response.access_token,
      input.clientId,
      input.expectedScopes,
      input.signal,
    );
    if (identity.characterId !== input.expectedCharacterId) {
      throw new AppError({
        code: 'REAUTHORIZATION_REQUIRED',
        safeMessage: 'The refreshed authorization belongs to a different character.',
        details: { character_id: input.expectedCharacterId, next_step: 'Reauthorize this character.' },
      });
    }
    return Object.freeze({
      ...identity,
      accessToken: response.access_token,
      refreshToken: response.refresh_token ?? null,
    });
  }

  async #validateAccessToken(
    token: string,
    clientId: string,
    expectedScopes: readonly string[],
    signal: AbortSignal,
  ): Promise<Omit<VerifiedSsoGrant, 'accessToken' | 'refreshToken'>> {
    const discovery = await this.#getDiscovery(signal);
    let protectedHeader;
    try {
      protectedHeader = decodeProtectedHeader(token);
    } catch (error) {
      throw contractMismatch(
        'The EVE SSO access token could not be verified.',
        error,
        'JWT_MALFORMED',
      );
    }
    const algorithm = protectedHeader.alg;
    const keyId = protectedHeader.kid;
    if (typeof algorithm !== 'string'
      || !(ACCESS_TOKEN_ALGORITHMS as readonly string[]).includes(algorithm)) {
      throw contractMismatch(
        'The EVE SSO access token could not be verified.',
        undefined,
        'JWT_ALGORITHM_NOT_ALLOWED',
      );
    }
    if (typeof keyId !== 'string' || keyId.length === 0) {
      throw contractMismatch(
        'The EVE SSO access token could not be verified.',
        undefined,
        'JWT_KEY_ID_MISSING',
      );
    }
    let verificationError: unknown;
    let verificationDiagnostic: DiagnosticCode = 'JWT_VERIFICATION_FAILED';
    let verifiedPayload: JWTPayload | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const jwks = await this.#getJwks(discovery.jwksUri, signal);
        const matchingKeys = jwks.keys.filter((key) => isMatchingSigningKey(
          key,
          algorithm,
          keyId,
        ));
        if (matchingKeys.length === 0) {
          verificationDiagnostic = 'JWT_SIGNING_KEY_NOT_FOUND';
          this.#jwks = null;
          continue;
        }
        if (matchingKeys.length > 1) {
          verificationDiagnostic = 'JWT_SIGNING_KEY_AMBIGUOUS';
          this.#jwks = null;
          continue;
        }
        const matchingKey = matchingKeys[0];
        if (matchingKey === undefined) {
          verificationDiagnostic = 'JWT_SIGNING_KEY_NOT_FOUND';
          this.#jwks = null;
          continue;
        }
        let signingKey;
        try {
          signingKey = await importJWK(matchingKey, algorithm);
        } catch (error) {
          verificationError = error;
          verificationDiagnostic = 'JWT_KEY_IMPORT_FAILED';
          this.#jwks = null;
          continue;
        }
        const verified = await jwtVerify(token, signingKey, {
          algorithms: [...ACCESS_TOKEN_ALGORITHMS],
          issuer: ACCESS_TOKEN_ISSUERS,
          requiredClaims: ['iss', 'aud', 'exp', 'sub'],
          clockTolerance: 60,
        });
        verifiedPayload = verified.payload;
        break;
      } catch (error) {
        verificationError = error;
        verificationDiagnostic = classifyJwtVerificationFailure(error);
        this.#jwks = null;
      }
    }
    if (verifiedPayload === null) {
      throw contractMismatch(
        'The EVE SSO access token could not be verified.',
        verificationError,
        verificationDiagnostic,
      );
    }
    const payload: JWTPayload = verifiedPayload;
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!audiences.includes(clientId) || !audiences.includes('EVE Online')) {
      throw contractMismatch(
        'The EVE SSO access token has an unexpected audience.',
        undefined,
        'JWT_AUDIENCE_INVALID',
      );
    }
    const subject = payload.sub;
    const match = /^CHARACTER:EVE:([1-9][0-9]*)$/u.exec(subject ?? '');
    const characterId = match?.[1] === undefined ? Number.NaN : Number(match[1]);
    if (!Number.isSafeInteger(characterId) || characterId <= 0) {
      throw contractMismatch(
        'The EVE SSO access token has an invalid character subject.',
        undefined,
        'JWT_SUBJECT_INVALID',
      );
    }
    const name = payload.name;
    const rawScopes = payload.scp;
    if (typeof name !== 'string' || name.length === 0 || name.length > 256
      || !Array.isArray(rawScopes) || !rawScopes.every((scope) => typeof scope === 'string')) {
      throw contractMismatch(
        'The EVE SSO access token is missing required character claims.',
        undefined,
        'JWT_CHARACTER_CLAIMS_INVALID',
      );
    }
    const scopes = [...new Set(rawScopes)].sort();
    if (scopes.length !== rawScopes.length || scopes.some((scope) => !expectedScopes.includes(scope))) {
      throw contractMismatch(
        'The EVE SSO access token contains an unexpected scope set.',
        undefined,
        'JWT_SCOPES_INVALID',
      );
    }
    if (payload.exp === undefined) {
      throw contractMismatch(
        'The EVE SSO access token has no expiry.',
        undefined,
        'JWT_EXPIRY_MISSING',
      );
    }
    return Object.freeze({
      characterId,
      characterName: name,
      subject: subject ?? '',
      grantedScopes: Object.freeze(scopes),
      accessExpiresAt: new Date(payload.exp * 1_000).toISOString(),
    });
  }

  async #tokenRequest(endpoint: string, body: URLSearchParams, signal: AbortSignal): Promise<z.infer<typeof tokenSchema>> {
    const response = await this.#request(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body,
      signal,
    });
    if (!response.ok) {
      throw new AppError({
        code: response.status === 400 || response.status === 401
          ? 'REAUTHORIZATION_REQUIRED'
          : 'UPSTREAM_SERVICE_FAILED',
        safeMessage: 'EVE SSO rejected the authorization request.',
        details: { next_step: 'Start a new character authorization.' },
      });
    }
    return tokenSchema.parse(await readJson(response, this.#maxResponseBytes));
  }

  async #getDiscovery(signal: AbortSignal): Promise<Discovery> {
    if (this.#discovery !== null && this.#discovery.expiresAtMs > this.#now().getTime()) return this.#discovery;
    const response = await this.#request(DISCOVERY_URL, { signal, headers: { accept: 'application/json' } });
    if (!response.ok) throw upstreamUnavailable('EVE SSO discovery is unavailable.');
    const value = discoverySchema.parse(await readJson(response, this.#maxResponseBytes));
    assertLoginUrl(value.authorization_endpoint);
    assertLoginUrl(value.token_endpoint);
    assertLoginUrl(value.jwks_uri);
    if (normalizeIssuer(value.issuer) !== LOGIN_ORIGIN
      || !value.code_challenge_methods_supported?.includes('S256')) {
      throw contractMismatch('EVE SSO discovery returned an unsupported contract.');
    }
    this.#discovery = Object.freeze({
      issuer: normalizeIssuer(value.issuer),
      authorizationEndpoint: value.authorization_endpoint,
      tokenEndpoint: value.token_endpoint,
      jwksUri: value.jwks_uri,
      expiresAtMs: this.#now().getTime() + 3_600_000,
    });
    return this.#discovery;
  }

  async #getJwks(uri: string, signal: AbortSignal): Promise<JSONWebKeySet> {
    if (this.#jwks !== null && this.#jwks.expiresAtMs > this.#now().getTime()) return this.#jwks.value;
    const response = await this.#request(uri, { signal, headers: { accept: 'application/json' } });
    if (!response.ok) throw upstreamUnavailable('EVE SSO signing keys are unavailable.');
    const parsed = jwksSchema.parse(await readJson(response, this.#maxResponseBytes));
    const value: JSONWebKeySet = { keys: parsed.keys };
    this.#jwks = Object.freeze({ value, expiresAtMs: this.#now().getTime() + 3_600_000 });
    return value;
  }

  async #request(url: string, init: RequestInit): Promise<Response> {
    assertLoginUrl(url);
    const timeout = AbortSignal.timeout(this.#timeoutMs);
    const upstreamSignal = init.signal ?? undefined;
    const signal = upstreamSignal === undefined
      ? timeout
      : AbortSignal.any([upstreamSignal, timeout]);
    try {
      return await this.#fetch(url, { ...init, signal, redirect: 'error' });
    } catch (error) {
      if (signal.aborted && upstreamSignal?.aborted === true) throwIfAborted(upstreamSignal);
      throw upstreamUnavailable('EVE SSO is unavailable.', error);
    }
  }
}

function base64Url(value: Uint8Array): string {
  return Buffer.from(value).toString('base64url');
}

function normalizeIssuer(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function assertLoginUrl(value: string): void {
  const url = new URL(value);
  if (url.origin !== LOGIN_ORIGIN || url.protocol !== 'https:' || url.username !== '' || url.password !== '') {
    throw contractMismatch('EVE SSO returned a non-allowlisted endpoint.');
  }
}

async function readJson(response: Response, maximumBytes: number): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!/^application\/json(?:\s*;|$)/iu.test(contentType)) {
    throw contractMismatch('EVE SSO returned a non-JSON response.');
  }
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maximumBytes) throw contractMismatch('EVE SSO response was too large.');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maximumBytes) throw contractMismatch('EVE SSO response was too large.');
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  } catch (error) {
    throw contractMismatch('EVE SSO returned invalid JSON.', error);
  }
}

function isMatchingSigningKey(
  key: JSONWebKeySet['keys'][number],
  algorithm: string,
  keyId: string,
): boolean {
  const expectedKeyType = algorithm === 'RS256' ? 'RSA' : 'EC';
  return key.kid === keyId
    && key.alg === algorithm
    && key.kty === expectedKeyType
    && key.use === 'sig'
    && (!Array.isArray(key.key_ops) || key.key_ops.includes('verify'));
}

function classifyJwtVerificationFailure(
  error: unknown,
): DiagnosticCode {
  const code = property(error, 'code');
  if (code === 'ERR_JOSE_ALG_NOT_ALLOWED') return 'JWT_ALGORITHM_NOT_ALLOWED';
  if (code === 'ERR_JWKS_NO_MATCHING_KEY') return 'JWT_SIGNING_KEY_NOT_FOUND';
  if (code === 'ERR_JWKS_MULTIPLE_MATCHING_KEYS') return 'JWT_SIGNING_KEY_AMBIGUOUS';
  if (code === 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED') return 'JWT_SIGNATURE_INVALID';
  if (code === 'ERR_JWT_EXPIRED') return 'JWT_EXPIRED';
  if (code === 'ERR_JWS_INVALID' || code === 'ERR_JWT_INVALID') return 'JWT_MALFORMED';
  if (code === 'ERR_JWT_CLAIM_VALIDATION_FAILED') {
    const claim = property(error, 'claim');
    if (claim === 'iss') return 'JWT_ISSUER_INVALID';
    if (claim === 'nbf') return 'JWT_NOT_ACTIVE';
    return 'JWT_REQUIRED_CLAIM_MISSING';
  }
  return 'JWT_CRYPTO_OPERATION_FAILED';
}

function property(value: unknown, name: string): string | null {
  if (typeof value !== 'object' || value === null || !(name in value)) return null;
  const propertyValue = (value as Record<string, unknown>)[name];
  return typeof propertyValue === 'string' ? propertyValue : null;
}

function contractMismatch(
  message: string,
  cause?: unknown,
  diagnosticCode?: DiagnosticCode,
): AppError {
  return new AppError({
    code: 'UPSTREAM_CONTRACT_MISMATCH',
    safeMessage: message,
    ...(diagnosticCode === undefined ? {} : { details: { diagnostic_code: diagnosticCode } }),
    cause,
  });
}

function upstreamUnavailable(message: string, cause?: unknown): AppError {
  return new AppError({ code: 'UPSTREAM_SERVICE_FAILED', safeMessage: message, cause });
}
