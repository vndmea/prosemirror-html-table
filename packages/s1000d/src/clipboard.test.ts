import { Fragment, Schema, type Node as ProseMirrorNode } from 'prosemirror-model';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';

import { S1000DCellSelection } from './index.js';
import {
  applyS1000DClipboardToSelection,
  parseS1000DHtmlClipboard,
  parseS1000DPlainTextClipboard,
  serializeS1000DCellSelectionToHtml,
} from './clipboard.js';
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

  it('fills a multi-cell selection when pasting a single plain-text cell', () => {
    const state = createStateWithSelection(['A', 'B', 'C', 'D'], [0, 3]);
    const clipboard = parseS1000DPlainTextClipboard('Z', schema);
    expect(clipboard).not.toBeNull();

    let nextState = state;
    const applied = applyS1000DClipboardToSelection(state, (tr) => {
      nextState = nextState.apply(tr);
    }, clipboard!);

    expect(applied).toBe(true);
    expect(getEntryTexts(nextState.doc)).toEqual(['Z', 'Z', 'Z', 'Z']);
    expect(nextState.selection).toBeInstanceOf(S1000DCellSelection);
  });

  it('refuses to paste into merged targets and leaves the document unchanged', () => {
    const doc = schema.nodes.doc!.create(null, [createMergedTableNode()]);
    const state = EditorState.create({
      schema,
      doc,
      selection: S1000DCellSelection.create(doc, findNodePositions(doc, 's1000dEntry')[0]!),
    });
    const clipboard = parseS1000DPlainTextClipboard('X\tY', schema);
    expect(clipboard).not.toBeNull();

    let dispatched = false;
    const applied = applyS1000DClipboardToSelection(state, () => {
      dispatched = true;
    }, clipboard!);

    expect(applied).toBe(false);
    expect(dispatched).toBe(false);
    expect(state.doc.textContent).toContain('A');
  });

  it('replaces a whole-table node selection when the clipboard carries a table payload', () => {
    const sourceState = createStateWithSelection(['A', 'B', 'C', 'D'], [0, 3]);
    const html = serializeS1000DCellSelectionToHtml(sourceState, { tablePos: 0 });
    const clipboard = parseS1000DHtmlClipboard(html ?? '', schema);
    expect(clipboard?.table).toBeTruthy();

    const targetDoc = schema.nodes.doc!.create(null, [createTableNode()]);
    const targetState = EditorState.create({
      schema,
      doc: targetDoc,
      selection: NodeSelection.create(targetDoc, 0),
    });

    let nextState = targetState;
    const applied = applyS1000DClipboardToSelection(targetState, (tr) => {
      nextState = nextState.apply(tr);
    }, clipboard!);

    expect(applied).toBe(true);
    expect(nextState.doc.firstChild?.textContent).toContain('ABCD');
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

function getEntryTexts(doc: ProseMirrorNode): string[] {
  const texts: string[] = [];
  doc.descendants((node) => {
    if (node.type.name === 's1000dEntry') {
      texts.push(node.textContent);
    }
    return true;
  });
  return texts;
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

function createMergedTableNode(): ProseMirrorNode {
  const tbody = schema.nodes.s1000dTbody!.create(null, [
    schema.nodes.s1000dRow!.create(null, [
      schema.nodes.s1000dEntry!.create({ namest: 'c1', nameend: 'c2' }, [
        schema.nodes.s1000dEntryBlock!.create({ xmlName: 'para' }, schema.text('A')),
      ]),
    ]),
    schema.nodes.s1000dRow!.create(null, [
      schema.nodes.s1000dEntry!.create({ colname: 'c1' }, [
        schema.nodes.s1000dEntryBlock!.create({ xmlName: 'para' }, schema.text('B')),
      ]),
      schema.nodes.s1000dEntry!.create({ colname: 'c2' }, [
        schema.nodes.s1000dEntryBlock!.create({ xmlName: 'para' }, schema.text('C')),
      ]),
    ]),
  ]);
  const tgroup = schema.nodes.s1000dTgroup!.create({ cols: '2' }, [
    schema.nodes.s1000dColspec!.create({ colname: 'c1' }),
    schema.nodes.s1000dColspec!.create({ colname: 'c2' }),
    tbody,
  ]);
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
