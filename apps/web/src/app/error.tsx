'use client';

import { ErrorScreen } from '../components/ErrorScreen';

/** Error boundary for every page (docs/06 4.5). */
export default function PageError({ error, reset }: { error: Error; reset: () => void }) {
  return <ErrorScreen error={error} reset={reset} />;
}
