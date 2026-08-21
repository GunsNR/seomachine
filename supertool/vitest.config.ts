import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: { environment: 'node', include: ['tests/**/*.test.ts'], globals: false },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      // `server-only` throws on import outside a React Server Component.
      // Modules guarded by it are plain functions we want to unit test, so it
      // is stubbed here. The guard still applies in the real Next.js build.
      'server-only': resolve(__dirname, './tests/stubs/server-only.ts'),
    },
  },
});
