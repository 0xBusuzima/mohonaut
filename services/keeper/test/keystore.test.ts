import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { privateKeyToAccount } from 'viem/accounts';
import { describe, expect, it } from 'vitest';
import { decryptKeystore, resolveKey } from '../src/keystore.js';

// A throwaway key made with `cast wallet new test/fixtures --unsafe-password …`; it holds nothing.
const FIXTURE = fileURLToPath(new URL('./fixtures/throwaway.keystore.json', import.meta.url));

describe('Foundry keystore', () => {
  it('decrypts to the address cast reported', () => {
    const key = decryptKeystore(FIXTURE, 'throwaway-test-password');
    expect(privateKeyToAccount(key).address).toBe('0x58A5BA2dBA633feCC78d56931C413905586EF5Aa');
  });

  it('rejects a wrong password', () => {
    expect(() => decryptKeystore(FIXTURE, 'wrong')).toThrow('wrong keystore password');
  });

  it('resolves a keystore with a password file, or a raw key', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'keeper-'));
    const passwordFile = join(dir, 'password');
    writeFileSync(passwordFile, 'throwaway-test-password\n');
    const signer = await resolveKey({ keystore: FIXTURE, passwordFile });
    if (!('privateKey' in signer)) throw new Error('expected a key');
    expect(privateKeyToAccount(signer.privateKey).address).toBe(
      '0x58A5BA2dBA633feCC78d56931C413905586EF5Aa',
    );
    expect(await resolveKey({ privateKey: signer.privateKey })).toEqual(signer);
  });
});
