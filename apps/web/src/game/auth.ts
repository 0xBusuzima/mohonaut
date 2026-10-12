import { createAuthenticationAdapter } from '@rainbow-me/rainbowkit';
import { createSiweMessage } from 'viem/siwe';
import { API_URL } from '../lib/site';

/** Shown in the wallet next to the signature request (docs/05 §3.5). */
const SIWE_STATEMENT = 'This signature only logs you in. It cannot move funds.';

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Sign-In with Ethereum against the API (services/api /auth/*). Playing needs only a connected
 * wallet; signing in unlocks the off-chain parts (crew, Survey, profile name).
 */
export const siweAdapter = createAuthenticationAdapter({
  getNonce: async () => {
    const res = await fetch(`${API_URL}/auth/nonce`, { credentials: 'include' });
    const { nonce } = (await res.json()) as { nonce: string };
    return nonce;
  },
  createMessage: ({ nonce, address, chainId }) =>
    createSiweMessage({
      domain: window.location.host,
      address,
      statement: SIWE_STATEMENT,
      uri: window.location.origin,
      version: '1',
      chainId,
      nonce,
      issuedAt: new Date(),
      expirationTime: new Date(Date.now() + 10 * 60 * 1000),
    }),
  verify: async ({ message, signature }) => (await post('/auth/siwe', { message, signature })).ok,
  signOut: async () => {
    await post('/auth/logout', {});
  },
});

export async function sessionActive(): Promise<boolean> {
  if (API_URL === '') return false;
  try {
    return (await fetch(`${API_URL}/me`, { credentials: 'include' })).ok;
  } catch {
    return false;
  }
}
