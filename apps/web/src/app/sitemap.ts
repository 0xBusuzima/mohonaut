import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

const PAGES = [
  '',
  'docs/',
  'docs/economy/',
  'docs/refining/',
  'docs/genesis/',
  'economy/',
  'contracts/',
  'security/',
  'faq/',
  'status/',
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map((p) => ({ url: `https://mohonaut.com/${p}` }));
}
