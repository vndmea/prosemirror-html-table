import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/table-interaction/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2022',
  external: ['@tiptap/core', 'prosemirror-html-table'],
});
