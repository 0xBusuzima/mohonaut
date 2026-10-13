import type { Metadata } from 'next';
import { DesignShowcase } from './showcase';

export const metadata: Metadata = { title: 'Design system', robots: { index: false } };

export default function DesignPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-5xl font-black tracking-wide uppercase">Design system</h1>
      <p className="mt-2 max-w-2xl text-fg-muted">
        Tokens and components of the game (docs/05 §2.4–2.5). Night shift is the main theme; the
        light theme is for long reading. Orange means action, cyan means measurement.
      </p>
      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <div data-theme="dark" className="rounded-xl bg-surface p-6 text-fg">
          <DesignShowcase theme="dark" />
        </div>
        <div data-theme="light" className="rounded-xl bg-surface p-6 text-fg">
          <DesignShowcase theme="light" />
        </div>
      </div>
    </main>
  );
}
