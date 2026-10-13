/**
 * Cloudflare Pages Function (free tier) for public profiles, /s/<address>: the one static
 * profile page, with the player's own contribution card (the API's /cards/<address>) as the
 * share image, so a profile or invite link posted on X shows that player's card.
 * Pages does not apply public/_headers to Function responses: the same headers are set here
 * (test/share-function.test.ts checks they match).
 */

interface Env {
  ASSETS: { fetch: (input: URL | Request | string) => Promise<Response> };
  /** The public API, e.g. https://api.mohonaut.com (a Pages environment variable). */
  API_URL?: string;
}

const DEFAULT_API = 'https://api.mohonaut.com';
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** public/_headers, the `/*` block. */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy':
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
  'Content-Security-Policy': "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
};

function setMeta(html: string, attr: 'property' | 'name', key: string, value: string): string {
  const tag = new RegExp(`(<meta ${attr}="${key}" content=")[^"]*(")`);
  return html.replace(tag, (_, open: string, close: string) => `${open}${value}${close}`);
}

/** The profile page with the player's card as its share image (address already checked). */
export function withCard(html: string, address: string, api: string): string {
  const card = `${api}/cards/${address}`;
  const alt = `World Bore contribution card of ${address.slice(0, 6)}…${address.slice(-4)}`;
  let out = html;
  for (const [attr, prefix] of [
    ['property', 'og'],
    ['name', 'twitter'],
  ] as const) {
    out = setMeta(out, attr, `${prefix}:image`, card);
    out = setMeta(out, attr, `${prefix}:image:alt`, alt);
    out = setMeta(out, attr, `${prefix}:title`, 'A drill site on Mohonaut');
  }
  return out;
}

export async function onRequestGet({
  request,
  env,
}: {
  request: Request;
  env: Env;
}): Promise<Response> {
  const url = new URL(request.url);
  const page = await env.ASSETS.fetch(new URL('/s/', url));
  const address = url.pathname.split('/')[2] ?? '';
  const html = await page.text();
  const headers = new Headers(page.headers);
  // The body changes: the asset's length, encoding and tag no longer describe it.
  for (const k of ['content-length', 'content-encoding', 'etag']) headers.delete(k);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
  const api = (env.API_URL ?? DEFAULT_API).replace(/\/$/, '');
  return new Response(
    page.ok && ADDRESS.test(address) ? withCard(html, address.toLowerCase(), api) : html,
    { status: page.status, headers },
  );
}
