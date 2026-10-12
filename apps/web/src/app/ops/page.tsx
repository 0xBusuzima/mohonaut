import type { Metadata } from 'next';
import { OpsLoader } from './OpsLoader';

export const metadata: Metadata = {
  title: 'Operations',
  description: 'Mohonaut operator panel.',
  robots: { index: false, follow: false },
};

/** Operator panel (docs/03 §5, ADR-015): behind Cloudflare Access, SIWE and API roles. */
export default function OpsPage() {
  return <OpsLoader />;
}
