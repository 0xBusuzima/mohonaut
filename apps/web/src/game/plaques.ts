/** A season plaque (docs/05 P-34): a top-10 place in a season's World Bore contribution. */
export interface Plaque {
  season: number;
  name: string;
  rank: number;
}

/** First place is gold, second and third silver, the rest of the top ten bronze. */
export function plaqueTier(rank: number): 'gold' | 'silver' | 'bronze' {
  return rank === 1 ? 'gold' : rank <= 3 ? 'silver' : 'bronze';
}

/** 1st, 2nd, 3rd, 4th … 10th (ranks stop at 10). */
export function ordinal(n: number): string {
  const tail =
    n % 10 === 1 && n !== 11
      ? 'st'
      : n % 10 === 2 && n !== 12
        ? 'nd'
        : n % 10 === 3 && n !== 13
          ? 'rd'
          : 'th';
  return `${n}${tail}`;
}

/** "Season 0: 2nd in World Bore contribution". */
export function plaqueText(p: Plaque): string {
  return `${p.name}: ${ordinal(p.rank)} in World Bore contribution`;
}
