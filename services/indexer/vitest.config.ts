import { defineConfig } from 'vitest/config';

// Embedded Postgres (PGlite) makes the full-history tests take a few seconds each.
export default defineConfig({ test: { testTimeout: 120_000, hookTimeout: 120_000 } });
