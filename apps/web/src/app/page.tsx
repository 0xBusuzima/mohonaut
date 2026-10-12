import Link from 'next/link';

/** Placeholder until the landing page (docs/06 4.2). */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-6 px-6">
      <p className="font-stencil tracking-widest text-fg-muted uppercase">Night shift</p>
      <h1 className="font-display text-6xl font-black tracking-wide text-orange uppercase">
        Mohonaut
      </h1>
      <p className="text-xl">Not the moon. The Moho.</p>
      <Link href="/design/" className="text-data underline">
        Design system
      </Link>
    </main>
  );
}
