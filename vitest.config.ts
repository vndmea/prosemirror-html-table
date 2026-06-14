import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      'prosemirror-html-table': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
      'prosemirror-html-table-s1000d': fileURLToPath(new URL('./packages/s1000d/src/index.ts', import.meta.url)),
      'prosemirror-html-table-s1000d/clipboard': fileURLToPath(new URL('./packages/s1000d/src/clipboard.ts', import.meta.url)),
      'prosemirror-html-table-s1000d/tiptap': fileURLToPath(new URL('./packages/s1000d/src/tiptap.ts', import.meta.url)),
      'tiptap-html-table': fileURLToPath(new URL('./packages/tiptap/src/index.ts', import.meta.url)),
      'tiptap-html-table/table-interaction': fileURLToPath(new URL('./packages/tiptap/src/table-interaction/index.ts', import.meta.url)),
      'tiptap-html-table/table-interaction/dom-geometry': fileURLToPath(new URL('./packages/tiptap/src/table-interaction/dom-geometry.ts', import.meta.url)),
      'tiptap-html-table/table-interaction/overlay-geometry': fileURLToPath(new URL('./packages/tiptap/src/table-interaction/overlay-geometry.ts', import.meta.url)),
      'tiptap-html-table/table-interaction/overlay-host': fileURLToPath(new URL('./packages/tiptap/src/table-interaction/overlay-host.ts', import.meta.url)),
      'tiptap-html-table/table-interaction/resize-lifecycle': fileURLToPath(new URL('./packages/tiptap/src/table-interaction/resize-lifecycle.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['packages/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['packages/*/src/**/*.ts'],
      exclude: ['packages/*/src/index.ts'],
    },
  },
});
