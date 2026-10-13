import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const row = (rank: number) => ({
  rank,
  address: `0x${rank.toString(16).padStart(40, '0')}`,
  displayName: `driller_${rank}`,
  contribution: { mm: '1000', text: '1 m' },
});

vi.mock('../src/social/api', async (actual) => ({
  ...(await actual<typeof import('../src/social/api')>()),
  api: {
    seasons: async () => ({
      seasons: [{ id: 1, name: 'Season 1', startsAt: 1_790_000_000, endsAt: 1_795_000_000 }],
    }),
    seasonBoard: async () => ({ rows: [1, 2, 10, 11].map(row) }),
    contributionBoard: async () => ({
      rows: [1, 2].map(row),
      you: { rank: 73, contribution: { mm: '12', text: '1 cm' } },
    }),
  },
}));

afterEach(cleanup);

describe('the season board', () => {
  it('marks the top ten places as plaque places, and only on the season board', async () => {
    const { SeasonsPanel } = await import('../src/social/panels');
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SeasonsPanel address="0x00000000000000000000000000000000000000aa" />
      </QueryClientProvider>,
    );
    const season = await screen.findByRole('table', { name: 'Season 1 leaderboard' });
    const ranks = within(season)
      .getAllByRole('row')
      .slice(1)
      .map((r) => within(r).getAllByRole('cell')[0]?.textContent);
    expect(ranks).toEqual(['1, plaque place', '2, plaque place', '10, plaque place', '11']);
    expect(screen.getByText(/the top ten get a plaque/)).toBeTruthy();
    const overall = await screen.findByRole('table', { name: 'All-time contribution leaderboard' });
    expect(within(overall).queryByText(/plaque place/)).toBeNull();
    // Outside the top 50, the player's own place shows under the board.
    expect(screen.getByText('You: #73, 1 cm cored')).toBeTruthy();
  });

  it('says where the season stands', async () => {
    const { seasonPhase } = await import('../src/social/panels');
    const season = { startsAt: 1_000_000, endsAt: 1_000_000 + 56 * 86_400 };
    expect(seasonPhase(season, 1_000_000 - 7_200)).toBe('Starts in 2 h 0 min');
    expect(seasonPhase(season, 1_000_000 + 86_400)).toBe('Ends in 55 d 0 h');
    expect(seasonPhase(season, season.endsAt)).toBe('Ended: plaques are up');
  });
});
