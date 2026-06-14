import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

function readWorkspaceFile(relativePath: string): string {
  return readFileSync(new URL(`../../../${relativePath}`, import.meta.url), 'utf8');
}

describe('S1000D package boundaries', () => {
  it('keeps overlay dependencies on public tiptap table-interaction exports only', () => {
    const overlay = readWorkspaceFile('packages/s1000d/src/overlay.ts');

    expect(overlay).toContain("from 'tiptap-html-table/table-interaction'");
    expect(overlay).not.toContain('../../tiptap/src/');
    expect(overlay).not.toContain('../tiptap/');
  });

  it('keeps s1000d commands independent from html-table command implementations', () => {
    const commands = readWorkspaceFile('packages/s1000d/src/commands.ts');

    expect(commands).not.toContain("from 'prosemirror-html-table'");
    expect(commands).not.toContain('from "prosemirror-html-table"');
    expect(commands).not.toContain('packages/core');
    expect(commands).not.toContain('../core/');
    expect(commands).not.toContain('../../core/');
  });

  it('does not let tiptap import s1000d implementation files', () => {
    const tiptapOverlay = readWorkspaceFile('packages/tiptap/src/html-table-overlay-view.ts');
    const tiptapPackage = readWorkspaceFile('packages/tiptap/package.json');

    expect(tiptapOverlay).not.toContain('packages/s1000d');
    expect(tiptapOverlay).not.toContain("from 'prosemirror-html-table-s1000d");
    expect(tiptapPackage).toContain('"./table-interaction"');
  });

  it('keeps s1000d public subpath boundaries explicit', () => {
    const packageJson = readWorkspaceFile('packages/s1000d/package.json');
    const index = readWorkspaceFile('packages/s1000d/src/index.ts');
    const overlay = readWorkspaceFile('packages/s1000d/src/overlay.ts');

    expect(packageJson).toContain('"./clipboard"');
    expect(packageJson).toContain('"./renderer"');
    expect(packageJson).toContain('"./tiptap"');
    expect(index).not.toContain("./tiptap.js");
    expect(index).not.toContain("./clipboard.js");
    expect(index).not.toContain("./renderer.js");
    expect(overlay).toContain("from 'tiptap-html-table/table-interaction'");
  });

  it('keeps examples on public package entrypoints', () => {
    const examples = readWorkspaceFile('packages/s1000d/src/examples.test.ts');
    expect(examples).toContain("from 'prosemirror-html-table-s1000d'");
    expect(examples).toContain("from 'prosemirror-html-table-s1000d/tiptap'");
    expect(examples).toContain("from 'prosemirror-html-table-s1000d/clipboard'");
    expect(examples).toContain("from 'prosemirror-html-table-s1000d/renderer'");
  });
});
