/* global HTMLElement */
/**
 * Cloudflare Turnstile (free) for the API's bot-checked writes: sign-in, crew creation and the
 * Survey (services/api security.ts). Tokens are single use, so each write asks for a fresh one.
 * Without NEXT_PUBLIC_TURNSTILE_SITE_KEY (local development) no token is sent and the API, which
 * then has no secret either, does not ask for one.
 */
const SITE_KEY = process.env['NEXT_PUBLIC_TURNSTILE_SITE_KEY'] ?? '';
const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  execute: (id: string) => void;
  reset: (id: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loading: Promise<TurnstileApi> | null = null;

function load(): Promise<TurnstileApi> {
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT;
    s.async = true;
    s.onload = () =>
      window.turnstile === undefined
        ? reject(new Error('turnstile missing'))
        : resolve(window.turnstile);
    s.onerror = () => {
      loading = null;
      reject(new Error('bot check unavailable'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/** A fresh token, or null when Turnstile is not configured. Shows a challenge only if needed. */
export async function turnstileToken(): Promise<string | null> {
  if (SITE_KEY === '') return null;
  const api = await load();
  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.bottom = '16px';
  host.style.right = '16px';
  host.style.zIndex = '60';
  document.body.appendChild(host);
  try {
    return await new Promise<string>((resolve, reject) => {
      const id = api.render(host, {
        sitekey: SITE_KEY,
        appearance: 'interaction-only',
        execution: 'execute',
        callback: (token: string) => resolve(token),
        'error-callback': () => reject(new Error('bot check failed')),
        'timeout-callback': () => reject(new Error('bot check timed out')),
      });
      api.execute(id);
    });
  } finally {
    host.remove();
  }
}
