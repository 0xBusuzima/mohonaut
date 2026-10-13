import type { Hash, TransactionReceipt } from 'viem';
import type { ToastInput } from '../components/Toast';

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

/** Forgets `hash` only: a newer transaction stored meanwhile stays. */
export function forgetTx(address: string, hash: Hash): void {
  if (pendingTx(address)?.hash.toLowerCase() !== hash.toLowerCase()) return;
  try {
    window.localStorage.removeItem(key(address));
  } catch {
    // Storage blocked: nothing was kept.
  }
}

interface ReceiptSource {
  waitForTransactionReceipt: (p: { hash: Hash; timeout: number }) => Promise<TransactionReceipt>;
}

export interface FollowOptions {
  client: ReceiptSource;
  address: string;
  sent: SentTx;
  toast: (t: ToastInput) => void;
  /** Explorer link for the toasts. */
  link: (hash: Hash) => ToastInput['link'];
  /** After it lands successfully (refresh the state). */
  onDone: () => void;
  /** Each wait for the receipt; between waits the player hears it is still on its way. */
  waitMs?: number;
  /** Without a receipt for this long it is given up (dropped or replaced). */
  giveUpMs?: number;
  /** Pause after a failed wait (the RPC down) before asking again. */
  pauseMs?: number;
}

const following = new Map<string, { address: string; done: Promise<boolean> }>();

/** Whether this page is still following a transaction from `address`. */
export function isFollowing(address: string): boolean {
  for (const f of following.values()) if (f.address === address.toLowerCase()) return true;
  return false;
}

/**
 * Follows a sent transaction until its receipt (or until it is given up), says how it went
 * once, and forgets it. Following the same hash twice gives back the same promise, so a resumed
 * transaction and the action that sent it never both report. Resolves true when it succeeded.
 */
export function follow(o: FollowOptions): Promise<boolean> {
  const id = o.sent.hash.toLowerCase();
  const already = following.get(id);
  if (already !== undefined) return already.done;
  const waitMs = o.waitMs ?? 120_000;
  const giveUpMs = o.giveUpMs ?? 3_600_000;
  const pauseMs = o.pauseMs ?? 5_000;
  const link = o.link(o.sent.hash);
  const withLink = link === undefined ? {} : { link };
  const done = (async () => {
    const started = Date.now();
    let told = false;
    for (;;) {
      try {
        const receipt = await o.client.waitForTransactionReceipt({
          hash: o.sent.hash,
          timeout: waitMs,
        });
        forgetTx(o.address, o.sent.hash);
        if (receipt.status === 'success') {
          o.toast({ tone: 'success', title: o.sent.done, ...withLink });
          o.onDone();
          return true;
        }
        o.toast({
          tone: 'warning',
          title: 'Not done',
          body: 'The transaction reverted.',
          ...withLink,
        });
        return false;
      } catch {
        if (Date.now() - started >= giveUpMs) {
          forgetTx(o.address, o.sent.hash);
          o.toast({
            tone: 'warning',
            title: 'No receipt yet',
            body: 'The chain has not confirmed it after an hour. Check it on the explorer.',
            ...withLink,
          });
          return false;
        }
        if (!told) {
          told = true;
          o.toast({
            tone: 'info',
            title: 'Still waiting for the chain',
            body: "It is on its way: please don't send it again.",
            ...withLink,
          });
        }
        await new Promise((r) => setTimeout(r, pauseMs));
      }
    }
  })().finally(() => following.delete(id));
  following.set(id, { address: o.address.toLowerCase(), done });
  return done;
}
