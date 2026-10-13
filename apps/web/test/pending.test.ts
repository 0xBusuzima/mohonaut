import { beforeEach, describe, expect, it } from 'vitest';
import { forgetTx, pendingTx, rememberTx } from '../src/game/pending';

const A = '0x000000000000000000000000000000000000dEaD';
const HASH = `0x${'ab'.repeat(32)}` as const;

beforeEach(() => window.localStorage.clear());

describe('a sent transaction kept on the device', () => {
  it('is kept per wallet until its receipt is seen', () => {
    expect(pendingTx(A)).toBeNull();
    rememberTx(A, { hash: HASH, done: 'Diesel delivered' });
    expect(pendingTx(A.toUpperCase().replace('0X', '0x'))).toEqual({
      hash: HASH,
      done: 'Diesel delivered',
    });
    forgetTx(A);
    expect(pendingTx(A)).toBeNull();
  });

  it('ignores anything that is not a transaction hash', () => {
    window.localStorage.setItem(`mohonaut.tx.${A.toLowerCase()}`, '{"hash":"0x12","done":"x"}');
    expect(pendingTx(A)).toBeNull();
    window.localStorage.setItem(`mohonaut.tx.${A.toLowerCase()}`, 'not json');
    expect(pendingTx(A)).toBeNull();
  });
});
