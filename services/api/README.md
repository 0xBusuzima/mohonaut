# @mohonaut/api

Off-chain game services (docs/03 §4.2, §4.4): sessions, profiles, crews, the daily Survey,
seasons, contribution cards and the operator (admin) API. Hono + Zod (OpenAPI generated from the
route schemas at `/openapi.json`), Drizzle on the indexer's Postgres, Redis for rate limits and
sign-in nonces. Game state and value stay on-chain; nothing here can move tokens or change the
economy.

## Endpoints

| Area | Routes |
|---|---|
| Sign-in | `GET /auth/nonce`, `POST /auth/siwe` (EIP-4361; EOAs locally, smart wallets via `RPC_URL`), `POST /auth/external` (optional Dynamic/Privy JWT), `POST /auth/logout`, `GET/PATCH /me` |
| World | `GET /world` (World Bore depth and stratum), `GET /economy/daily` (docs/02 §10 metrics, 28-day SR), `GET /market/prices` (average paid per DP by day, docs/01 §4.4) |
| Rankings | `GET /leaderboards/contribution`, `GET /leaderboards/crews`, `GET /seasons`, `GET /seasons/{id}/leaderboard` |
| Crew signals | `POST /crews/signal` (signed in, crew member; one of the SDK's set phrases, never free text; 12 tries an hour), the latest 12 in `GET /crews/{id}`, for the crew's own members only (3 per member at most) |
| Profile | `GET /profiles/{address}` (public, no wallet needed: site, contribution, crew, badges, season plaques: a top-10 World Bore contribution in a season that has ended, never for a flagged account), `GET /cards/{address}` (PNG share card, no earnings or prices) |
| Crews | `POST /crews`, `GET /crews/{id}`, `POST /crews/{id}/join`, `POST /crews/leave` (5–25 players, social only) |
| Survey | `POST /survey` (one cosmetic find per UTC day: HMAC of a server secret, the player and the day; no economic value), `GET /me/collection` |
| Notifications | `GET/PUT /me/notifications` |
| Admin | `GET /admin/users`, `POST /admin/users/{id}/flag`, `POST /admin/crews/{id}/rename`, `POST /admin/seasons`, `POST /admin/roles`, `GET /admin/audit` |

**Admin roles** (`src/rbac.ts`): admin, economist, support, moderator; `test/rbac.test.ts` checks
every endpoint against every role. Every operator write and its audit row are one transaction; a
database trigger makes `audit_log` append-only (no UPDATE, DELETE or TRUNCATE). `ADMIN_WALLETS`
bootstraps the first admin; the admin panel (Phase 5) adds Cloudflare Access and WebAuthn in
front.

**Security.** Session cookie: random token (only its SHA-256 is stored), HttpOnly, SameSite=Lax,
Secure in production, 30 days. Writes must come from `WEB_ORIGIN` with a JSON body (CSRF). Rate
limits per IP and per player (`RateLimit-*` and `Retry-After` headers). Cloudflare Turnstile on
sign-in, crew creation and the Survey. In production the API refuses to start without
`TURNSTILE_SECRET` and `REDIS_URL`.

## Run

```bash
cp .env.example .env   # then edit; never commit .env
npm run build
node dist/main.js      # applies migrations/ (API tables), then serves HOST:PORT
```

The API reads the indexer's tables, so point `DATABASE_URL` at the indexer's database (Postgres
when both run at once: one PGlite directory serves one process).

## Tests

`npm test` (embedded Postgres, real EIP-4361 signatures with random keys): sign-in and its
failure modes, CSRF, crews, Survey, notifications, world and economy, leaderboards, profile
badges, the card PNG (and that it has no prices), the authorization matrix and the append-only
audit log, rate limits, OpenAPI coverage and the schema. Load test: `k6/load.js` (k6 is free).
