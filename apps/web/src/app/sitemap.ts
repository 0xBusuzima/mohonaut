import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

const PAGES = [
  '',
  'docs/',
  'docs/economy/',
  'docs/refining/',
  'docs/genesis/',
  'docs/eth/',
  'economy/',
  'contracts/',
  'security/',
  'faq/',
  'status/',
  'season0/',
  'train/',
  'brand/',
  'collab/',
  'faucet/',
  'support/',
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map((p) => ({ url: `https://mohonaut.com/${p}` }));
}
