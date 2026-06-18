import { Fragment, Schema, type Node as ProseMirrorNode } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { describe, expect, it } from 'vitest';

import {
  S1000DCellSelection,
  createS1000DTableNodeSpecs,
} from './index.js';
import { clearS1000DSelectedCells } from './clipboard.js';
import {
  createS1000DCellRangeTr,
  createS1000DColumnSelectTr,
  createS1000DRowSelectTr,
  createS1000DTableEditingPlugin,
  createS1000DTableExtensions,
  defaultS1000DTableTiptapOptions,
  findS1000DGridEntryPosition,
} from './tiptap.js';
import { findS1000DTableByResolvedPos, resolveRequiredS1000DTableContext } from './context.js';
import { getRenderedS1000DTableContext, s1000dTableDomAdapter } from './dom-adapter.js';
import { s1000dTableInteractionPluginKey } from './interaction.js';
import { applyS1000DColumnWidthsToTgroup, createS1000DTableOverlayPlugin } from './overlay.js';

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

  it('adds a node view for the table extension', () => {
    const extensions = createS1000DTableExtensions({ profile: 'extended' });
    const table = extensions.find((extension) => extension.name === 's1000dTable');

    expect(typeof table?.config.addNodeView).toBe('function');
    expect(s1000dTableDomAdapter.nodeName).toBe('s1000dTable');
    expect(typeof createS1000DTableOverlayPlugin).toBe('function');
  });

  it('resolves grid coordinates to entry positions through the tiptap helper', () => {
    const state = createStateWithSelection(['A', 'B', 'C', 'D'], [0, 0]);
    const entryPositions = findNodePositions(state.doc, 's1000dEntry');

    expect(findS1000DGridEntryPosition(state.doc, 0, 0)).toBe(entryPositions[0]);
    expect(findS1000DGridEntryPosition(state.doc, 1, 1)).toBe(entryPositions[3]);
    expect(findS1000DGridEntryPosition(state.doc, 5, 5)).toBeNull();
  });

  it('creates explicit row and column selection transactions for grid helpers', () => {
    const state = createStateWithSelection(['A', 'B', 'C', 'D'], [0, 0]);

    const rowSelection = createS1000DRowSelectTr(state, 1);
    const columnSelection = createS1000DColumnSelectTr(state, 1);

    expect(rowSelection?.selection).toBeInstanceOf(S1000DCellSelection);
    expect(rowSelection?.getMeta(s1000dTableInteractionPluginKey)).toEqual({
      selectedAxis: {
        kind: 'row',
        index: 1,
        tablePos: 0,
        tgroupIndex: 0,
      },
      selectedAxisExplicit: true,
    });
    expect(columnSelection?.selection).toBeInstanceOf(S1000DCellSelection);
    expect(columnSelection?.getMeta(s1000dTableInteractionPluginKey)).toEqual({
      selectedAxis: {
        kind: 'column',
        index: 1,
        tablePos: 0,
        tgroupIndex: 0,
      },
      selectedAxisExplicit: true,
    });
  });

  it('creates rectangular grid range selection transactions without axis metadata', () => {
    const state = createStateWithSelection(['A', 'B', 'C', 'D'], [0, 0]);
    const entryPositions = findNodePositions(state.doc, 's1000dEntry');

    const transaction = createS1000DCellRangeTr(state, 0, 0, 1, 1);

    expect(transaction?.selection).toBeInstanceOf(S1000DCellSelection);
    expect(transaction?.getMeta(s1000dTableInteractionPluginKey)).toBeUndefined();
    if (transaction?.selection instanceof S1000DCellSelection) {
      expect([
        transaction.selection.anchorEntryPos,
        transaction.selection.headEntryPos,
      ]).toEqual([entryPositions[0], entryPositions[3]]);
    }
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

  it('pastes into the entry that contains the current text cursor', () => {
    const plugin = createS1000DTableEditingPlugin(defaultS1000DTableTiptapOptions);
    const sourceState = createStateWithSelection(['A', 'B', 'C', 'D'], [0, 1]);
    const copyView = createView(sourceState);
    const copyEvent = createClipboardEvent();

    const copied = plugin.props.handleDOMEvents?.copy?.call(plugin, copyView, copyEvent as unknown as ClipboardEvent);
    expect(copied).toBe(true);

    const targetState = createStateWithTextCursor(['A', 'B', 'C', 'D'], 2);
    const targetView = createView(targetState);
    const pasteEvent = createClipboardEvent({
      html: copyEvent.clipboardData.getData('text/html'),
      plain: copyEvent.clipboardData.getData('text/plain'),
    });

    const handled = plugin.props.handleDOMEvents?.paste?.call(plugin, targetView, pasteEvent as unknown as ClipboardEvent);

    expect(handled).toBe(true);
    expect(pasteEvent.prevented).toBe(true);
    expect(getEntryTexts(targetView.state.doc)).toEqual(['A', 'B', 'A', 'B']);
    expect(targetView.state.selection).toBeInstanceOf(S1000DCellSelection);
    if (targetView.state.selection instanceof S1000DCellSelection) {
      const entryPositions = findNodePositions(targetView.state.doc, 's1000dEntry');
      expect([targetView.state.selection.anchorEntryPos, targetView.state.selection.headEntryPos]).toEqual([
        entryPositions[2]!,
        entryPositions[3]!,
      ]);
    }
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

  it('collapses cell selections back to a text cursor on Escape', () => {
    const plugin = createS1000DTableEditingPlugin(defaultS1000DTableTiptapOptions);
    const state = createStateWithSelection(['A', 'B', 'C', 'D'], [0, 1]);
    const view = createView(state);
    const event = createKeyboardEvent('Escape');

    const handled = plugin.props.handleKeyDown?.call(plugin, view, event as unknown as KeyboardEvent);

    expect(handled).toBe(true);
    expect(event.prevented).toBe(true);
    expect(view.state.selection).toBeInstanceOf(TextSelection);
  });

  it('preserves a multi-cell selection after clearing selected cells', () => {
    const state = createStateWithSelection(['A', 'B', 'C', 'D'], [0, 1]);
    const view = createView(state);

    const handled = clearS1000DSelectedCells(view.state, view.dispatch);

    expect(handled).toBe(true);
    expect(view.state.selection).toBeInstanceOf(S1000DCellSelection);
    if (view.state.selection instanceof S1000DCellSelection) {
      const entryPositions = findNodePositions(view.state.doc, 's1000dEntry');
      expect([view.state.selection.anchorEntryPos, view.state.selection.headEntryPos]).toEqual([
        entryPositions[0],
        entryPositions[1],
      ]);
    }
    expect(getEntryTexts(view.state.doc)).toEqual(['', '', 'C', 'D']);
  });

  it('extends an existing S1000D cell selection with Shift-ArrowRight', () => {
    const plugin = createS1000DTableEditingPlugin(defaultS1000DTableTiptapOptions);
    const state = createStateWithSelection(['A', 'B', 'C', 'D'], [0, 0]);
    const view = createView(state);
    const entryPositions = findNodePositions(state.doc, 's1000dEntry');
    const event = createKeyboardEvent('ArrowRight', { shiftKey: true });

    const handled = plugin.props.handleKeyDown?.call(plugin, view, event as unknown as KeyboardEvent);

    expect(handled).toBe(true);
    expect(event.prevented).toBe(true);
    expect(view.state.selection).toBeInstanceOf(S1000DCellSelection);
    if (view.state.selection instanceof S1000DCellSelection) {
      expect([view.state.selection.anchorEntryPos, view.state.selection.headEntryPos]).toEqual([
        entryPositions[0],
        entryPositions[1],
      ]);
    }
  });

  it('grows a rectangular S1000D cell range with Shift-ArrowRight then Shift-ArrowDown', () => {
    const plugin = createS1000DTableEditingPlugin(defaultS1000DTableTiptapOptions);
    const state = createStateWithTextCursor(['A', 'B', 'C', 'D'], 0);
    const view = createView(state);
    const entryPositions = findNodePositions(state.doc, 's1000dEntry');

    const firstHandled = plugin.props.handleKeyDown?.call(
      plugin,
      view,
      createKeyboardEvent('ArrowRight', { shiftKey: true }) as unknown as KeyboardEvent,
    );
    const secondHandled = plugin.props.handleKeyDown?.call(
      plugin,
      view,
      createKeyboardEvent('ArrowDown', { shiftKey: true }) as unknown as KeyboardEvent,
    );

    expect(firstHandled).toBe(true);
    expect(secondHandled).toBe(true);
    expect(view.state.selection).toBeInstanceOf(S1000DCellSelection);
    if (view.state.selection instanceof S1000DCellSelection) {
      expect([view.state.selection.anchorEntryPos, view.state.selection.headEntryPos]).toEqual([
        entryPositions[0],
        entryPositions[3],
      ]);
    }
  });

  it('resolves rendered table context with active tgroup metadata', () => {
    const state = createStateWithSelection(['A', 'B', 'C', 'D'], [0, 0]);
    const table = state.doc.child(0)!;
    const tableElement = createStubElement('table');
    const wrapperElement = createStubElement('div', {
      matches: (selector) => selector.includes('s1000d-table-wrapper'),
      querySelector: () => tableElement,
    });
    const view = {
      state,
      nodeDOM: (pos: number) => (pos === 0 ? wrapperElement : null),
    } as unknown as EditorView;

    const context = getRenderedS1000DTableContext(view, 0);

    expect(context).toMatchObject({
      tablePos: 0,
      table,
      dom: tableElement,
      wrapper: wrapperElement,
      activeTgroupIndex: 0,
    });
    expect(context?.activeTgroup?.type.name).toBe('s1000dTgroup');
  });

  it('writes resize widths back into colspec attrs', () => {
    const table = schema.nodes.s1000dTable!.create(null, [
      schema.nodes.s1000dTgroup!.create(
        { cols: '2' },
        [
          schema.nodes.s1000dColspec!.create({ colname: 'c1' }),
          schema.nodes.s1000dColspec!.create({ colname: 'c2', colwidth: '2*' }),
          schema.nodes.s1000dTbody!.create(null, [
            schema.nodes.s1000dRow!.create(null, [
              schema.nodes.s1000dEntry!.create(null, [
                schema.nodes.s1000dEntryBlock!.create({ xmlName: 'para' }, schema.text('A')),
              ]),
              schema.nodes.s1000dEntry!.create(null, [
                schema.nodes.s1000dEntryBlock!.create({ xmlName: 'para' }, schema.text('B')),
              ]),
            ]),
          ]),
        ],
      ),
    ]);
    const tgroup = table.child(0)!;

    const nextTgroup = applyS1000DColumnWidthsToTgroup(tgroup, [160, 240]);

    expect(nextTgroup.child(0)?.attrs.colwidth).toBe('160px');
    expect(nextTgroup.child(1)?.attrs.colwidth).toBe('240px');
    expect(nextTgroup.attrs.cols).toBe('2');
  });

  it('resolves table context correctly when looked up by exact tablePos', () => {
    const state = createStateWithSelection(['A', 'B', 'C', 'D'], [0, 3]);

    const located = findS1000DTableByResolvedPos(state.doc, 0);
    const context = resolveRequiredS1000DTableContext(state, { tablePos: 0 });

    expect(located).not.toBeNull();
    expect(located?.tablePos).toBe(0);
    expect(located?.table.type.name).toBe('s1000dTable');
    expect(context).not.toBeNull();
    expect(context?.tablePos).toBe(0);
    expect(context?.activeTgroupIndex).toBe(0);
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

function createStateWithTextCursor(texts: string[], entryIndex: number): EditorState {
  const table = withEntryTexts(createTableNode(), texts);
  const doc = schema.nodes.doc!.create(null, [table]);
  const entryPositions = findNodePositions(doc, 's1000dEntry');

  return EditorState.create({
    schema,
    doc,
    selection: TextSelection.near(doc.resolve(entryPositions[entryIndex]! + 1)),
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

function createKeyboardEvent(
  key: string,
  options: Partial<Pick<KeyboardEvent, 'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey'>> = {},
): {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  prevented: boolean;
  preventDefault: () => void;
} {
  return {
    key,
    shiftKey: options.shiftKey ?? false,
    ctrlKey: options.ctrlKey ?? false,
    metaKey: options.metaKey ?? false,
    altKey: options.altKey ?? false,
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
  };
}

function createStubElement(
  tagName: string,
  overrides: Partial<{
    matches: (selector: string) => boolean;
    querySelector: (selector: string) => unknown;
    closest: (selector: string) => unknown;
  }> = {},
) {
  const upper = tagName.toUpperCase();
  return {
    nodeType: 1,
    tagName: upper,
    nodeName: upper,
    matches: overrides.matches ?? ((selector: string) => selector === tagName || selector === tagName.toUpperCase()),
    querySelector: overrides.querySelector ?? (() => null),
    closest: overrides.closest ?? (() => null),
  } as unknown as HTMLElement;
}
