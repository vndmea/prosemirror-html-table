import { fileURLToPath, URL } from 'node:url';

import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      'prosemirror-html-table': fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url)),
      'tiptap-html-table': fileURLToPath(new URL('../../packages/tiptap/src/index.ts', import.meta.url)),
    },
  },
});
