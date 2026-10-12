/* global URL, process, console, setTimeout, fetch */
// Play end-to-end harness (docs/06 4.3): a local anvil chain, the real deploy script, a web build
// that points at that deployment with the wallet mock connector, and the static server.
// Started by playwright.play.config.ts; needs Foundry (FOUNDRY_BIN=<dir> if not on PATH).
// Note: it rebuilds out/ for the local chain; run `npm run build` again before the site tests.
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = fileURLToPath(new URL('../../', import.meta.url));
const ROOT = join(WEB, '..', '..');
const CONTRACTS = join(ROOT, 'contracts');
const PORT = Number(process.env.PLAY_ANVIL_PORT ?? 18546);
const RPC = `http://127.0.0.1:${PORT}`;
const POOL_MANAGER = '0x8366a39cc670b4001a1121b8f6a443a643e40951';
const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11';
// Anvil's default, publicly known test accounts (local chain only): 0 deploys, 2 plays.
const ACCOUNTS = [
  '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
  '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
  '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
  '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc',
];
const bin = (name) => (process.env.FOUNDRY_BIN ? join(process.env.FOUNDRY_BIN, name) : name);

async function rpc(method, params = []) {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const body = await res.json();
  if (body.error !== undefined) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
}

const anvil = spawn(
  bin('anvil'),
  ['--code-size-limit', '98304', '--block-time', '1', '--port', String(PORT), '--silent'],
  {
    stdio: 'inherit',
  },
);
const stop = () => anvil.kill();
process.on('exit', stop);
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

for (let i = 0; ; i++) {
  try {
    await rpc('eth_blockNumber');
    break;
  } catch (err) {
    if (i > 100) throw err;
    await new Promise((r) => setTimeout(r, 200));
  }
}

// Code that exists on Robinhood Chain but not on a fresh anvil (runtime bytecode fixtures).
for (const [address, fixture] of [
  [POOL_MANAGER, 'PoolManager.runtime.hex'],
  [MULTICALL3, 'Multicall3.runtime.hex'],
]) {
  const code = readFileSync(join(CONTRACTS, 'test', 'fixtures', fixture), 'utf8').trim();
  await rpc('anvil_setCode', [address, code.startsWith('0x') ? code : `0x${code}`]);
}
const block = await rpc('eth_getBlockByNumber', ['latest', false]);
const genesis = (BigInt(block.timestamp) / 3600n + 3n) * 3600n; // inside the pre-fill window

console.log('play e2e: deploying');
execFileSync(
  bin('forge'),
  [
    'script',
    'script/Deploy.s.sol',
    '--rpc-url',
    RPC,
    '--broadcast',
    '--unlocked',
    '--sender',
    ACCOUNTS[0],
  ],
  {
    cwd: CONTRACTS,
    stdio: 'pipe',
    env: {
      ...process.env,
      GENESIS_TIME: genesis.toString(),
      OPS_SAFE: ACCOUNTS[5],
      GUARDIAN_SAFE: ACCOUNTS[4],
      KEEPER: ACCOUNTS[1],
      DEV_RECIPIENT: ACCOUNTS[3],
      TREASURY_RECIPIENT: ACCOUNTS[3],
      DEPLOYMENT_NAME: 'play-e2e',
    },
  },
);
const deployment = readFileSync(join(ROOT, 'deployments', '31337-play-e2e.json'), 'utf8');

console.log('play e2e: building the web client for the local chain');
const require = createRequire(import.meta.url);
const env = {
  ...process.env,
  NEXT_PUBLIC_DEPLOYMENT_JSON: JSON.stringify(JSON.parse(deployment)),
  NEXT_PUBLIC_E2E_ACCOUNT: ACCOUNTS[2],
  NEXT_PUBLIC_RPC_URL: RPC,
};
execFileSync(process.execPath, [require.resolve('next/dist/bin/next'), 'build'], {
  cwd: WEB,
  stdio: 'inherit',
  env,
});
execFileSync(process.execPath, ['scripts/flatten-segments.mjs'], { cwd: WEB, stdio: 'inherit' });

spawn(process.execPath, ['e2e/serve.mjs'], {
  cwd: WEB,
  stdio: 'inherit',
  env: { ...process.env, PORT: process.env.PLAY_WEB_PORT ?? '4174' },
});
console.log('play e2e: ready');
