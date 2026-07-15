import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve firebase packages from functions/node_modules — the only copy in the
// repo. Single resolved path == single module instance == shared admin app.
const functionsRequire = createRequire(path.resolve(__dirname, 'functions/package.json'));

export default defineConfig({
  plugins: [
    {
      // Route ALL firebase-admin / firebase-functions imports (from test helpers
      // AND functions/src) to the single copy in functions/node_modules, so the
      // admin app initialized in tests is the same instance the pipeline sees.
      // (Was a resolve.alias customResolver — deprecated, removed in Vite 9.)
      name: 'single-firebase-admin-instance',
      enforce: 'pre' as const,
      resolveId(source: string) {
        if (/^(firebase-admin|firebase-functions)(\/.+)?$/.test(source)) {
          return functionsRequire.resolve(source);
        }
        return null;
      },
    },
  ],
  resolve: {
    alias: [
      { find: '@shared', replacement: path.resolve(__dirname, './shared') },
      { find: '@', replacement: path.resolve(__dirname, './src') },
    ],
  },
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.int.test.ts'],
    setupFiles: ['tests/integration/helpers/env.ts'],
    testTimeout: 15_000,
    hookTimeout: 30_000,
    // Suites share one emulator instance; run files sequentially so
    // clearFirestore() in one file can't wipe another file's data mid-test.
    fileParallelism: false,
  },
});
