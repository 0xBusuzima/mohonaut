import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PARAM_NAMES } from '../src/index.js';

describe('PARAM_NAMES', () => {
  it('lists MiningCore.Param in declaration order', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../../../contracts/src/MiningCore.sol', import.meta.url)),
      'utf8',
    );
    const body = /enum Param \{([^}]*)\}/.exec(source)?.[1] ?? '';
    const names = body
      .split('\n')
      .map((line) => line.replace(/\/\/.*/, '').trim())
      .join('')
      .split(',')
      .map((name) => name.trim())
      .filter((name) => name.length > 0);
    expect(names).toEqual([...PARAM_NAMES]);
  });
});
