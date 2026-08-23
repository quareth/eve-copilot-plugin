import {
  exportJWK,
  generateKeyPair,
  generateSecret,
  SignJWT,
  type JSONWebKeySet,
} from 'jose';
import { describe, expect, it } from 'vitest';
import { EveSsoGateway } from '../../../src/infrastructure/sso/eve-sso-gateway.js';

const signal = new AbortController().signal;
const clientId = 'test-client-id';
const scopes = ['esi-location.read_location.v1', 'esi-location.read_ship_type.v1'];

describe('EveSsoGateway', () => {
  it('creates PKCE authorization material and strictly verifies an exchanged JWT', async () => {
    const fixture = await signedFixture([clientId, 'EVE Online']);
    const requests: string[] = [];
    const gateway = new EveSsoGateway({
      fetch: makeSsoFetch(fixture.token, fixture.jwk, requests),
      timeoutMs: 5_000,
      maxResponseBytes: 1_048_576,
    });
    const material = await gateway.beginAuthorization({
      clientId,
      redirectUri: 'http://127.0.0.1:17600/oauth/callback',
      scopes,
      signal,
    });
    const authorization = new URL(material.authorizationUrl);
    expect(authorization.origin).toBe('https://login.eveonline.com');
    expect(authorization.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authorization.searchParams.get('state')).toBe(material.state);
    expect(material.state).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(material.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/u);

    const grant = await gateway.exchangeCode({
      clientId,
      redirectUri: 'http://127.0.0.1:17600/oauth/callback',
      code: 'one-time-code',
      verifier: material.verifier,
      expectedScopes: scopes,
      signal,
    });
    expect(grant).toMatchObject({
      characterId: 90000001,
      characterName: 'Verified Pilot',
      refreshToken: 'refresh-token',
      grantedScopes: scopes,
    });
    expect(requests.filter((url) => url.endsWith('/v2/oauth/token'))).toHaveLength(1);
  });

  it('accepts EVE JWKS extension metadata but passes only signing keys to verification', async () => {
    const fixture = await signedFixture([clientId, 'EVE Online']);
    const gateway = new EveSsoGateway({
      fetch: makeSsoFetch(fixture.token, fixture.jwk, [], {
        SkipUnresolvedJsonWebKeys: true,
      }),
      timeoutMs: 5_000,
      maxResponseBytes: 1_048_576,
    });
    await expect(gateway.exchangeCode({
      clientId,
      redirectUri: 'http://127.0.0.1:17600/oauth/callback',
      code: 'one-time-code',
      verifier: 'verifier',
      expectedScopes: scopes,
      signal,
    })).resolves.toMatchObject({ characterId: 90000001 });
  });

  it('fails closed on a JWT audience mismatch', async () => {
    const fixture = await signedFixture(['wrong-client', 'EVE Online']);
    const gateway = new EveSsoGateway({
      fetch: makeSsoFetch(fixture.token, fixture.jwk, []),
      timeoutMs: 5_000,
      maxResponseBytes: 1_048_576,
    });
    await expect(gateway.exchangeCode({
      clientId,
      redirectUri: 'http://127.0.0.1:17600/oauth/callback',
      code: 'one-time-code',
      verifier: 'verifier',
      expectedScopes: scopes,
      signal,
    })).rejects.toMatchObject({ code: 'UPSTREAM_CONTRACT_MISMATCH' });
  });

  it.each([
    'https://login.eveonline.com/',
    'login.eveonline.com',
  ])('accepts documented alternate JWT issuer %s', async (issuer) => {
    const fixture = await signedFixture([clientId, 'EVE Online'], issuer);
    const gateway = new EveSsoGateway({
      fetch: makeSsoFetch(fixture.token, fixture.jwk, []),
      timeoutMs: 5_000,
      maxResponseBytes: 1_048_576,
    });
    await expect(gateway.exchangeCode({
      clientId,
      redirectUri: 'http://127.0.0.1:17600/oauth/callback',
      code: 'one-time-code',
      verifier: 'verifier',
      expectedScopes: scopes,
      signal,
    })).resolves.toMatchObject({ characterId: 90000001 });
  });

  it('fails closed on an issuer outside the exact allowlist', async () => {
    const fixture = await signedFixture(
      [clientId, 'EVE Online'],
      'https://login.eveonline.com.attacker.example',
    );
    const gateway = new EveSsoGateway({
      fetch: makeSsoFetch(fixture.token, fixture.jwk, []),
      timeoutMs: 5_000,
      maxResponseBytes: 1_048_576,
    });
    await expect(gateway.exchangeCode({
      clientId,
      redirectUri: 'http://127.0.0.1:17600/oauth/callback',
      code: 'one-time-code',
      verifier: 'verifier',
      expectedScopes: scopes,
      signal,
    })).rejects.toMatchObject({
      code: 'UPSTREAM_CONTRACT_MISMATCH',
      details: { diagnostic_code: 'JWT_ISSUER_INVALID' },
    });
  });

  it('accepts an ES256 access token signed by an allowlisted EVE JWKS key', async () => {
    const fixture = await signedFixture([clientId, 'EVE Online'], undefined, 'ES256');
    const gateway = new EveSsoGateway({
      fetch: makeSsoFetch(fixture.token, fixture.jwk, []),
      timeoutMs: 5_000,
      maxResponseBytes: 1_048_576,
    });
    await expect(gateway.exchangeCode({
      clientId,
      redirectUri: 'http://127.0.0.1:17600/oauth/callback',
      code: 'one-time-code',
      verifier: 'verifier',
      expectedScopes: scopes,
      signal,
    })).resolves.toMatchObject({ characterId: 90000001 });
  });

  it('rejects a symmetric access-token signing algorithm', async () => {
    const fixture = await symmetricFixture([clientId, 'EVE Online']);
    const gateway = new EveSsoGateway({
      fetch: makeSsoFetch(fixture.token, fixture.jwk, []),
      timeoutMs: 5_000,
      maxResponseBytes: 1_048_576,
    });
    await expect(gateway.exchangeCode({
      clientId,
      redirectUri: 'http://127.0.0.1:17600/oauth/callback',
      code: 'one-time-code',
      verifier: 'verifier',
      expectedScopes: scopes,
      signal,
    })).rejects.toMatchObject({
      code: 'UPSTREAM_CONTRACT_MISMATCH',
      details: { diagnostic_code: 'JWT_ALGORITHM_NOT_ALLOWED' },
    });
  });

  it('classifies a token signed by the wrong asymmetric key', async () => {
    const tokenFixture = await signedFixture([clientId, 'EVE Online']);
    const keyFixture = await signedFixture([clientId, 'EVE Online']);
    const gateway = new EveSsoGateway({
      fetch: makeSsoFetch(tokenFixture.token, keyFixture.jwk, []),
      timeoutMs: 5_000,
      maxResponseBytes: 1_048_576,
    });
    await expect(gateway.exchangeCode({
      clientId,
      redirectUri: 'http://127.0.0.1:17600/oauth/callback',
      code: 'one-time-code',
      verifier: 'verifier',
      expectedScopes: scopes,
      signal,
    })).rejects.toMatchObject({
      code: 'UPSTREAM_CONTRACT_MISMATCH',
      details: { diagnostic_code: 'JWT_SIGNATURE_INVALID' },
    });
  });

  it('classifies a token whose key ID is absent from JWKS', async () => {
    const fixture = await signedFixture([clientId, 'EVE Online']);
    const jwk = { ...fixture.jwk, kid: 'different-key' };
    const gateway = new EveSsoGateway({
      fetch: makeSsoFetch(fixture.token, jwk, []),
      timeoutMs: 5_000,
      maxResponseBytes: 1_048_576,
    });
    await expect(gateway.exchangeCode({
      clientId,
      redirectUri: 'http://127.0.0.1:17600/oauth/callback',
      code: 'one-time-code',
      verifier: 'verifier',
      expectedScopes: scopes,
      signal,
    })).rejects.toMatchObject({
      code: 'UPSTREAM_CONTRACT_MISMATCH',
      details: { diagnostic_code: 'JWT_SIGNING_KEY_NOT_FOUND' },
    });
  });
});

async function signedFixture(
  audience: string[],
  issuer = 'https://login.eveonline.com',
  algorithm: 'RS256' | 'ES256' = 'RS256',
): Promise<{
  readonly token: string;
  readonly jwk: JSONWebKeySet['keys'][number];
}> {
  const pair = await generateKeyPair(algorithm);
  const publicJwk = await exportJWK(pair.publicKey);
  const jwk: JSONWebKeySet['keys'][number] = {
    ...publicJwk, kid: 'test-key', alg: algorithm, use: 'sig',
  };
  const now = Math.floor(Date.now() / 1_000);
  const token = await new SignJWT({
    name: 'Verified Pilot',
    scp: scopes,
  })
    .setProtectedHeader({ alg: algorithm, kid: 'test-key', typ: 'JWT' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject('CHARACTER:EVE:90000001')
    .setIssuedAt(now)
    .setExpirationTime(now + 1_200)
    .sign(pair.privateKey);
  return { token, jwk };
}

async function symmetricFixture(audience: string[]): Promise<{
  readonly token: string;
  readonly jwk: JSONWebKeySet['keys'][number];
}> {
  const secret = await generateSecret('HS256', { extractable: true });
  const exported = await exportJWK(secret);
  const jwk: JSONWebKeySet['keys'][number] = {
    ...exported, kid: 'symmetric-test-key', alg: 'HS256', use: 'sig',
  };
  const now = Math.floor(Date.now() / 1_000);
  const token = await new SignJWT({ name: 'Verified Pilot', scp: scopes })
    .setProtectedHeader({ alg: 'HS256', kid: 'symmetric-test-key', typ: 'JWT' })
    .setIssuer('https://login.eveonline.com')
    .setAudience(audience)
    .setSubject('CHARACTER:EVE:90000001')
    .setIssuedAt(now)
    .setExpirationTime(now + 1_200)
    .sign(secret);
  return { token, jwk };
}

function makeSsoFetch(
  token: string,
  jwk: JSONWebKeySet['keys'][number],
  requests: string[],
  jwksExtensions: Readonly<Record<string, unknown>> = {},
): typeof fetch {
  return (input) => {
    const url = urlOf(input);
    requests.push(url);
    if (url.endsWith('/.well-known/oauth-authorization-server')) {
      return Promise.resolve(jsonResponse({
        issuer: 'https://login.eveonline.com',
        authorization_endpoint: 'https://login.eveonline.com/v2/oauth/authorize',
        token_endpoint: 'https://login.eveonline.com/v2/oauth/token',
        jwks_uri: 'https://login.eveonline.com/oauth/jwks',
        code_challenge_methods_supported: ['S256'],
      }));
    }
    if (url.endsWith('/v2/oauth/token')) {
      return Promise.resolve(jsonResponse({
        access_token: token,
        refresh_token: 'refresh-token',
        token_type: 'Bearer',
        expires_in: 1200,
      }));
    }
    if (url.endsWith('/oauth/jwks')) {
      return Promise.resolve(jsonResponse({ ...jwksExtensions, keys: [jwk] }));
    }
    return Promise.resolve(new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } }));
  };
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function urlOf(input: string | URL | Request): string {
  return input instanceof Request ? input.url : input.toString();
}
