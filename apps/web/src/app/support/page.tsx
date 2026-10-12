import type { Metadata } from 'next';
import { SitePage } from '../../components/SiteChrome';
import { SupportForm } from './SupportForm';

export const metadata: Metadata = {
  title: 'Support',
  description: 'Ask for help with your drill site, a transaction or a bug, or report a fake site.',
};

export default function SupportPage() {
  return (
    <SitePage>
      <h1 className="font-display text-5xl font-black tracking-wide uppercase">Support</h1>
      <p className="mt-4 text-lg">
        Tell us what happened. We never ask for your seed phrase, private key or a signature that
        moves funds; anyone who does is not us.
      </p>
      <SupportForm />
    </SitePage>
  );
}
