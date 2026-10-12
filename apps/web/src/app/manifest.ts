import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

/** Installable PWA (docs/05 §3.5): portrait first, night-shift colours. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Mohonaut',
    short_name: 'Mohonaut',
    description: 'An on-chain idle drilling game. One shared bore.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#16191D',
    theme_color: '#16191D',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
