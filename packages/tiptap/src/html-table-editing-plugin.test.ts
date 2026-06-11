import { Fragment, Schema, type Node as ProseMirrorNode } from '@tiptap/pm/model';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { describe, expect, it } from 'vitest';

import { CellSelection, createHtmlTableNode, createHtmlTableNodeSpecs } from 'prosemirror-html-table';

import { createHtmlTableEditingPlugin } from './html-table-editing-plugin.js';
import { defaultHtmlTableTiptapOptions } from './options.js';

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
    ...createHtmlTableNodeSpecs(),
  },
});

describe('html table editing plugin', () => {
  it('writes both html and plain text clipboard data for cell selections', () => {
    const plugin = createHtmlTableEditingPlugin(defaultHtmlTableTiptapOptions);
    const state = createStateWithSelection(['A', 'B', 'C', 'D'], [0, 3]);
    const view = createView(state);
    const event = createClipboardEvent();

    const handled = plugin.props.handleDOMEvents?.copy?.call(plugin, view, event as unknown as ClipboardEvent);

    expect(handled).toBe(true);
    expect(event.prevented).toBe(true);
    expect(event.clipboardData.getData('text/plain')).toBe('A\tB\nC\tD');
    expect(event.clipboardData.getData('text/html')).toContain('<table');
  });

  it('clears partial cell selections on Delete', () => {
    const plugin = createHtmlTableEditingPlugin(defaultHtmlTableTiptapOptions);
    const state = createStateWithSelection(['A', 'B', 'C', 'D'], [0, 1]);
    const view = createView(state);
    const event = createKeyboardEvent('Delete');

    const handled = plugin.props.handleKeyDown?.call(plugin, view, event as unknown as KeyboardEvent);

    expect(handled).toBe(true);
    expect(event.prevented).toBe(true);
    expect(getCellTexts(view.state.doc)).toEqual(['', '', 'C', 'D']);
  });

  it('deletes the table on Delete when every cell in the table is selected', () => {
    const plugin = createHtmlTableEditingPlugin(defaultHtmlTableTiptapOptions);
    const state = createStateWithSelection(['A', 'B', 'C', 'D'], [0, 3]);
    const view = createView(state);
    const event = createKeyboardEvent('Delete');

    const handled = plugin.props.handleKeyDown?.call(plugin, view, event as unknown as KeyboardEvent);

    expect(handled).toBe(true);
    expect(event.prevented).toBe(true);
    expect(view.state.doc.child(0).type.name).toBe('paragraph');
  });

  it('does not clear every cell when whole-table delete is disabled', () => {
    const plugin = createHtmlTableEditingPlugin({
      ...defaultHtmlTableTiptapOptions,
      deleteTableOnAllCellsSelected: false,
    });
    const state = createStateWithSelection(['A', 'B', 'C', 'D'], [0, 3]);
    const view = createView(state);
    const event = createKeyboardEvent('Delete');

    const handled = plugin.props.handleKeyDown?.call(plugin, view, event as unknown as KeyboardEvent);

    expect(handled).toBe(false);
    expect(event.prevented).toBe(false);
    expect(getCellTexts(view.state.doc)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('pastes TSV data into the current table selection', () => {
    const plugin = createHtmlTableEditingPlugin(defaultHtmlTableTiptapOptions);
    const state = createStateWithSelection(['a', 'b', 'c', 'd'], [0, 3]);
    const view = createView(state);
    const event = createClipboardEvent({ plain: 'X\tY\nZ\tW' });

    const handled = plugin.props.handleDOMEvents?.paste?.call(plugin, view, event as unknown as ClipboardEvent);

    expect(handled).toBe(true);
    expect(event.prevented).toBe(true);
    expect(getCellTexts(view.state.doc)).toEqual(['X', 'Y', 'Z', 'W']);
  });

  it('pastes into the cell that contains the current text cursor', () => {
    const plugin = createHtmlTableEditingPlugin(defaultHtmlTableTiptapOptions);
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
    expect(getCellTexts(targetView.state.doc)).toEqual(['A', 'B', 'A', 'B']);
    expect(targetView.state.selection).toBeInstanceOf(CellSelection);
    if (targetView.state.selection instanceof CellSelection) {
      const cellPositions = findNodePositions(targetView.state.doc, 'htmlTableCell');
      expect([targetView.state.selection.anchorCellPos, targetView.state.selection.headCellPos]).toEqual([
        cellPositions[2]!,
        cellPositions[3]!,
      ]);
    }
  });
});

function createStateWithSelection(texts: string[], selection: [number, number]): EditorState {
  const table = withCellTexts(createHtmlTableNode(schema, { rows: 2, cols: 2, withHeaderRow: false }), texts);
  const doc = schema.nodes.doc!.create(null, [table]);
  const cellPositions = findNodePositions(doc, 'htmlTableCell');
  return EditorState.create({
    schema,
    doc,
    selection: CellSelection.create(doc, cellPositions[selection[0]]!, cellPositions[selection[1]]!),
  });
}

function createStateWithTextCursor(texts: string[], cellIndex: number): EditorState {
  const table = withCellTexts(createHtmlTableNode(schema, { rows: 2, cols: 2, withHeaderRow: false }), texts);
  const doc = schema.nodes.doc!.create(null, [table]);
  const cellPositions = findNodePositions(doc, 'htmlTableCell');
  return EditorState.create({
    schema,
    doc,
    selection: TextSelection.near(doc.resolve(cellPositions[cellIndex]! + 1)),
  });
}

function createView(initialState: EditorState): EditorView & { state: EditorState } {
  const view = {} as EditorView & { state: EditorState };
  view.state = initialState;
  view.dispatch = (tr) => {
    view.state = view.state.apply(tr);
  };
  return view as EditorView & { state: EditorState };
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

function withCellTexts(table: ProseMirrorNode, texts: string[]): ProseMirrorNode {
  let index = 0;
  const children: ProseMirrorNode[] = [];
  table.forEach((child) => {
    if (child.type.name !== 'htmlTableBody') {
      children.push(child);
      return;
    }
    const rows: ProseMirrorNode[] = [];
    child.forEach((row) => {
      const cells: ProseMirrorNode[] = [];
      row.forEach((cell) => {
        const text = texts[index++] ?? '';
        cells.push(cell.type.create(cell.attrs, [schema.nodes.paragraph!.create(null, text ? schema.text(text) : undefined)]));
      });
      rows.push(row.copy(Fragment.fromArray(cells)));
    });
    children.push(child.copy(Fragment.fromArray(rows)));
  });
  return table.copy(Fragment.fromArray(children));
}

function getCellTexts(doc: ProseMirrorNode): string[] {
  const texts: string[] = [];
  doc.descendants((node) => {
    if (node.type.name === 'htmlTableCell') texts.push(node.textContent);
    return true;
  });
  return texts;
}

function findNodePositions(doc: ProseMirrorNode, typeName: string): number[] {
  const positions: number[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === typeName) positions.push(pos);
    return true;
  });
  return positions;
}
