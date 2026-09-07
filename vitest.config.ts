import { defineConfig, configDefaults } from 'vitest/config';
import path from 'path';

const alias = {
  '@shared': path.resolve(__dirname, './shared'),
  '@': path.resolve(__dirname, './src'),
};

// Two projects, both run by `npm test` so CI keeps a single hard gate:
//
//  - `unit`  — pure logic, node env, no DOM and no Firebase. Tests live in
//    /tests so they are NOT pulled into the client or functions TypeScript
//    builds (the functions tsconfig compiles ../shared, which must stay free
//    of test-only imports).
//  - `react` — jsdom env, for hooks/components whose bugs live in RENDER AND
//    ASYNC ORDERING and are therefore invisible to a pure test. The
//    people-loss race is the motivating case: the defect is a state write
//    from a stale render closure across an await, which only reproduces with
//    a real React render loop.
export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/**/*.{test,spec}.ts'],
          // Emulator-backed suites are excluded: they need Java + the
          // Firestore emulator. Run them with `npm run test:integration` /
          // `npm run test:rules`.
          exclude: [
            ...configDefaults.exclude,
            'tests/integration/**',
            'tests/rules/**',
            'tests/react/**',
          ],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'react',
          environment: 'jsdom',
          include: ['tests/react/**/*.{test,spec}.{ts,tsx}'],
          setupFiles: ['./tests/react/setup.ts'],
        },
      },
    ],
  },
});
