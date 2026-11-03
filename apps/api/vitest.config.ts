import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'unit', include: ['test/**/*.test.ts'], exclude: ['test/db/**'] } },
      {
        // One shared database, and the retention sweep and recipe rescoring
        // act on every row in it: two files running them at once can
        // deadlock or delete each other's fixtures. Run the files in turn.
        test: { name: 'db', include: ['test/db/**/*.test.ts'], fileParallelism: false },
      },
    ],
  },
});
