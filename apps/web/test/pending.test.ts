import type { Hash, TransactionReceipt } from 'viem';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToastInput } from '../src/components/Toast';
import { follow, forgetTx, isFollowing, pendingTx, rememberTx } from '../src/game/pending';

const A = '0x000000000000000000000000000000000000dEaD';
const HASH: Hash = `0x${'ab'.repeat(32)}`;
const NEWER: Hash = `0x${'cd'.repeat(32)}`;

beforeEach(() => window.localStorage.clear());

describe('a sent transaction kept on the device', () => {
  it('is kept per wallet until its receipt is seen', () => {
    expect(pendingTx(A)).toBeNull();
    rememberTx(A, { hash: HASH, done: 'Diesel delivered' });
    expect(pendingTx(A.toLowerCase())).toEqual({ hash: HASH, done: 'Diesel delivered' });
    forgetTx(A, HASH);
    expect(pendingTx(A)).toBeNull();
  });

  it('forgets only its own hash: a newer transaction stored meanwhile stays', () => {
    rememberTx(A, { hash: NEWER, done: 'Rig installed' });
    forgetTx(A, HASH);
    expect(pendingTx(A)?.hash).toBe(NEWER);
  });

  it('ignores anything that is not a transaction hash', () => {
    window.localStorage.setItem(`mohonaut.tx.${A.toLowerCase()}`, '{"hash":"0x12","done":"x"}');
    expect(pendingTx(A)).toBeNull();
    window.localStorage.setItem(`mohonaut.tx.${A.toLowerCase()}`, 'not json');
    expect(pendingTx(A)).toBeNull();
  });
});

/** A chain that times out `misses` times, then returns a receipt with `status`. */
function chain(misses: number, status: 'success' | 'reverted') {
  let calls = 0;
  return {
    calls: () => calls,
    waitForTransactionReceipt: () => {
      calls += 1;
      return calls <= misses
        ? Promise.reject(new Error('timed out'))
        : Promise.resolve({ status } as TransactionReceipt);
    },
  };
}

function setup(client: ReturnType<typeof chain>, hash: Hash = HASH) {
  const toasts: ToastInput[] = [];
  const onDone = vi.fn();
  rememberTx(A, { hash, done: 'Diesel delivered' });
  const options = {
    client,
    address: A,
    sent: { hash, done: 'Diesel delivered' },
    toast: (t: ToastInput) => toasts.push(t),
    link: (h: Hash) => ({ href: `https://explorer.example/tx/${h}`, label: 'View' }),
    onDone,
    waitMs: 1,
    pauseMs: 0,
  };
  return { toasts, onDone, options };
}

describe('following a sent transaction', () => {
  it('says once that it is still on its way, then reports it landed and forgets it', async () => {
    const client = chain(3, 'success');
    const { toasts, onDone, options } = setup(client);
    const first = follow(options);
    // The page that sent it and the resume after a reload follow the same promise.
    const second = follow(options);
    expect(isFollowing(A)).toBe(true);
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(toasts.map((t) => t.title)).toEqual(['Still waiting for the chain', 'Diesel delivered']);
    expect(toasts[1]?.link?.href).toBe(`https://explorer.example/tx/${HASH}`);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(client.calls()).toBe(4);
    expect(pendingTx(A)).toBeNull();
    expect(isFollowing(A)).toBe(false);
  });

  it('reports a revert without refreshing as a success', async () => {
    const { toasts, onDone, options } = setup(chain(0, 'reverted'));
    expect(await follow(options)).toBe(false);
    expect(toasts.map((t) => t.title)).toEqual(['Not done']);
    expect(onDone).not.toHaveBeenCalled();
    expect(pendingTx(A)).toBeNull();
  });

  it('gives up after its time (dropped or replaced) and stops blocking new actions', async () => {
    const { toasts, options } = setup(chain(1_000, 'success'), NEWER);
    expect(await follow({ ...options, sent: { ...options.sent, hash: NEWER }, giveUpMs: 0 })).toBe(
      false,
    );
    expect(toasts.map((t) => t.title)).toEqual(['No receipt yet']);
    expect(pendingTx(A)).toBeNull();
    expect(isFollowing(A)).toBe(false);
  });
});
