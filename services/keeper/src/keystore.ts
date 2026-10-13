import { createDecipheriv, scryptSync, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Signer } from './chain.js';
import type { KeySource } from './config.js';
import { keccak256, toHex } from 'viem';
import type { Hex } from 'viem';

interface KeystoreV3 {
  version: 3;
  crypto: {
    cipher: 'aes-128-ctr';
    cipherparams: { iv: string };
    ciphertext: string;
    kdf: 'scrypt';
    kdfparams: { dklen: number; n: number; p: number; r: number; salt: string };
    mac: string;
  };
}

/**
 * Decrypts an Ethereum v3 keystore (scrypt, aes-128-ctr), the format of
 * `cast wallet import keeper --interactive` (~/.foundry/keystores/keeper). The key then only
 * lives in memory; on disk it stays encrypted.
 */
export function decryptKeystore(path: string, password: string): Hex {
  const ks = JSON.parse(readFileSync(path, 'utf8')) as KeystoreV3;
  const c = ks.crypto;
  if (ks.version !== 3 || c.kdf !== 'scrypt' || c.cipher !== 'aes-128-ctr') {
    throw new Error('unsupported keystore: expected version 3, scrypt, aes-128-ctr');
  }
  const { dklen, n, p, r, salt } = c.kdfparams;
  const derived = scryptSync(password.normalize('NFKC'), Buffer.from(salt, 'hex'), dklen, {
    N: n,
    r,
    p,
    maxmem: 256 * n * r + 1024 * 1024,
  });
  const ciphertext = Buffer.from(c.ciphertext, 'hex');
  const mac = Buffer.from(
    keccak256(Buffer.concat([derived.subarray(16, 32), ciphertext])).slice(2),
    'hex',
  );
  if (!timingSafeEqual(mac, Buffer.from(c.mac, 'hex'))) throw new Error('wrong keystore password');
  const decipher = createDecipheriv(
    'aes-128-ctr',
    derived.subarray(0, 16),
    Buffer.from(c.cipherparams.iv, 'hex'),
  );
  return toHex(Buffer.concat([decipher.update(ciphertext), decipher.final()]));
}

/** Reads a password from the terminal without echoing it. */
function promptHidden(question: string): Promise<string> {
  const { stdin, stdout } = process;
  if (!stdin.isTTY) {
    return Promise.reject(
      new Error('no terminal for the keystore password: set KEEPER_PASSWORD_FILE'),
    );
  }
  stdout.write(question);
  stdin.setRawMode(true);
  stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    const done = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off('data', onData);
      stdout.write('\n');
    };
    const onData = (chunk: Buffer) => {
      for (const ch of chunk.toString('utf8')) {
        if (ch === '\r' || ch === '\n') {
          done();
          resolve(value);
          return;
        }
        if (ch === '\u0003') {
          done();
          reject(new Error('cancelled'));
          return;
        }
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on('data', onData);
  });
}

export async function resolveKey(source: KeySource): Promise<Signer> {
  if ('address' in source || 'privateKey' in source) return source;
  const password =
    source.passwordFile === null
      ? await promptHidden('Keeper keystore password: ')
      : readFileSync(source.passwordFile, 'utf8').replace(/\r?\n$/, '');
  return { privateKey: decryptKeystore(source.keystore, password) };
}
