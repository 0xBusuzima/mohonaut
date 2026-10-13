import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../src/components/Toast';

const sent = vi.hoisted(() => ({ signals: [] as string[] }));
const A = '0x000000000000000000000000000000000000dEaD';

vi.mock('../src/social/api', async (actual) => ({
  ...(await actual<typeof import('../src/social/api')>()),
  api: {
    crew: async () => ({
      id: 7,
      name: 'Night Shift',
      tag: 'NITE',
      ranked: false,
      contribution: { mm: '0', text: '0 mm' },
      members: [
        { wallet: A, displayName: 'bea', captain: true, contribution: { mm: '0', text: '0 mm' } },
      ],
      signals: sent.signals.map((signal) => ({
        signal,
        text: 'Nice coring, crew.',
        wallet: A,
        displayName: 'bea',
        at: '2026-10-13T06:00:00.000Z',
      })),
    }),
    signal: async (signal: string) => {
      sent.signals.unshift(signal);
      return { ok: true };
    },
  },
}));

afterEach(cleanup);

describe('crew signals', () => {
  it('sends a set phrase and shows it in the crew window, with no free text field', async () => {
    const { CrewPanel } = await import('../src/social/panels');
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ToastProvider>
          <CrewPanel me={{ id: 1, wallet: A, displayName: 'bea', roles: [], crewId: 7 }} />
        </ToastProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/No signals yet/)).toBeTruthy();
    const group = screen.getByRole('group', { name: 'Send a signal' });
    expect(within(group).getAllByRole('button')).toHaveLength(6);
    expect(screen.queryByRole('textbox')).toBeNull();
    fireEvent.click(within(group).getByRole('button', { name: 'Nice coring, crew.' }));
    const list = await screen.findByRole('list', { name: 'Signals in Night Shift' });
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(1));
    expect(list.textContent).toContain('bea: Nice coring, crew. 13 Oct 06:00 UTC');
    expect(sent.signals).toEqual(['nice-core']);
  });
});
