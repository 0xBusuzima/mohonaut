import testnet from '../../../../deployments/46630.json';

/**
 * The chain id the client plays on (the same choice as network.ts), without viem's address
 * helpers, so the prerendered first screen stays light.
 */
function chainId(): number {
  const inline = process.env['NEXT_PUBLIC_DEPLOYMENT_JSON'];
  const d = (inline !== undefined && inline !== '' ? JSON.parse(inline) : testnet) as {
    chainId: unknown;
  };
  return Number(d.chainId);
}

export const isTestnet = chainId() !== 4663;
