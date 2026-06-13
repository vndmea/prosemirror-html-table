import { Fragment, Schema, type Node as ProseMirrorNode } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';

import { S1000DCellSelection } from './index.js';
import { parseS1000DHtmlClipboard, serializeS1000DCellSelectionToHtml } from './clipboard.js';
import { createS1000DTableNodeSpecs } from './schema.js';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    text: { group: 'inline' },
    paragraph: {
      group: 'block',
      content: 'inline*',
      toDOM: () => ['p', 0],
      parseDOM: [{ tag: 'p' }],
    },
    ...createS1000DTableNodeSpecs({ profile: 'extended' }),
  },
});

describe('S1000D clipboard helpers', () => {
  it('serializes and parses clipboard payloads without relying on global Buffer', () => {
    const state = createStateWithSelection(['A', 'B', 'C', 'D'], [0, 3]);
    const originalBuffer = Object.getOwnPropertyDescriptor(globalThis, 'Buffer');
    const originalBtoa = globalThis.btoa;
    const originalAtob = globalThis.atob;

    if (typeof globalThis.btoa !== 'function' || typeof globalThis.atob !== 'function') {
      const bufferCtor = globalThis.Buffer;
      globalThis.btoa = (value: string) => bufferCtor.from(value, 'binary').toString('base64');
      globalThis.atob = (value: string) => bufferCtor.from(value, 'base64').toString('binary');
    }

    Object.defineProperty(globalThis, 'Buffer', {
      configurable: true,
      writable: true,
      value: undefined,
    });

    try {
      const html = serializeS1000DCellSelectionToHtml(state);
      expect(html).toContain('data-s1000d-clipboard=');

      const clipboard = parseS1000DHtmlClipboard(html ?? '', schema);
      expect(clipboard?.rows.map((row) => row.map((cell) => cell.text))).toEqual([
        ['A', 'B'],
        ['C', 'D'],
      ]);
    } finally {
      if (originalBuffer) {
        Object.defineProperty(globalThis, 'Buffer', originalBuffer);
      } else {
        delete (globalThis as { Buffer?: unknown }).Buffer;
      }

      if (originalBtoa) {
        globalThis.btoa = originalBtoa;
      } else {
        delete (globalThis as { btoa?: unknown }).btoa;
      }

      if (originalAtob) {
        globalThis.atob = originalAtob;
      } else {
        delete (globalThis as { atob?: unknown }).atob;
      }
    }
  });
});

function createStateWithSelection(texts: string[], selection: [number, number]): EditorState {
  const table = withEntryTexts(createTableNode(), texts);
  const doc = schema.nodes.doc!.create(null, [table]);
  const entryPositions = findNodePositions(doc, 's1000dEntry');

  return EditorState.create({
    schema,
    doc,
    selection: S1000DCellSelection.create(doc, entryPositions[selection[0]]!, entryPositions[selection[1]]!),
  });
}

function createTableNode(): ProseMirrorNode {
  const entry = (text = '') =>
    schema.nodes.s1000dEntry!.create(null, [
      schema.nodes.s1000dEntryBlock!.create({ xmlName: 'para' }, text ? schema.text(text) : undefined),
    ]);
  const row = (...texts: string[]) => schema.nodes.s1000dRow!.create(null, texts.map((text) => entry(text)));
  const tbody = schema.nodes.s1000dTbody!.create(null, [row('', ''), row('', '')]);
  const tgroup = schema.nodes.s1000dTgroup!.create({ cols: '2' }, [tbody]);
  return schema.nodes.s1000dTable!.create(null, [tgroup]);
}

function withEntryTexts(table: ProseMirrorNode, texts: string[]): ProseMirrorNode {
  let index = 0;
  const children: ProseMirrorNode[] = [];

  table.forEach((tgroup) => {
    const tgroupChildren: ProseMirrorNode[] = [];
    tgroup.forEach((section) => {
      const rows: ProseMirrorNode[] = [];
      section.forEach((row) => {
        const entries: ProseMirrorNode[] = [];
        row.forEach((entry) => {
          const text = texts[index++] ?? '';
          entries.push(entry.type.create(entry.attrs, [
            schema.nodes.s1000dEntryBlock!.create({ xmlName: 'para' }, text ? schema.text(text) : undefined),
          ]));
        });
        rows.push(row.copy(Fragment.fromArray(entries)));
      });
      tgroupChildren.push(section.copy(Fragment.fromArray(rows)));
    });
    children.push(tgroup.copy(Fragment.fromArray(tgroupChildren)));
  });

  return table.copy(Fragment.fromArray(children));
}

function findNodePositions(doc: ProseMirrorNode, typeName: string): number[] {
  const positions: number[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === typeName) {
      positions.push(pos);
    }
    return true;
  });
  return positions;
}
