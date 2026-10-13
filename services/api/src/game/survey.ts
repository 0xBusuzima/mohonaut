import { createHmac } from 'node:crypto';

/**
 * The daily Survey (docs/01 §4.9): one free cosmetic find per player per UTC day. Finds cannot be
 * bought, sold or traded and give nothing in the economy. The find is a pure function of a
 * server secret, the player and the day, so repeating the request returns the same find and
 * nobody can predict tomorrow's without the secret.
 */

export const SURVEY_SETS = [
  {
    id: 'fossils',
    name: 'Fossils',
    title: 'Fossil Hunter',
    items: [
      'Ammonite',
      'Trilobite',
      'Crinoid Stem',
      'Shark Tooth',
      'Fern Imprint',
      'Coral Fragment',
    ],
  },
  {
    id: 'cores',
    name: 'Core Samples',
    title: 'Core Librarian',
    items: [
      'Basalt Core',
      'Granite Core',
      'Sandstone Core',
      'Gneiss Core',
      'Shale Core',
      'Peridotite Core',
    ],
  },
  {
    id: 'bits',
    name: 'Drill Bits',
    title: 'Bit Collector',
    items: [
      'Fishtail Bit',
      'Roller Cone Bit',
      'PDC Bit',
      'Diamond Core Bit',
      'Hammer Bit',
      'Spade Bit',
    ],
  },
  {
    id: 'relics',
    name: 'Rig Relics',
    title: 'Rig Historian',
    items: [
      'Cable-Tool Jar',
      'Derrick Peg',
      'Steam Whistle',
      'Brass Pressure Gauge',
      'Kelly Bushing',
      "Driller's Logbook",
    ],
  },
] as const;

export interface SurveyItem {
  id: string;
  name: string;
  setId: string;
}

export const SURVEY_ITEMS: readonly SurveyItem[] = SURVEY_SETS.flatMap((set) =>
  set.items.map((name, i) => ({ id: `${set.id}-${i + 1}`, name, setId: set.id })),
);

export function surveyFind(secret: string, userId: number, day: number): SurveyItem {
  const digest = createHmac('sha256', secret).update(`survey:${userId}:${day}`).digest();
  const index = digest.readUInt32BE(0) % SURVEY_ITEMS.length;
  return SURVEY_ITEMS[index] as SurveyItem;
}

/** The titles that completed sets give, in catalogue order. */
export function titlesOf(setIds: readonly string[]): string[] {
  return SURVEY_SETS.filter((s) => setIds.includes(s.id)).map((s) => s.title);
}

/** Sets whose every item the player has found (each completed set gives its title). */
export function completedSets(itemIds: Iterable<string>): string[] {
  const owned = new Set(itemIds);
  return SURVEY_SETS.filter((set) =>
    set.items.every((_, i) => owned.has(`${set.id}-${i + 1}`)),
  ).map((set) => set.id);
}
