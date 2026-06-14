import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: 'prosemirror-html-table-s1000d/clipboard', replacement: fileURLToPath(new URL('../../packages/s1000d/src/clipboard.ts', import.meta.url)) },
      { find: 'prosemirror-html-table-s1000d/renderer', replacement: fileURLToPath(new URL('../../packages/s1000d/src/renderer.ts', import.meta.url)) },
      { find: 'prosemirror-html-table-s1000d/tiptap', replacement: fileURLToPath(new URL('../../packages/s1000d/src/tiptap.ts', import.meta.url)) },
      { find: 'prosemirror-html-table-s1000d', replacement: fileURLToPath(new URL('../../packages/s1000d/src/index.ts', import.meta.url)) },
      { find: 'tiptap-html-table/table-interaction', replacement: fileURLToPath(new URL('../../packages/tiptap/src/table-interaction/index.ts', import.meta.url)) },
      { find: 'tiptap-html-table', replacement: fileURLToPath(new URL('../../packages/tiptap/src/index.ts', import.meta.url)) },
    ],
  },
});
