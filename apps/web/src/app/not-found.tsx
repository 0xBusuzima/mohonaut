import Link from 'next/link';
import { SitePage } from '../components/SiteChrome';

export default function NotFound() {
  return (
    <SitePage>
      <p className="font-stencil tracking-widest text-fg-muted uppercase">Dry hole</p>
      <h1 className="mt-2 font-display text-5xl font-black tracking-wide uppercase">
        Nothing at this depth
      </h1>
      <p className="mt-4 text-lg">This page does not exist.</p>
      <Link href="/" className="mt-6 inline-block text-data underline">
        Back to the surface
      </Link>
    </SitePage>
  );
}
