import { fileURLToPath, URL } from 'node:url';

import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

const isGitHubPages = process.env.GITHUB_PAGES === 'true';

export default defineConfig({
  plugins: [vue()],
  base: isGitHubPages ? '/prosemirror-html-table/' : '/',
  resolve: {
    alias: {
      'prosemirror-html-table': fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url)),
      'tiptap-html-table/styles.css': fileURLToPath(new URL('../../packages/tiptap/src/styles.css', import.meta.url)),
      'tiptap-html-table': fileURLToPath(new URL('../../packages/tiptap/src/index.ts', import.meta.url)),
    },
  },
  ...(isGitHubPages && {
    build: {
      outDir: '../../docs/site',
      emptyOutDir: true,
    },
  }),
});
