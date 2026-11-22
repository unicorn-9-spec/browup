import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { $config: resolve('config') } },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
