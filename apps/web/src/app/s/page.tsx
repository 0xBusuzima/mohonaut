import type { Metadata } from 'next';
import { SitePage } from '../../components/SiteChrome';
import { ProfileView } from './ProfileView';

export const metadata: Metadata = {
  title: 'Drill site',
  description: 'A Mohonaut drill site: World Bore contribution, crew, badges and collection.',
  // Every address shares this one static page (public/_redirects); index the players, not it.
  robots: { index: false },
};

export default function ProfilePage() {
  return (
    <SitePage>
      <ProfileView />
    </SitePage>
  );
}
