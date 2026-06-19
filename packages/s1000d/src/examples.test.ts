import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

function readExample(relativePath: string): string {
  return readFileSync(new URL(`../../../examples/s1000d-snippets/${relativePath}`, import.meta.url), 'utf8');
}

describe('S1000D examples', () => {
  it('uses public package entrypoints in all example files', () => {
    const schemaXml = readExample('schema-xml.ts');
    const rendererBasic = readExample('renderer-basic.ts');
    const tiptapBasic = readExample('tiptap-basic.ts');
    const clipboardBasic = readExample('clipboard-basic.ts');

    expect(schemaXml).toContain("from 'prosemirror-html-table-s1000d'");
    expect(rendererBasic).toContain("from 'prosemirror-html-table-s1000d'");
    expect(rendererBasic).toContain("from 'prosemirror-html-table-s1000d/renderer'");
    expect(tiptapBasic).toContain("from 'prosemirror-html-table-s1000d/tiptap'");
    expect(clipboardBasic).toContain("from 'prosemirror-html-table-s1000d'");
    expect(clipboardBasic).toContain("from 'prosemirror-html-table-s1000d/clipboard'");

    expect(schemaXml).not.toContain('./index.js');
    expect(rendererBasic).not.toContain('./index.js');
    expect(tiptapBasic).not.toContain('./index.js');
    expect(clipboardBasic).not.toContain('./index.js');
  });

  it('keeps clipboard and tiptap examples aligned with the documented boundaries', () => {
    const clipboardBasic = readExample('clipboard-basic.ts');
    const tiptapBasic = readExample('tiptap-basic.ts');

    expect(clipboardBasic).toContain('S1000DCellSelection.create');
    expect(clipboardBasic).toContain('serializeS1000DCellSelectionToHtml(state)');
    expect(clipboardBasic).toContain('parsedRows');
    expect(tiptapBasic).toContain('Minimal type-level Tiptap setup example.');
    expect(tiptapBasic).toContain('real DOM/Vite application');
  });
});
