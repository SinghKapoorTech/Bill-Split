import { defineConfig } from 'vitest/config';
import path from 'path';

// Unit tests for pure logic (no DOM, no Firebase). Tests live in /tests so they
// are NOT pulled into the client or functions TypeScript builds (the functions
// tsconfig compiles ../shared, which must stay free of test-only imports).
export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, './shared'),
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.{test,spec}.ts'],
  },
});
