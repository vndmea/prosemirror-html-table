import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: 'tiptap-html-table/table-interaction/dom-adapter',
        replacement: fileURLToPath(new URL('./packages/tiptap/src/table-interaction/dom-adapter.ts', import.meta.url)),
      },
      {
        find: 'tiptap-html-table/table-interaction/dom-geometry',
        replacement: fileURLToPath(new URL('./packages/tiptap/src/table-interaction/dom-geometry.ts', import.meta.url)),
      },
      {
        find: 'tiptap-html-table/table-interaction/menu-controller',
        replacement: fileURLToPath(new URL('./packages/tiptap/src/table-interaction/menu-controller.ts', import.meta.url)),
      },
      {
        find: 'tiptap-html-table/table-interaction/overlay-geometry',
        replacement: fileURLToPath(new URL('./packages/tiptap/src/table-interaction/overlay-geometry.ts', import.meta.url)),
      },
      {
        find: 'tiptap-html-table/table-interaction/overlay-host',
        replacement: fileURLToPath(new URL('./packages/tiptap/src/table-interaction/overlay-host.ts', import.meta.url)),
      },
      {
        find: 'tiptap-html-table/table-interaction/resize-lifecycle',
        replacement: fileURLToPath(new URL('./packages/tiptap/src/table-interaction/resize-lifecycle.ts', import.meta.url)),
      },
      {
        find: 'tiptap-html-table/table-interaction',
        replacement: fileURLToPath(new URL('./packages/tiptap/src/table-interaction/index.ts', import.meta.url)),
      },
      {
        find: 'prosemirror-html-table-s1000d/clipboard',
        replacement: fileURLToPath(new URL('./packages/s1000d/src/clipboard.ts', import.meta.url)),
      },
      {
        find: 'prosemirror-html-table-s1000d/tiptap',
        replacement: fileURLToPath(new URL('./packages/s1000d/src/tiptap.ts', import.meta.url)),
      },
      {
        find: 'prosemirror-html-table-s1000d',
        replacement: fileURLToPath(new URL('./packages/s1000d/src/index.ts', import.meta.url)),
      },
      {
        find: 'prosemirror-html-table',
        replacement: fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
      },
      {
        find: 'tiptap-html-table',
        replacement: fileURLToPath(new URL('./packages/tiptap/src/index.ts', import.meta.url)),
      },
    ],
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
