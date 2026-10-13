import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
// @ts-expect-error -- plain ESM build script without type declarations
import { buildPolicy, inlineScriptHashes, withPolicy } from '../scripts/csp.mjs';

const sha = (s: string) => `sha256-${createHash('sha256').update(s).digest('base64')}`;

describe('Content-Security-Policy build step', () => {
  const html =
    '<html><head><title>x</title><script src="/a.js"></script><script>self.a=1</script></head>' +
    '<body><script id="b">self.b=2</script><script>self.a=1</script><script></script></body></html>';

  it('hashes each distinct inline script and skips external and empty ones', () => {
    expect(inlineScriptHashes(html)).toEqual([sha('self.a=1'), sha('self.b=2')]);
  });

  it('allows only self, the page hashes and Turnstile to run scripts; never eval', () => {
    const p = buildPolicy(['sha256-x'], {});
    expect(p).toContain("script-src 'self' 'sha256-x' https://challenges.cloudflare.com;");
    expect(p).not.toMatch(/unsafe-eval|script-src[^;]*unsafe-inline/);
    expect(p).toContain("object-src 'none'");
  });

  it('opens connect-src to the configured API, RPC and error reporting hosts only', () => {
    const p = buildPolicy([], {
      NEXT_PUBLIC_API_URL: 'https://api.mohonaut.com/v1',
      NEXT_PUBLIC_RPC_URL: 'http://127.0.0.1:18546',
      NEXT_PUBLIC_SENTRY_DSN: 'https://abc123@o1.ingest.sentry.io/42',
    });
    const connect = p.split('; ').find((d: string) => d.startsWith('connect-src')) ?? '';
    expect(connect).toContain('https://api.mohonaut.com');
    expect(connect).toContain('http://127.0.0.1:18546');
    expect(connect).toContain('https://o1.ingest.sentry.io');
    expect(connect).not.toContain('abc123');
  });

  it('puts the meta first in head and replaces an earlier one', () => {
    const once = withPolicy(html, "default-src 'self'");
    expect(once.startsWith('<html><head><meta http-equiv="Content-Security-Policy"')).toBe(true);
    const twice = withPolicy(once, "default-src 'none'");
    expect(twice.match(/Content-Security-Policy/g)).toHaveLength(1);
    expect(twice).toContain("default-src 'none'");
  });
});
