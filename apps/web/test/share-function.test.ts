import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SECURITY_HEADERS, onRequestGet } from '../functions/s/[[path]]';

// The share tags as Next writes them into out/s/index.html.
const PAGE = [
  '<html><head><title>Mohonaut</title>',
  '<meta property="og:title" content="Mohonaut — Not the moon. The Moho."/>',
  '<meta property="og:image" content="https://mohonaut.com/og.png"/>',
  '<meta property="og:image:alt" content="Mohonaut: Not the moon. The Moho."/>',
  '<meta name="twitter:title" content="Mohonaut — Not the moon. The Moho."/>',
  '<meta name="twitter:image" content="https://mohonaut.com/og.png"/>',
  '<meta name="twitter:image:alt" content="Mohonaut: Not the moon. The Moho."/>',
  '</head><body><main id="main"></main></body></html>',
].join('');
const ADDRESS = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';

async function get(path: string, env: { API_URL?: string } = {}) {
  const res = await onRequestGet({
    request: new Request(`https://mohonaut.com${path}`),
    env: {
      ...env,
      ASSETS: {
        fetch: (input) => {
          expect(String(input)).toBe('https://mohonaut.com/s/');
          return Promise.resolve(
            new Response(PAGE, { headers: { 'content-type': 'text/html', 'content-length': '1' } }),
          );
        },
      },
    },
  });
  return { res, html: await res.text() };
}

const meta = (html: string, key: string) =>
  new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`).exec(html)?.[1];

describe('the public profile Pages Function', () => {
  it("puts the player's own card on a profile link", async () => {
    const { res, html } = await get(`/s/${ADDRESS}`, { API_URL: 'https://api.example/' });
    const card = `https://api.example/cards/${ADDRESS.toLowerCase()}`;
    expect(meta(html, 'og:image')).toBe(card);
    expect(meta(html, 'twitter:image')).toBe(card);
    expect(meta(html, 'og:title')).toBe('A drill site on Mohonaut');
    expect(res.headers.get('content-length')).toBeNull();
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    // The page itself is unchanged apart from the share tags.
    expect(html.replace(/<meta [^>]*>/g, '')).toBe(PAGE.replace(/<meta [^>]*>/g, ''));
  });

  it('leaves the page alone for anything that is not an address', async () => {
    for (const path of ['/s/', '/s/not-an-address', `/s/${ADDRESS}x`, '/s/"><script>']) {
      const { html } = await get(path);
      expect(html).toBe(PAGE);
    }
  });

  it('sets the same security headers as public/_headers', () => {
    const file = readFileSync(join(process.cwd(), 'public/_headers'), 'utf8');
    const block = file.split('/*\n')[1]?.split('\n\n')[0] ?? '';
    const fromFile = Object.fromEntries(
      block
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l !== '')
        .map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1).trim()]),
    );
    expect(SECURITY_HEADERS).toEqual(fromFile);
  });
});
