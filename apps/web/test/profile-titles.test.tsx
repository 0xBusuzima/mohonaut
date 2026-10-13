import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const A = '0x000000000000000000000000000000000000dEaD';

vi.mock('../src/social/api', async (actual) => ({
  ...(await actual<typeof import('../src/social/api')>()),
  apiEnabled: true,
  api: {
    cardUrl: () => '/card.png',
    world: async () => ({ depth: { mm: '52082', text: '52 m' } }),
    prefs: async () => ({ email: null, telegramChatId: null, events: [] }),
    profile: async () => ({
      address: A,
      displayName: 'bea',
      registered: true,
      siteLevel: 3,
      activeDp: '100',
      fuelledUntilHour: '0',
      rigs: [],
      contribution: { mm: '3064', text: '3 m' },
      crew: null,
      badges: [],
      plaques: [{ season: 1, name: 'Season 0', rank: 2 }],
      titles: ['Fossil Hunter', 'Core Librarian'],
      collection: { finds: 12, completedSets: ['fossils', 'cores'] },
    }),
  },
}));
// The pixel site is a canvas: not what this test looks at.
vi.mock('../src/app/s/SiteView', () => ({ SiteView: () => null }));

afterEach(cleanup);

describe('the public profile', () => {
  it('names the titles, the plaques and the complete sets in words', async () => {
    window.history.replaceState(null, '', `/s/${A.toLowerCase()}`);
    const { ProfileView } = await import('../src/app/s/ProfileView');
    render(<ProfileView />);
    expect(await screen.findByText('Fossil Hunter · Core Librarian')).toBeTruthy();
    expect(screen.getByText('Season 0: 2nd in World Bore contribution')).toBeTruthy();
    expect(screen.getByText(/complete sets: Fossils, Core Samples/)).toBeTruthy();
  });
});

describe('the profile window', () => {
  it('names the titles above the badge shelf', async () => {
    const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
    const { ToastProvider } = await import('../src/components/Toast');
    const { ProfilePanel } = await import('../src/social/panels');
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ToastProvider>
          <ProfilePanel
            me={{ id: 1, wallet: A, displayName: 'bea', roles: [], crewId: null }}
            address={A}
          />
        </ToastProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByText('Titles: Fossil Hunter · Core Librarian')).toBeTruthy();
  });
});
