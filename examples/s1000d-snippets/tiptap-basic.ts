// Minimal type-level Tiptap setup example.
// For a browser demo, use this inside a real DOM/Vite application.
import { Editor } from '@tiptap/core';

import { createS1000DTableExtensions } from 'prosemirror-html-table-s1000d/tiptap';

const editor = new Editor({
  extensions: [
    ...createS1000DTableExtensions({ profile: 'proced' }),
  ],
});

console.log(editor.extensionManager.extensions.map((extension) => extension.name));
