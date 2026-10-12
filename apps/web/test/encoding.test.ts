import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Every source file below `dir` with one of the extensions. */
function files(dir: string, ext: RegExp): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path, ext);
    return ext.test(name) ? [path] : [];
  });
}

const BOM = String.fromCharCode(0xfeff);
// UTF-8 read as Windows-1252 and saved again: a middle dot becomes "A-circumflex + middle dot",
// an approximately-equal sign becomes "a-circumflex + per-mille + ...", a dash "a-circumflex + euro".
const DOUBLE_ENCODED = new RegExp('\\u00C2[\\u00A0-\\u00BF]|\\u00E2\\u20AC|\\u00E2\\u2030');

describe('source encoding', () => {
  it('has no double-encoded UTF-8 and no byte order mark', () => {
    const bad = files(join(__dirname, '..', 'src'), /\.(ts|tsx|css|mdx)$/).filter((f) => {
      const text = readFileSync(f, 'utf8');
      return text.startsWith(BOM) || DOUBLE_ENCODED.test(text);
    });
    expect(bad).toEqual([]);
  });
});
