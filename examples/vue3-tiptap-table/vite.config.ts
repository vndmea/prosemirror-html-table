import { fileURLToPath, URL } from 'node:url';

import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

const isGitHubPages = process.env.GITHUB_PAGES === 'true';

export default defineConfig({
  plugins: [vue()],
  base: isGitHubPages ? '/prosemirror-html-table/' : '/',
  ...(isGitHubPages && {
    build: {
      outDir: '../../docs',
      emptyOutDir: true,
    },
  }),
  resolve: {
    alias: {
      'prosemirror-html-table': fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url)),
      'tiptap-html-table': fileURLToPath(new URL('../../packages/tiptap/src/index.ts', import.meta.url)),
    },
  },
});
