import { defineConfig } from 'vitest/config';

// tsconfig keeps jsx "preserve" for Next.js; tests compile JSX with the automatic runtime.
export default defineConfig({
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.{ts,tsx}'],
    setupFiles: ['test/setup.ts'],
    // The first test of a file pays for jsdom and module loading; slow CI machines need longer.
    testTimeout: 20_000,
  },
});
