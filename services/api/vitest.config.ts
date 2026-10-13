import { defineConfig } from 'vitest/config';

// Each test starts an embedded Postgres (PGlite) with both services' migrations.
export default defineConfig({ test: { testTimeout: 60_000, hookTimeout: 60_000 } });
