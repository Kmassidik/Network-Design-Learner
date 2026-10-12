import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The engine is pure TypeScript with no DOM, so nothing here needs jsdom.
    // The canvas is verified in a real browser instead, because that is where
    // the pointer layer actually runs.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
