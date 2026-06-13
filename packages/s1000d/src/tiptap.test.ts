import { Fragment, Schema, type Node as ProseMirrorNode } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { describe, expect, it } from 'vitest';

import {
  S1000DCellSelection,
  createS1000DTableNodeSpecs,
} from './index.js';
import {
  createS1000DTableEditingPlugin,
  createS1000DTableExtensions,
  defaultS1000DTableTiptapOptions,
} from './tiptap.js';

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

describe('S1000D tiptap integration', () => {
  it('creates a complete extension set for S1000D tables', () => {
    const extensions = createS1000DTableExtensions({ profile: 'extended' });

    expect(extensions.map((extension) => extension.name)).toEqual([
      's1000dTable',
      's1000dTitle',
      's1000dTgroup',
      's1000dColspec',
      's1000dSpanspec',
      's1000dThead',
      's1000dTbody',
      's1000dTfoot',
      's1000dRow',
      's1000dEntry',
      's1000dEntryBlock',
      's1000dGraphic',
    ]);
  });

  it('rejects custom names for the tiptap integration boundary', () => {
    expect(() => createS1000DTableExtensions({
      profile: 'extended',
      names: { table: 'customTable' },
    } as never)).toThrow(/custom node names/i);
  });

  it('keeps the current editor DOM structure explicit for nested table sections', () => {
    const extensions = createS1000DTableExtensions({ profile: 'extended' });
    const tgroup = extensions.find((extension) => extension.name === 's1000dTgroup');
    const tbody = extensions.find((extension) => extension.name === 's1000dTbody');
    const thead = extensions.find((extension) => extension.name === 's1000dThead');
    const renderContext = {
      name: 'test',
      options: defaultS1000DTableTiptapOptions,
      storage: {},
      parent: undefined,
      editor: undefined,
    };
    const render = (extension: (typeof extensions)[number] | undefined) =>
      extension?.config.renderHTML?.call(renderContext as never, { HTMLAttributes: {} } as never);

    expect(render(tgroup)).toEqual([
      'tbody',
      { 'data-s1000d': 'tgroup' },
      0,
    ]);
    expect(render(tbody)).toEqual([
      'tbody',
      { 'data-s1000d': 'tbody' },
      0,
    ]);
    expect(render(thead)).toEqual([
      'thead',
      { 'data-s1000d': 'thead' },
      0,
    ]);
  });

  it('writes html and plain text clipboard data for cell selections', () => {
    const plugin = createS1000DTableEditingPlugin(defaultS1000DTableTiptapOptions);
    const state = createStateWithSelection(['A', 'B', 'C', 'D'], [0, 3]);
    const view = createView(state);
    const event = createClipboardEvent();

    const handled = plugin.props.handleDOMEvents?.copy?.call(plugin, view, event as unknown as ClipboardEvent);

    expect(handled).toBe(true);
    expect(event.prevented).toBe(true);
    expect(event.clipboardData.getData('text/plain')).toBe('A\tB\nC\tD');
    expect(event.clipboardData.getData('text/html')).toContain('<table');
  });

  it('pastes TSV data into the current S1000D table selection', () => {
    const plugin = createS1000DTableEditingPlugin(defaultS1000DTableTiptapOptions);
    const state = createStateWithSelection(['a', 'b', 'c', 'd'], [0, 3]);
    const view = createView(state);
    const event = createClipboardEvent({ plain: 'X\tY\nZ\tW' });

    const handled = plugin.props.handleDOMEvents?.paste?.call(plugin, view, event as unknown as ClipboardEvent);

    expect(handled).toBe(true);
    expect(event.prevented).toBe(true);
    expect(getEntryTexts(view.state.doc)).toEqual(['X', 'Y', 'Z', 'W']);
  });

  it('deletes the whole table on Delete when every cell is selected', () => {
    const plugin = createS1000DTableEditingPlugin(defaultS1000DTableTiptapOptions);
    const state = createStateWithSelection(['A', 'B', 'C', 'D'], [0, 3]);
    const view = createView(state);
    const event = createKeyboardEvent('Delete');

    const handled = plugin.props.handleKeyDown?.call(plugin, view, event as unknown as KeyboardEvent);

    expect(handled).toBe(true);
    expect(event.prevented).toBe(true);
    expect(view.state.doc.child(0).type.name).toBe('paragraph');
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
    if (tgroup.type.name !== 's1000dTgroup') {
      children.push(tgroup);
      return;
    }

    const tgroupChildren: ProseMirrorNode[] = [];
    tgroup.forEach((section) => {
      if (section.type.name !== 's1000dTbody') {
        tgroupChildren.push(section);
        return;
      }

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

function createView(initialState: EditorState): EditorView & { state: EditorState } {
  const view = {} as EditorView & { state: EditorState };
  view.state = initialState;
  view.dispatch = (tr) => {
    view.state = view.state.apply(tr);
  };
  return view;
}

function createClipboardEvent(
  values: { html?: string; plain?: string } = {},
): {
  clipboardData: { getData: (type: string) => string; setData: (type: string, value: string) => void };
  prevented: boolean;
  preventDefault: () => void;
} {
  const data = new Map<string, string>();
  if (values.html) data.set('text/html', values.html);
  if (values.plain) data.set('text/plain', values.plain);

  return {
    clipboardData: {
      getData: (type: string) => data.get(type) ?? '',
      setData: (type: string, value: string) => {
        data.set(type, value);
      },
    },
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
  };
}

function createKeyboardEvent(key: string): { key: string; prevented: boolean; preventDefault: () => void } {
  return {
    key,
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
  };
}
