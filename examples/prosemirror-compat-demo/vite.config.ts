import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: {
      'prosemirror-html-table': fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url)),
    },
  },
});
