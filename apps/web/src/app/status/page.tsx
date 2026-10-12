import type { Metadata } from 'next';
import { SitePage } from '../../components/SiteChrome';
import { LINKS } from '../../lib/site';

export const metadata: Metadata = {
  title: 'Status',
  description: 'Service status: website, API, indexer, keeper and the chain connection.',
};

export default function StatusPage() {
  return (
    <SitePage>
      <h1 className="font-display text-5xl font-black tracking-wide uppercase">Status</h1>
      <p className="mt-4 text-lg">
        The game runs on-chain: if our servers stop, your drill site keeps drilling and the
        contracts keep working. Live service checks (website, API, indexer, keeper, oracle
        freshness) are on our status page.
      </p>
      <a href={LINKS.status} className="mt-6 inline-block text-data underline" rel="noopener">
        status.mohonaut.com
      </a>
      <p className="mt-6 text-fg-muted">
        Today’s mint against the daily and hourly limits, the last hour closed and the pause state
        are on the{' '}
        <a href="/economy/" className="text-data underline">
          economy page
        </a>
        .
      </p>
    </SitePage>
  );
}
