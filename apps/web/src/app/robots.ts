import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

/** The game client and the design sandbox stay out of search (docs/05 §3.6). */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/play/', '/design/', '/ops/'] }],
    sitemap: 'https://mohonaut.com/sitemap.xml',
  };
}
