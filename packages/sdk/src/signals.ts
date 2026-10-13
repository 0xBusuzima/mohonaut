/**
 * Crew signals (docs/01 §6.7): a crew talks in set phrases, never free text, so there is
 * nothing to moderate. Social only: no phrase gives advice about money or the token.
 */
export const CREW_SIGNALS = [
  { id: 'welcome', text: 'Welcome to the crew.' },
  { id: 'nice-core', text: 'Nice coring, crew.' },
  { id: 'fuel-check', text: 'Tank check before you log off.' },
  { id: 'survey', text: "Today's survey is waiting." },
  { id: 'new-stratum', text: 'New stratum. Keep the bits turning.' },
  { id: 'signing-off', text: 'Night shift signing off.' },
] as const;

export type CrewSignalId = (typeof CREW_SIGNALS)[number]['id'];
