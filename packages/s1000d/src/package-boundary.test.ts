import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import * as clipboardExports from './clipboard.js';
import * as rendererExports from './renderer.js';
import * as rootExports from './index.js';
import * as tiptapExports from './tiptap.js';

describe('S1000D package boundaries', () => {
  it('keeps subpath APIs out of the main entry', () => {
    expect('createS1000DTableExtensions' in rootExports).toBe(false);
    expect('createS1000DTableEditingPlugin' in rootExports).toBe(false);
    expect('serializeS1000DCellSelectionToHtml' in rootExports).toBe(false);
    expect('parseS1000DHtmlClipboard' in rootExports).toBe(false);
    expect('renderS1000DTableToHtml' in rootExports).toBe(false);
    expect('defaultS1000DTableTiptapOptions' in rootExports).toBe(false);
    expect('applyS1000DClipboardToSelection' in rootExports).toBe(false);

    expect(typeof rootExports.createS1000DTableNodeSpecs).toBe('function');
    expect(typeof rootExports.parseS1000DTableXml).toBe('function');
    expect(typeof rootExports.serializeS1000DTableXml).toBe('function');
    expect(typeof rootExports.validateS1000DTable).toBe('function');
    expect(typeof rootExports.addS1000DRowAfter).toBe('function');
    expect(typeof tiptapExports.createS1000DTableExtensions).toBe('function');
    expect(typeof tiptapExports.createS1000DTableEditingPlugin).toBe('function');
    expect(typeof clipboardExports.serializeS1000DCellSelectionToHtml).toBe('function');
    expect(typeof clipboardExports.parseS1000DHtmlClipboard).toBe('function');
    expect(typeof rendererExports.renderS1000DTableToHtml).toBe('function');

    const rootSource = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
    expect(rootSource).not.toContain("./tiptap.js");
    expect(rootSource).not.toContain("./clipboard.js");
    expect(rootSource).not.toContain("./renderer.js");
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
    expect(packageJson.exports['./renderer']).toBeDefined();
    expect(packageJson.exports['./tiptap']).toBeDefined();
    expect(packageJson.peerDependenciesMeta?.['@tiptap/core']?.optional).toBe(true);
    expect(packageJson.peerDependenciesMeta?.['prosemirror-view']?.optional).toBe(true);
  });
});
