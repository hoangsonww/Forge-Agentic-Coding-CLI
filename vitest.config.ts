import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup-env.ts'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: ['test/**', 'dist/**', '**/*.config.*'],
    },
  },
});
