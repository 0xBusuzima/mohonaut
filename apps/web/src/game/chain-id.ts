import testnet from '../../../../deployments/46630.json';

/**
 * The deployment the client plays on (the same choice as network.ts), read without viem's
 * address helpers, so light pages (the first screen, /status) stay light.
 */
const deployment = ((): Record<string, unknown> => {
  const inline = process.env['NEXT_PUBLIC_DEPLOYMENT_JSON'];
  return (inline !== undefined && inline !== '' ? JSON.parse(inline) : testnet) as Record<
    string,
    unknown
  >;
})();

const CHAIN_ID = Number(deployment['chainId']);
export const isTestnet = CHAIN_ID !== 4663;
/** MiningCore's address as the deployment record writes it. */
export const MINING_CORE = String(deployment['MiningCore']);

const RPC_URLS: Readonly<Record<number, string>> = {
  4663: 'https://rpc.mainnet.chain.robinhood.com',
  46630: 'https://rpc.testnet.chain.robinhood.com',
  31337: 'http://127.0.0.1:8545',
};

/** The RPC the client reads (a build may point elsewhere, e.g. the e2e anvil). */
export const RPC_URL = process.env['NEXT_PUBLIC_RPC_URL'] ?? RPC_URLS[CHAIN_ID] ?? '';
