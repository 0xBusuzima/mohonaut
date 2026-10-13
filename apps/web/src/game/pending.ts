import type { Hash } from 'viem';

/** A sent transaction whose receipt this device has not seen yet. */
export interface SentTx {
  hash: Hash;
  /** What the toast says when it lands, e.g. "Diesel delivered". */
  done: string;
}

const key = (address: string) => `mohonaut.tx.${address.toLowerCase()}`;
const HASH = /^0x[0-9a-f]{64}$/i;

export function rememberTx(address: string, tx: SentTx): void {
  try {
    window.localStorage.setItem(key(address), JSON.stringify(tx));
  } catch {
    // Storage blocked: only this page keeps track of it.
  }
}

export function pendingTx(address: string): SentTx | null {
  try {
    const raw = window.localStorage.getItem(key(address));
    if (raw === null) return null;
    const tx = JSON.parse(raw) as Partial<SentTx>;
    return typeof tx.hash === 'string' && HASH.test(tx.hash) && typeof tx.done === 'string'
      ? { hash: tx.hash, done: tx.done }
      : null;
  } catch {
    return null;
  }
}

export function forgetTx(address: string): void {
  try {
    window.localStorage.removeItem(key(address));
  } catch {
    // Storage blocked: nothing was kept.
  }
}
