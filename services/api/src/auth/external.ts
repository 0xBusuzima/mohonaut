import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { JWTVerifyGetKey } from 'jose';
import type { ExternalAuthConfig } from '../config.js';

/**
 * Optional e-mail / Google login through an embedded-wallet provider (Dynamic or Privy, docs/03
 * §4.2). Both issue a signed JWT; we verify it against the provider's JWKS and keep our own
 * users table, so switching providers is a configuration change.
 */
export interface ExternalAuthVerifier {
  name: string;
  /** The provider's user id (JWT `sub`) when the token is valid, else null. */
  verify(token: string): Promise<string | null>;
}

export function externalAuthVerifier(
  cfg: ExternalAuthConfig,
  keys: JWTVerifyGetKey = createRemoteJWKSet(new URL(cfg.jwksUrl)),
): ExternalAuthVerifier {
  return {
    name: cfg.name,
    async verify(token) {
      try {
        const { payload } = await jwtVerify(token, keys, {
          issuer: cfg.issuer,
          audience: cfg.audience,
        });
        return typeof payload.sub === 'string' && payload.sub.length > 0 ? payload.sub : null;
      } catch {
        return null;
      }
    },
  };
}
