import type { Metadata } from 'next';
import { SitePreview } from './preview';

export const metadata: Metadata = { title: 'Drill site preview', robots: { index: false } };

export default function SitePreviewPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-5xl font-black tracking-wide uppercase">Drill site</h1>
      <p className="mt-2 max-w-2xl text-fg-muted">
        The /play scene with sample pads: every Gen-1 rig drilling, the same rigs switched off, and
        empty pads. No wallet or chain needed.
      </p>
      <div className="mt-8">
        <SitePreview />
      </div>
    </main>
  );
}
