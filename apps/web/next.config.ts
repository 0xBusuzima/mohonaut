import { fileURLToPath } from 'node:url';
import createMDX from '@next/mdx';
import type { NextConfig } from 'next';

// The npm workspace root: dependencies are hoisted there.
const root = fileURLToPath(new URL('../..', import.meta.url));

/**
 * Static export: the site and the game client are plain files on Cloudflare Pages (free).
 * Live data comes from the chain (viem) and the API; nothing renders on a server.
 */
const config: NextConfig = {
  output: 'export',
  trailingSlash: true,
  reactStrictMode: true,
  images: { unoptimized: true },
  poweredByHeader: false,
  pageExtensions: ['ts', 'tsx', 'mdx'],
  transpilePackages: ['@mohonaut/sdk'],
  turbopack: { root },
  outputFileTracingRoot: root,
};

// GitHub-flavoured Markdown (tables). Plugins are named as strings for Turbopack.
export default createMDX({ options: { remarkPlugins: ['remark-gfm'] } })(config);
