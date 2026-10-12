import Link from 'next/link';
import { SitePage } from '../components/SiteChrome';
import { ForemanMoSvg } from '../game/pixel/mo-art';

export default function NotFound() {
  return (
    <SitePage>
      <ForemanMoSvg size={96} label="Foreman Mo, the site foreman" />
      <p className="mt-4 font-stencil tracking-widest text-fg-muted uppercase">Dry hole</p>
      <h1 className="mt-2 font-display text-5xl font-black tracking-wide uppercase">
        Nothing at this depth
      </h1>
      <p className="mt-4 text-lg">This page does not exist. Mo checked the log twice.</p>
      <Link href="/" className="mt-6 inline-block text-data underline">
        Back to the surface
      </Link>
    </SitePage>
  );
}
