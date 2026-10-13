import Link from 'next/link';
import type { ReactNode } from 'react';
import { SiteFooter, SiteHeader } from '../../components/SiteChrome';

const DOCS = [
  { href: '/docs/', label: 'Player guide' },
  { href: '/docs/economy/', label: 'Economy paper' },
  { href: '/docs/refining/', label: 'Refining' },
  { href: '/docs/genesis/', label: 'Genesis and Market Open' },
  { href: '/docs/eth/', label: 'Getting ETH' },
];

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto grid max-w-6xl gap-10 px-4 py-12 md:grid-cols-[14rem_1fr]">
        <nav aria-label="Docs">
          <ul className="flex flex-col gap-2 font-condensed text-lg font-semibold uppercase">
            {DOCS.map((d) => (
              <li key={d.href}>
                <Link href={d.href} className="hover:text-orange">
                  {d.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <article className="max-w-3xl">{children}</article>
      </main>
      <SiteFooter />
    </>
  );
}
