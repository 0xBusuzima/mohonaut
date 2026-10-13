import type { Metadata } from 'next';
import { SitePage } from '../../components/SiteChrome';
import { EconomyDashboard } from './dashboard';
import { BoreTimeline } from './timeline';

export const metadata: Metadata = {
  title: 'Economy',
  description:
    'Live transparency board: World Bore depth, emission, burns, sink ratio and the public timelock queue.',
};

export default function EconomyPage() {
  return (
    <SitePage wide>
      <h1 className="font-display text-5xl font-black tracking-wide uppercase">Economy</h1>
      <p className="mt-2 max-w-3xl text-fg-muted">
        Everything here is read from the chain by the Mohonaut indexer. The formulas are in the{' '}
        <a href="/docs/economy/" className="text-data underline">
          economy paper
        </a>
        .
      </p>
      <div className="mt-8">
        <EconomyDashboard />
      </div>
      <BoreTimeline />
    </SitePage>
  );
}
