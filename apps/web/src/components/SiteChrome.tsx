import Link from 'next/link';
import type { ReactNode } from 'react';
import { LINKS, NAV } from '../lib/site';

/** The two notices under the header until an independent audit and Market Open (docs/05 §3.2). */
function Bands() {
  return (
    <div className="border-b border-line text-sm">
      <p className="bg-surface-sunken px-4 py-1.5 text-center">
        <strong className="text-warn">Unaudited</strong> — use at your own risk. What we did
        instead, and when an independent audit happens:{' '}
        <Link href="/security/" className="text-data underline">
          /security
        </Link>
      </p>
      <p className="bg-surface-raised px-4 py-1.5 text-center">
        There is no $MOHN market until Market Open. Anything you can buy before that is fake.
      </p>
    </div>
  );
}

/** The casing mark (brand/logo/mohonaut-mark.svg): outer casing, inner casing in the text colour, bore. */
function CasingMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 512 512" className="h-7 w-7 shrink-0">
      <circle cx="256" cy="256" r="224" fill="none" stroke="var(--color-orange)" strokeWidth="64" />
      <circle cx="256" cy="256" r="128" fill="none" stroke="var(--fg)" strokeWidth="54" />
      <circle cx="256" cy="256" r="51" fill="var(--color-orange)" />
    </svg>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 bg-surface/95 backdrop-blur">
      <nav
        aria-label="Main"
        className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3"
      >
        <Link
          href="/"
          className="flex items-center gap-2 font-display text-2xl font-black tracking-wide text-orange uppercase"
        >
          <CasingMark />
          Mohonaut
        </Link>
        <ul className="flex flex-wrap gap-x-5 gap-y-1 font-condensed text-lg font-semibold uppercase">
          {NAV.map((n) => (
            <li key={n.href}>
              <Link href={n.href} className="hover:text-orange">
                {n.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="ml-auto flex items-center gap-4">
          <a href={LINKS.x} className="text-fg-muted hover:text-fg" rel="me noopener">
            @playmohonaut
          </a>
          <Link
            href="/contracts/"
            className="rounded border border-line px-3 py-1 font-condensed text-sm font-semibold uppercase"
          >
            Official links
          </Link>
        </div>
      </nav>
      <Bands />
    </header>
  );
}

export function SiteFooter() {
  const links = [
    { href: '/terms/', label: 'Terms' },
    { href: '/privacy/', label: 'Privacy' },
    { href: '/status/', label: 'Status' },
    { href: '/support/', label: 'Support' },
    { href: '/season0/', label: 'Season 0' },
    { href: '/security/', label: 'Security' },
    { href: '/contracts/', label: 'Contracts' },
  ];
  return (
    <footer className="mt-24 border-t border-line bg-surface-sunken">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 text-sm text-fg-muted">
        <p>
          Mohonaut is a game. Nothing on this site is an offer, investment advice or a promise of
          value. Tokens can lose all value. 18+. Not available in restricted jurisdictions; see
          Terms.
        </p>
        <p>
          Built on Robinhood Chain. Mohonaut is not affiliated with, endorsed by, or officially
          connected with Robinhood Markets, Inc.
        </p>
        <p>Fake sites and fake pools exist. Official links live on mohonaut.com/contracts.</p>
        <ul className="flex flex-wrap gap-x-5 gap-y-2 font-condensed text-base uppercase">
          {links.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="hover:text-fg">
                {l.label}
              </Link>
            </li>
          ))}
          <li>
            <a href={LINKS.x} className="hover:text-fg" rel="me noopener">
              X
            </a>
          </li>
        </ul>
      </div>
    </footer>
  );
}

/** Standard page frame: header, main content column, footer. */
export function SitePage({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <>
      <SiteHeader />
      <main className={`mx-auto px-4 py-12 ${wide ? 'max-w-6xl' : 'max-w-3xl'}`}>{children}</main>
      <SiteFooter />
    </>
  );
}
