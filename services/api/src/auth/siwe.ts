import { getAddress, recoverMessageAddress } from 'viem';
import type { Address, Hex, PublicClient } from 'viem';
import { parseSiweMessage, validateSiweMessage } from 'viem/siwe';

export interface SignatureVerifier {
  /** True when `signature` over `message` is valid for `address` (EOA or smart wallet). */
  verify(address: Address, message: string, signature: Hex): Promise<boolean>;
}

/**
 * EOAs are checked locally (ecrecover). Smart-contract wallets (EIP-1271, EIP-6492) need a call
 * to the chain, so they are accepted only when an RPC client is configured.
 */
export function signatureVerifier(client: PublicClient | null): SignatureVerifier {
  return {
    async verify(address, message, signature) {
      try {
        if ((await recoverMessageAddress({ message, signature })) === address) return true;
      } catch {
        // not a plain ECDSA signature: try the wallet contract below
      }
      if (client === null) return false;
      return client.verifyMessage({ address, message, signature });
    },
  };
}

export type SiweResult =
  { ok: true; address: Address; nonce: string } | { ok: false; reason: string };

/**
 * Sign-In with Ethereum (EIP-4361): the message must be for our domain and URI origin, the
 * expected chain, unexpired, carry a nonce we issued (checked by the caller) and be signed by
 * its address.
 */
export async function checkSiwe(p: {
  message: string;
  signature: Hex;
  domain: string;
  origin: string;
  chainId: number;
  now: Date;
  verifier: SignatureVerifier;
}): Promise<SiweResult> {
  const parsed = parseSiweMessage(p.message);
  if (parsed.address === undefined || parsed.nonce === undefined) {
    return { ok: false, reason: 'malformed message' };
  }
  if (parsed.chainId !== p.chainId) return { ok: false, reason: 'wrong chain' };
  if (parsed.uri === undefined || new URL(parsed.uri).origin !== p.origin) {
    return { ok: false, reason: 'wrong uri' };
  }
  if (!validateSiweMessage({ message: parsed, domain: p.domain, time: p.now })) {
    return { ok: false, reason: 'invalid domain or expired' };
  }
  const address = getAddress(parsed.address);
  if (!(await p.verifier.verify(address, p.message, p.signature))) {
    return { ok: false, reason: 'bad signature' };
  }
  return { ok: true, address, nonce: parsed.nonce };
}
