import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import * as clipboardExports from './clipboard.js';
import * as rootExports from './index.js';
import * as tiptapExports from './tiptap.js';

describe('S1000D package boundaries', () => {
  it('keeps tiptap and clipboard APIs out of the main entry', () => {
    expect('createS1000DTableExtensions' in rootExports).toBe(false);
    expect('createS1000DTableEditingPlugin' in rootExports).toBe(false);
    expect('serializeS1000DCellSelectionToHtml' in rootExports).toBe(false);
    expect('parseS1000DHtmlClipboard' in rootExports).toBe(false);
    expect(typeof tiptapExports.createS1000DTableExtensions).toBe('function');
    expect(typeof clipboardExports.serializeS1000DCellSelectionToHtml).toBe('function');

    const rootSource = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
    expect(rootSource).not.toContain("./tiptap.js");
    expect(rootSource).not.toContain("./clipboard.js");
  });

  it('declares subpath exports and optional tiptap peers', () => {
    const packageJson = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as {
      exports: Record<string, unknown>;
      peerDependenciesMeta?: Record<string, { optional?: boolean }>;
    };

    expect(packageJson.exports['.']).toBeDefined();
    expect(packageJson.exports['./clipboard']).toBeDefined();
    expect(packageJson.exports['./tiptap']).toBeDefined();
    expect(packageJson.peerDependenciesMeta?.['@tiptap/core']?.optional).toBe(true);
    expect(packageJson.peerDependenciesMeta?.['prosemirror-view']?.optional).toBe(true);
  });
});
