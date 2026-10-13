import { getConnInfo } from '@hono/node-server/conninfo';
import type { MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv, TurnstileVerifier } from './context.js';

/** Client IP: Cloudflare's header when we sit behind it, else the socket address. */
export const clientIp: MiddlewareHandler<AppEnv> = async (c, next) => {
  let ip = 'unknown';
  if (c.var.deps.cfg.trustCloudflare) ip = c.req.header('cf-connecting-ip') ?? ip;
  else {
    try {
      ip = getConnInfo(c).remote.address ?? ip;
    } catch {
      // app.request() in tests has no socket
      ip = c.req.header('x-test-ip') ?? 'test';
    }
  }
  c.set('ip', ip);
  await next();
};

/**
 * CSRF defence for cookie sessions: state-changing requests must come from the game's origin
 * and carry JSON (a cross-site form cannot send application/json without a CORS preflight).
 */
export const sameOriginWrites: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    if (c.req.header('origin') !== c.var.deps.cfg.webOrigin) {
      throw new HTTPException(403, { message: 'cross-origin request refused' });
    }
    const type = c.req.header('content-type') ?? '';
    if (c.req.method !== 'DELETE' && !type.startsWith('application/json')) {
      throw new HTTPException(415, { message: 'expected application/json' });
    }
  }
  await next();
};

/**
 * Fixed-window rate limit. `scope` names the limit; the key is the client IP, or the user when
 * `perUser` is set and someone is signed in.
 */
export function rateLimit(
  scope: string,
  limit: number,
  windowSeconds: number,
  perUser = false,
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.var.user;
    const who = perUser && user !== null ? `u:${user.id}` : `ip:${c.var.ip}`;
    const window = Math.floor(c.var.deps.now() / 1000 / windowSeconds);
    const count = await c.var.deps.store.incr(`rl:${scope}:${who}:${window}`, windowSeconds);
    c.header('RateLimit-Limit', String(limit));
    c.header('RateLimit-Remaining', String(Math.max(0, limit - count)));
    if (count > limit) {
      c.header('Retry-After', String(windowSeconds));
      throw new HTTPException(429, { message: 'too many requests' });
    }
    await next();
  };
}

/** Cloudflare Turnstile on endpoints bots would abuse (sign-in, Survey, crew creation). */
export const turnstile: MiddlewareHandler<AppEnv> = async (c, next) => {
  const verifier = c.var.deps.turnstile;
  if (verifier !== null) {
    const token = c.req.header('cf-turnstile-response') ?? '';
    if (token.length === 0 || !(await verifier.verify(token, c.var.ip))) {
      throw new HTTPException(403, { message: 'bot check failed' });
    }
  }
  await next();
};

export function turnstileVerifier(secret: string): TurnstileVerifier {
  return {
    async verify(token, ip) {
      const body = new URLSearchParams({ secret, response: token, remoteip: ip });
      const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        body,
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { success?: boolean };
      return data.success === true;
    },
  };
}
