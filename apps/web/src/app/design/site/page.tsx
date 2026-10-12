import type { Metadata } from 'next';
import { SitePreview } from './preview';

export const metadata: Metadata = { title: 'Drill site preview', robots: { index: false } };

export default function SitePreviewPage() {
  return (
    <>
      <h1 className="sr-only">Drill site preview: the game screen with a sample site</h1>
      <SitePreview />
    </>
  );
}
