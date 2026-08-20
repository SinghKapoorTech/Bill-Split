import { defineConfig } from 'vitest/config';

// Security-rules tests. These run the REAL firestore.rules against the
// emulator through the client SDK, so rules are actually enforced (the
// integration suite uses the Admin SDK, which bypasses them entirely).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/rules/**/*.rules.test.ts'],
    testTimeout: 15_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
