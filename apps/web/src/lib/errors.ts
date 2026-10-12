/**
 * Error reporting (docs/06 4.5). Sentry's SDK (free tier, or a self-hosted GlitchTip with the
 * same protocol) is loaded only when the first error happens and only when
 * NEXT_PUBLIC_SENTRY_DSN is set, so a healthy page downloads none of it. Reports carry no
 * IP, cookies or wallet addresses.
 */
const DSN = process.env['NEXT_PUBLIC_SENTRY_DSN'] ?? '';
const ADDRESS = /0x[0-9a-fA-F]{40}/g;

type Sentry = typeof import('@sentry/browser');
let loading: Promise<Sentry | null> | null = null;

/** Wallet addresses become "0x…" so reports cannot be tied to a player. */
export function scrub(text: string): string {
  return text.replace(ADDRESS, '0x…');
}

function load(): Promise<Sentry | null> {
  loading ??= import('@sentry/browser')
    .then((Sentry) => {
      Sentry.init({
        dsn: DSN,
        environment: process.env['NEXT_PUBLIC_DEPLOY_ENV'] ?? 'production',
        // Only what we report ourselves; no tracing, replays or default integrations that
        // record clicks and requests.
        defaultIntegrations: false,
        integrations: [Sentry.dedupeIntegration()],
        sampleRate: 1,
        beforeSend(event) {
          if (event.message !== undefined) event.message = scrub(event.message);
          for (const ex of event.exception?.values ?? []) {
            if (ex.value !== undefined) ex.value = scrub(ex.value);
          }
          if (event.request?.url !== undefined) event.request.url = scrub(event.request.url);
          delete event.user;
          return event;
        },
      });
      return Sentry;
    })
    .catch(() => null);
  return loading;
}

export function reportError(error: unknown): void {
  if (DSN === '' || typeof window === 'undefined') return;
  void load().then((Sentry) => Sentry?.captureException(error));
}

/** Uncaught errors and rejections anywhere on the page; the result removes the listeners. */
export function watchGlobalErrors(): () => void {
  const onError = (e: ErrorEvent) => reportError(e.error ?? e.message);
  const onRejection = (e: PromiseRejectionEvent) => reportError(e.reason);
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}
