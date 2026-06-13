import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/lib/table3d/core/__tests__/**/*.test.ts'],
    environment: 'node',
  },
});
