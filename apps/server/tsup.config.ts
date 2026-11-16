import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts', 'src/serverless.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  splitting: false,
  // Shared source uses TypeScript; bundle it so production Node never imports
  // workspace .ts files or relies on a development loader.
  noExternal: [/^@mimi\/shared(?:\/|$)/],
});
