import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PlaqueList } from '../src/game/PlaqueList';
import { ordinal, plaqueText } from '../src/game/plaques';

afterEach(cleanup);

describe('season plaques', () => {
  it('name the place in plain words', () => {
    expect([1, 2, 3, 4, 10, 11, 12, 13, 21].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '10th',
      '11th',
      '12th',
      '13th',
      '21st',
    ]);
    expect(plaqueText({ season: 1, name: 'Season 0', rank: 2 })).toBe(
      'Season 0: 2nd in World Bore contribution',
    );
  });

  it('list each plaque with its plate, and nothing without one', () => {
    const { container } = render(<PlaqueList plaques={[]} />);
    expect(container.innerHTML).toBe('');
    render(
      <PlaqueList
        plaques={[
          { season: 1, name: 'Season 0', rank: 1 },
          { season: 2, name: 'Season 1', rank: 7 },
        ]}
      />,
    );
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Season 0: 1st in World Bore contribution',
      'Season 1: 7th in World Bore contribution',
    ]);
  });
});
