'use client';

import { useEffect } from 'react';
import { watchGlobalErrors } from '../lib/errors';

/** Reports uncaught errors (no-op without NEXT_PUBLIC_SENTRY_DSN). Renders nothing. */
export function ErrorReporting() {
  useEffect(() => watchGlobalErrors(), []);
  return null;
}
