import { Fragment, Schema, type Node as ProseMirrorNode } from 'prosemirror-model';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { describe, expect, it } from 'vitest';

import { CellSelection, createHtmlTableNode, createHtmlTableNodeSpecs, tableEditing } from './index.js';

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

describe('tableEditing', () => {
  it('writes html and plain text clipboard data for cell selections', () => {
    const plugin = tableEditing();
    const state = createStateWithCellSelection(['A', 'B', 'C', 'D'], [0, 3]);
    const view = createView(state);
    const event = createClipboardEvent();

    const handled = plugin.props.handleDOMEvents?.copy?.call(plugin, view, event as unknown as ClipboardEvent);

    expect(handled).toBe(true);
    expect(event.prevented).toBe(true);
    expect(event.clipboardData.getData('text/plain')).toBe('A\tB\nC\tD');
    expect(event.clipboardData.getData('text/html')).toContain('<table');
  });

  it('clears partial cell selections on Delete', () => {
    const plugin = tableEditing();
    const state = createStateWithCellSelection(['A', 'B', 'C', 'D'], [0, 1]);
    const view = createView(state);
    const event = createKeyboardEvent('Delete');

    const handled = plugin.props.handleKeyDown?.call(plugin, view, event as unknown as KeyboardEvent);

    expect(handled).toBe(true);
    expect(event.prevented).toBe(true);
    expect(getCellTexts(view.state.doc)).toEqual(['', '', 'C', 'D']);
  });

  it('pastes tabular plain text into the current table selection', () => {
    const plugin = tableEditing();
    const state = createStateWithCellSelection(['a', 'b', 'c', 'd'], [0, 3]);
    const view = createView(state);
    const event = createClipboardEvent({ plain: 'X\tY\nZ\tW' });

    const handled = plugin.props.handleDOMEvents?.paste?.call(plugin, view, event as unknown as ClipboardEvent);

    expect(handled).toBe(true);
    expect(event.prevented).toBe(true);
    expect(getCellTexts(view.state.doc)).toEqual(['X', 'Y', 'Z', 'W']);
  });

  it('normalizes table node selections into whole-table CellSelections by default', () => {
    const plugin = tableEditing();
    const state = createStateWithTableSelection();
    const cellPositions = findNodePositions(state.doc, 'htmlTableCell');

    const appended = plugin.spec.appendTransaction?.([], state, state);

    expect(appended).toBeDefined();
    expect(appended!.selection).toBeInstanceOf(CellSelection);
    if (appended?.selection instanceof CellSelection) {
      expect([appended.selection.anchorCellPos, appended.selection.headCellPos]).toEqual([
        cellPositions[0],
        cellPositions[cellPositions.length - 1],
      ]);
    }
  });

  it('selects the clicked cell on triple click', () => {
    const plugin = tableEditing();
    const state = createStateWithTextCursor(['A', 'B', 'C', 'D'], 2);
    const view = createView(state);
    const cellPositions = findNodePositions(state.doc, 'htmlTableCell');

    const handled = plugin.props.handleTripleClick?.call(plugin, view, cellPositions[2]! + 2, {} as MouseEvent);

    expect(handled).toBe(true);
    expect(view.state.selection).toBeInstanceOf(CellSelection);
    if (view.state.selection instanceof CellSelection) {
      expect([view.state.selection.anchorCellPos, view.state.selection.headCellPos]).toEqual([
        cellPositions[2],
        cellPositions[2],
      ]);
    }
  });

  it('keeps table node selections when allowTableNodeSelection is true', () => {
    const plugin = tableEditing({ allowTableNodeSelection: true });
    const state = createStateWithTableSelection();

    const appended = plugin.spec.appendTransaction?.([], state, state);

    expect(appended).toBeUndefined();
  });

  it('applies plugin-level fixTables normalization in appendTransaction', () => {
    const plugin = tableEditing();
    const malformedTable = schema.nodes.htmlTable!.create(null, []);
    const state = EditorState.create({
      schema,
      doc: schema.nodes.doc!.create(null, [malformedTable]),
      plugins: [plugin],
    });

    const appended = plugin.spec.appendTransaction?.([], state, state);

    expect(appended).toBeDefined();
    expect(appended!.doc.child(0).firstChild?.childCount).toBe(1);
  });
});

function createStateWithCellSelection(texts: string[], selection: [number, number]): EditorState {
  const table = withCellTexts(createHtmlTableNode(schema, { rows: 2, cols: 2, withHeaderRow: false }), texts);
  const doc = schema.nodes.doc!.create(null, [table]);
  const cellPositions = findNodePositions(doc, 'htmlTableCell');

  return EditorState.create({
    schema,
    doc,
    selection: CellSelection.create(doc, cellPositions[selection[0]]!, cellPositions[selection[1]]!),
  });
}

function createStateWithTableSelection(): EditorState {
  const table = createHtmlTableNode(schema, { rows: 2, cols: 2, withHeaderRow: false });
  const doc = schema.nodes.doc!.create(null, [table]);

  return EditorState.create({
    schema,
    doc,
    selection: NodeSelection.create(doc, 0),
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
        const content = schema.nodes.paragraph!.create(null, text ? schema.text(text) : undefined);
        cells.push(cell.type.create(cell.attrs, [content]));
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
