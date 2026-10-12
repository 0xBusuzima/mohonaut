import testnet from '../../../../deployments/46630.json';

/** Official links (docs/05 §3.1): addresses come only from /contracts and the pinned post. */
export const LINKS = {
  x: 'https://x.com/playmohonaut',
  founder: 'https://x.com/onderyazici',
  security: 'mailto:security@mohonaut.com',
  hello: 'mailto:hello@mohonaut.com',
  status: 'https://status.mohonaut.com',
};

/** Where the site points for live data. Mainnet replaces this at launch (docs/06 Phase 9). */
export const NETWORK = {
  name: 'Robinhood Chain testnet',
  chainId: testnet.chainId,
  explorer: 'https://explorer.testnet.chain.robinhood.com',
  testnet: true,
} as const;

export const DEPLOYMENT = testnet;

/** The API base URL (empty: no live data, pages show their fallback). */
export const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? '';

export const NAV = [
  { href: '/docs/', label: 'Docs' },
  { href: '/economy/', label: 'Economy' },
  { href: '/contracts/', label: 'Contracts' },
  { href: '/security/', label: 'Security' },
  { href: '/faq/', label: 'FAQ' },
];
