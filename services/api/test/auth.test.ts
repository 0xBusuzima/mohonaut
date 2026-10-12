import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import { describe, expect, it } from 'vitest';
import { externalAuthVerifier } from '../src/auth/external.js';
import { ORIGIN, T0, call, harness, newWallet, siweMessage, signIn } from './helpers.js';

async function nonce(h: Awaited<ReturnType<typeof harness>>) {
  return String((await call(h, 'GET', '/auth/nonce')).json['nonce']);
}

describe('Sign-In with Ethereum', () => {
  it('signs in, reports the player, and signs out', async () => {
    const h = await harness();
    const wallet = newWallet();
    const cookie = await signIn(h, wallet);
    expect(cookie).toMatch(/^mohn_session=/);
    const me = await call(h, 'GET', '/me', { cookie });
    expect(me.status).toBe(200);
    expect(me.json).toMatchObject({ wallet: wallet.address, roles: [], crewId: null });
    // Signing in again keeps the same user.
    const again = await signIn(h, wallet);
    expect((await call(h, 'GET', '/me', { cookie: again })).json['id']).toBe(me.json['id']);

    expect((await call(h, 'POST', '/auth/logout', { cookie, body: {} })).status).toBe(200);
    expect((await call(h, 'GET', '/me', { cookie })).status).toBe(401);
  });

  it('sets a hardened session cookie', async () => {
    const h = await harness({ production: true });
    const wallet = newWallet();
    const n = await nonce(h);
    const message = siweMessage(wallet.address, n);
    const res = await call(h, 'POST', '/auth/siwe', {
      body: { message, signature: await wallet.signMessage({ message }) },
    });
    const cookie = res.res.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
  });

  it('refuses replayed nonces, foreign domains, other chains, expired and forged messages', async () => {
    const h = await harness();
    const wallet = newWallet();
    const attempt = async (
      over: Parameters<typeof siweMessage>[2],
      n?: string,
      signer = wallet,
    ) => {
      const message = siweMessage(wallet.address, n ?? (await nonce(h)), over);
      const signature = await signer.signMessage({ message });
      return call(h, 'POST', '/auth/siwe', { body: { message, signature } });
    };
    const n = await nonce(h);
    expect((await attempt({}, n)).status).toBe(200);
    expect((await attempt({}, n)).json.error).toBe('unknown or used nonce');
    expect((await attempt({}, 'abcdefgh12345678')).json.error).toBe('unknown or used nonce');
    expect((await attempt({ domain: 'evil.example' })).json.error).toBe(
      'invalid domain or expired',
    );
    expect((await attempt({ uri: 'https://evil.example' })).json.error).toBe('wrong uri');
    expect((await attempt({ chainId: 4663 })).json.error).toBe('wrong chain');
    expect((await attempt({ expirationTime: new Date(T0 - 1) })).json.error).toBe(
      'invalid domain or expired',
    );
    expect((await attempt({}, undefined, newWallet())).json.error).toBe('bad signature');
  });

  it('expires nonces after 10 minutes', async () => {
    const h = await harness();
    const wallet = newWallet();
    const n = await nonce(h);
    h.clock.now += 601_000;
    const message = siweMessage(wallet.address, n, { expirationTime: new Date(T0 + 3_600_000) });
    const res = await call(h, 'POST', '/auth/siwe', {
      body: { message, signature: await wallet.signMessage({ message }) },
    });
    expect(res.json.error).toBe('unknown or used nonce');
  });

  it('requires the bot check on sign-in', async () => {
    const h = await harness();
    h.turnstileOk.value = false;
    const wallet = newWallet();
    const message = siweMessage(wallet.address, await nonce(h));
    const res = await call(h, 'POST', '/auth/siwe', {
      body: { message, signature: await wallet.signMessage({ message }) },
    });
    expect(res.status).toBe(403);
  });
});

describe('CSRF defences', () => {
  it('refuses writes from another origin or without JSON', async () => {
    const h = await harness();
    const cookie = await signIn(h, newWallet());
    const foreign = await call(h, 'PATCH', '/me', {
      cookie,
      body: { displayName: 'mallory' },
      headers: { origin: 'https://evil.example' },
    });
    expect(foreign.status).toBe(403);
    const form = await h.app.request('/me', {
      method: 'PATCH',
      headers: { origin: ORIGIN, cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: 'displayName=mallory',
    });
    expect(form.status).toBe(415);
  });
});

describe('display names', () => {
  it('validates and keeps them unique (case-insensitive)', async () => {
    const h = await harness();
    const a = await signIn(h, newWallet());
    const b = await signIn(h, newWallet());
    expect(
      (await call(h, 'PATCH', '/me', { cookie: a, body: { displayName: 'Driller_1' } })).status,
    ).toBe(200);
    expect(
      (await call(h, 'PATCH', '/me', { cookie: b, body: { displayName: 'driller_1' } })).status,
    ).toBe(409);
    expect(
      (await call(h, 'PATCH', '/me', { cookie: b, body: { displayName: 'no spaces' } })).status,
    ).toBe(400);
    expect((await call(h, 'GET', '/me', { cookie: a })).json['displayName']).toBe('Driller_1');
  });
});

describe('external (e-mail) login adapter', () => {
  it('accepts tokens of the configured issuer and audience only', async () => {
    const { publicKey, privateKey } = await generateKeyPair('ES256');
    const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'ES256' };
    const verifier = externalAuthVerifier(
      { name: 'privy', issuer: 'privy.io', audience: 'app-1', jwksUrl: 'https://unused' },
      createLocalJWKSet({ keys: [jwk] }),
    );
    const token = (iss: string, aud: string) =>
      new SignJWT({})
        .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
        .setSubject('did:privy:abc')
        .setIssuer(iss)
        .setAudience(aud)
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(privateKey);
    expect(await verifier.verify(await token('privy.io', 'app-1'))).toBe('did:privy:abc');
    expect(await verifier.verify(await token('other.io', 'app-1'))).toBeNull();
    expect(await verifier.verify(await token('privy.io', 'app-2'))).toBeNull();
    expect(await verifier.verify('not-a-jwt')).toBeNull();

    const h = await harness();
    h.deps.externalAuth = verifier;
    const res = await call(h, 'POST', '/auth/external', {
      body: { token: await token('privy.io', 'app-1') },
    });
    expect(res.status).toBe(200);
    const cookie = (res.res.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    expect((await call(h, 'GET', '/me', { cookie })).json).toMatchObject({ wallet: null });
  });

  it('is off unless configured', async () => {
    const h = await harness();
    expect((await call(h, 'POST', '/auth/external', { body: { token: 'x' } })).status).toBe(404);
  });
});
