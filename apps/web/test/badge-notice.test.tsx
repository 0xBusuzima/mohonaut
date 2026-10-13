import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BadgeNotice, newBadges } from '../src/app/play/BadgeNotice';
import { badgePost } from '../src/social/share';

const A = '0x000000000000000000000000000000000000dEaD';

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe('the new badge notice', () => {
  it('finds the badges not shown yet, in catalogue order', () => {
    expect(newBadges(['spud-in'], ['pioneer', 'spud-in', 'rig-up'])).toEqual(['rig-up', 'pioneer']);
    expect(newBadges([], ['nope'])).toEqual([]);
  });

  it('only notes the badges held on a first visit, then hands over a new one once', () => {
    const first = render(
      <BadgeNotice address={A} held={['spud-in']}>
        <p>underneath</p>
      </BadgeNotice>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('underneath')).toBeTruthy();
    first.unmount();

    const later = render(<BadgeNotice address={A} held={['spud-in', 'rig-up']} />);
    expect(screen.getByRole('dialog', { name: 'New badge' })).toBeTruthy();
    expect(screen.getByText('Rig Up')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Share on X' }).getAttribute('href')).toContain(
      'utm_campaign%3Dbadge',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Back to work' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    later.unmount();
    render(<BadgeNotice address={A} held={['spud-in', 'rig-up']} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('posts what the badge marks, with the invite link and no value', () => {
    const text = badgePost({ name: 'Spud-In', description: 'Fuelled a drill site.', address: A });
    expect(text).toContain('Got the Spud-In badge');
    expect(text).toContain('(my invite link)');
    expect(text).not.toMatch(/MOHN|earn|profit|reward/i);
  });
});
