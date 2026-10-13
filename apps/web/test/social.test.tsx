import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { addressFromPath } from '../src/app/s/ProfileView';
import { Tabs } from '../src/components/Tabs';
import { ApiError, apiMessage } from '../src/social/api';
import {
  contributionPost,
  profileUrl,
  shortAddress,
  findPost,
  shiftPost,
  stratumPost,
  trainingPost,
  xIntentUrl,
} from '../src/social/share';

const ADDR = '0xAbCdEf0123456789aBCdEf0123456789AbCdEf01' as const;

describe('share text (docs/05 §3.4)', () => {
  it('builds the contribution post with crew, bore depth, stratum and the invite link', () => {
    const text = contributionPost({
      contributionMm: 1_240_000n,
      crew: 'Night Shift',
      boreMm: 9_870_000n,
      address: ADDR,
    });
    expect(text).toBe(
      "I've cored 1,240 m of the World Bore with Crew Night Shift. The bore is at 9,870 m, " +
        'Stratum III: Granite Basement. Race to the Moho. ' +
        'https://mohonaut.com/s/0xabcdef0123456789abcdef0123456789abcdef01' +
        '?utm_source=x&utm_medium=sharecard&utm_campaign=contribution (my invite link)',
    );
  });

  it('keeps small contributions readable and works without a crew', () => {
    const text = contributionPost({ contributionMm: 37n, crew: null, boreMm: 0n, address: ADDR });
    expect(
      text.startsWith("I've cored 3 cm of the World Bore. The bore is at 0 mm, Stratum I"),
    ).toBe(true);
  });

  it('never mentions amounts, earnings or prices', () => {
    const text = contributionPost({ contributionMm: 5n, crew: 'A', boreMm: 5n, address: ADDR });
    expect(text).not.toMatch(/MOHN|ETH|\$|earn|reward|APR|ROI|DP/);
  });

  it('encodes the X intent and the plain profile link', () => {
    expect(xIntentUrl('a b&c')).toBe('https://x.com/intent/post?text=a%20b%26c');
    expect(profileUrl(ADDR)).toBe(
      'https://mohonaut.com/s/0xabcdef0123456789abcdef0123456789abcdef01',
    );
    expect(shortAddress(ADDR)).toBe('0xAbCd…Ef01');
    expect(shortAddress(null)).toBe('Unknown');
  });
});

describe('public profile path', () => {
  it('reads the address from /s/<address> in any letter case', () => {
    expect(addressFromPath(`/s/${ADDR.toLowerCase()}`)).toBe(ADDR.toLowerCase());
    expect(addressFromPath(`/s/${ADDR}/`)).toBe(ADDR);
    expect(addressFromPath('/s/')).toBeNull();
    expect(addressFromPath('/s/not-an-address')).toBeNull();
  });
});

describe('API errors', () => {
  it('turns API failures into player-facing text', () => {
    expect(apiMessage(new ApiError(401, 'sign in first'))).toBe('Sign in with your wallet first.');
    expect(apiMessage(new ApiError(409, 'name or tag taken'))).toBe('Name or tag taken.');
    expect(apiMessage(new ApiError(429, 'slow down'))).toMatch(/Too many tries/);
    expect(apiMessage(new TypeError('fetch failed'))).toMatch(/cannot be reached/);
  });
});

describe('Tabs', () => {
  afterEach(cleanup);

  const tabs = [
    { id: 'a', label: 'Alpha', content: <p>Panel A</p> },
    { id: 'b', label: 'Beta', content: <p>Panel B</p> },
    { id: 'c', label: 'Gamma', content: <p>Panel C</p> },
  ];

  it('shows one panel and switches on click', () => {
    render(<Tabs label="Screens" tabs={tabs} />);
    expect(screen.getByRole('tabpanel').textContent).toContain('Panel A');
    fireEvent.click(screen.getByRole('tab', { name: 'Beta' }));
    expect(screen.getByRole('tabpanel').textContent).toContain('Panel B');
    expect(screen.getByRole('tab', { name: 'Beta' }).getAttribute('aria-selected')).toBe('true');
  });

  it('moves with the arrow keys, Home and End, wrapping around', () => {
    render(<Tabs label="Screens" tabs={tabs} />);
    const list = screen.getByRole('tablist');
    fireEvent.keyDown(list, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Gamma' }));
    fireEvent.keyDown(list, { key: 'ArrowRight' });
    expect(screen.getByRole('tabpanel').textContent).toContain('Panel A');
    fireEvent.keyDown(list, { key: 'End' });
    expect(screen.getByRole('tabpanel').textContent).toContain('Panel C');
    fireEvent.keyDown(list, { key: 'Home' });
    expect(screen.getByRole('tab', { name: 'Alpha' }).getAttribute('tabindex')).toBe('0');
  });
});

describe('the training site post', () => {
  it('says what was built and that it is simulated, never an amount', () => {
    const text = trainingPost({ level: 3, rigs: 1 });
    expect(text).toContain('level 3 drill site with 1 rig,');
    expect(text).toContain('simulated');
    expect(text).toContain('mohonaut.com/train/');
    for (const banned of ['MOHN', '$', 'earn', 'profit', 'ROI']) expect(text).not.toContain(banned);
    expect(text.length).toBeLessThanOrEqual(280);
  });

  it('posts a shift report with the bore and the invite link, never an amount of $MOHN', () => {
    const text = shiftPost({ boreMm: 16_000n, awayHours: 7.6, address: ADDR });
    expect(text.startsWith('Back on shift after 8 h: the World Bore went 16 m deeper')).toBe(true);
    expect(text).toContain('utm_campaign=shift');
    expect(text).toContain('(my invite link)');
    expect(text).not.toMatch(/MOHN|\$|earn|profit/i);
  });

  it('posts a Survey find with the invite link, never a value', () => {
    const text = findPost({ find: 'Coral Fragment', address: ADDR });
    expect(text).toContain('turned up a find for my Core Collection: Coral Fragment.');
    expect(text).toContain('utm_campaign=survey');
    expect(text).not.toMatch(/MOHN|\$|earn|profit|rare/i);
  });

  it('posts a stratum crossing as an event for everyone, with the invite link', () => {
    const text = stratumPost({
      numeral: 'II',
      name: 'Sediment Cover',
      fromM: 2_000,
      address: ADDR,
    });
    expect(text).toContain('Stratum II: Sediment Cover, at 2,000 m. Every Mohonaut driller');
    expect(text).toContain('utm_campaign=stratum');
    expect(text).not.toMatch(/MOHN|earn|profit/i);
  });
});
