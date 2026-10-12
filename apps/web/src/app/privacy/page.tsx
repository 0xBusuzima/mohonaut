import type { Metadata } from 'next';
import { Badge } from '../../components/Badge';
import { SitePage } from '../../components/SiteChrome';

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'How Mohonaut handles personal data.',
  robots: { index: false },
};

/** Placeholder until the lawyer-reviewed text exists (docs/06 4.2, docs/07). */
export default function Page() {
  return (
    <SitePage>
      <h1 className="font-display text-5xl font-black tracking-wide uppercase">Privacy</h1>
      <p className="mt-4">
        <Badge tone="warning">Draft</Badge>
      </p>
      <p className="mt-4 text-lg">
        This text is being prepared and reviewed. It will be published here before Season 0 opens.
        Until then, Mohonaut is not open to players.
      </p>
    </SitePage>
  );
}
