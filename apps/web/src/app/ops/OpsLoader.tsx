'use client';

import dynamic from 'next/dynamic';

const OpsApp = dynamic(() => import('./OpsApp').then((m) => m.OpsApp), {
  ssr: false,
  loading: () => (
    <p role="status" className="p-8 text-fg-muted">
      Loading the operator panel…
    </p>
  ),
});

export function OpsLoader() {
  return <OpsApp />;
}
