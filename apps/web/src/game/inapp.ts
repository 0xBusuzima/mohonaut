/** Apps whose built-in browser we can recognise from the user agent. */
const IN_APP: readonly [RegExp, string][] = [
  [/Twitter/i, 'X'],
  [/Instagram/i, 'Instagram'],
  [/FBAN|FBAV/, 'Facebook'],
  [/\bLine\//, 'LINE'],
  [/musical_ly|BytedanceWebview/i, 'TikTok'],
];

/**
 * The app whose in-app browser this is, or null. Wallets often fail to connect there
 * (docs/09 7), so the game suggests the phone's own browser.
 */
export function inAppBrowser(userAgent: string): string | null {
  return IN_APP.find(([re]) => re.test(userAgent))?.[1] ?? null;
}
