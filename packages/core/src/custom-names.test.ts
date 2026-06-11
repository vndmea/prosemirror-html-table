import { Fragment, Schema, Slice, type Node as ProseMirrorNode } from 'prosemirror-model';
import { EditorState, type Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { describe, expect, it } from 'vitest';

import {
  CellSelection,
  HtmlTableMap,
  createFixTablesTransaction,
  createHtmlTableNode,
  createHtmlTableNodeSpecs,
  serializeCellSelectionToText,
  splitCellWithType,
  tableEditing,
  type HtmlTableNodeNames,
} from './index.js';
import { parseTableSliceClipboard } from './clipboard.js';

const names: HtmlTableNodeNames = {
  table: 'customTable',
  caption: 'customCaption',
  colgroup: 'customColgroup',
  col: 'customCol',
  head: 'customHead',
  body: 'customBody',
  foot: 'customFoot',
  row: 'customRow',
  headerCell: 'customHeaderCell',
  cell: 'customCell',
};

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
    ...createHtmlTableNodeSpecs({ names }),
  },
});

describe('custom html table node names', () => {
  it('supports CellSelection row, column, content, and clipboard serialization helpers', () => {
    const table = schema.nodes[names.table]!.create(null, [
      schema.nodes[names.head]!.create(null, [
        schema.nodes[names.row]!.create(null, [
          createCell(names.headerCell, 'H1'),
          createCell(names.headerCell, 'H2'),
        ]),
      ]),
      schema.nodes[names.body]!.create(null, [
        schema.nodes[names.row]!.create(null, [
          createCell(names.cell, 'A1'),
          createCell(names.cell, 'A2'),
        ]),
      ]),
      schema.nodes[names.foot]!.create(null, [
        schema.nodes[names.row]!.create(null, [
          createCell(names.cell, 'F1'),
          createCell(names.cell, 'F2'),
        ]),
      ]),
    ]);
    const doc = schema.nodes.doc!.create(null, [table]);
    const positions = findNodePositions(doc, [names.headerCell, names.cell]);
    const singleCellSelection = CellSelection.create(doc, positions[3]!);

    expect(HtmlTableMap.get(table).width).toBe(2);

    const rowSelection = CellSelection.rowSelection(singleCellSelection.$anchor);
    expect([rowSelection.anchorCellPos, rowSelection.headCellPos]).toEqual([positions[2], positions[3]]);
    expect(rowSelection.isRowSelection()).toBe(true);

    const colSelection = CellSelection.colSelection(singleCellSelection.$anchor);
    expect([colSelection.anchorCellPos, colSelection.headCellPos]).toEqual([positions[1], positions[5]]);
    expect(colSelection.isColSelection()).toBe(true);

    const crossSectionSelection = CellSelection.create(doc, positions[1]!, positions[3]!);
    const slice = crossSectionSelection.content();
    expect(slice.content.child(0).type.name).toBe(names.head);
    expect(slice.content.child(1).type.name).toBe(names.body);
    expect(parseTableSliceClipboard(slice, schema, { names })?.rows.map((row) => row.map((cell) => cell.text))).toEqual([
      ['H2'],
      ['A2'],
    ]);

    const state = EditorState.create({ schema, doc, selection: crossSectionSelection });
    expect(serializeCellSelectionToText(state, { names })).toBe('H2\nA2');
  });

  it('passes custom names through tableEditing paste and delete handling', () => {
    const table = withCellTexts(createHtmlTableNode(schema, { names, rows: 2, cols: 2 }), ['A', 'B', 'C', 'D']);
    const doc = schema.nodes.doc!.create(null, [table]);
    const positions = findNodePositions(doc, [names.cell]);
    const selection = CellSelection.create(doc, positions[0]!, positions[3]!);
    const plugin = tableEditing({ names });
    const view = createView(EditorState.create({ schema, doc, selection }));
    const paragraphSlice = new Slice(Fragment.from(schema.nodes.paragraph!.create(null, schema.text('X'))), 0, 0);

    expect(plugin.props.handlePaste?.call(plugin, view, null as unknown as ClipboardEvent, paragraphSlice)).toBe(true);
    expect(getCellTexts(view.state.doc)).toEqual(['X', 'X', 'X', 'X']);

    const event = createKeyboardEvent('Delete');
    expect(plugin.props.handleKeyDown?.call(plugin, view, event)).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(getCellTexts(view.state.doc)).toEqual(['', '', '', '']);
  });

  it('supports official compat splitCellWithType and fixTables with custom names', () => {
    const mergedCell = createCell(names.cell, 'A', { colspan: 2 });
    const table = schema.nodes[names.table]!.create(null, [
      schema.nodes[names.body]!.create(null, [
        schema.nodes[names.row]!.create(null, [mergedCell]),
      ]),
    ]);
    const doc = schema.nodes.doc!.create(null, [table]);
    const [cellPos] = findNodePositions(doc, [names.cell]);
    const state = EditorState.create({
      schema,
      doc,
      selection: CellSelection.create(doc, cellPos!),
    });
    let transaction: Transaction | undefined;

    const split = splitCellWithType(
      ({ col }) => schema.nodes[col === 0 ? names.headerCell : names.cell]!,
      { names },
    )(state, (tr) => {
      transaction = tr;
    });

    expect(split).toBe(true);
    expect(getCellNodeNames(transaction!.doc)).toEqual([names.headerCell, names.cell]);

    const invalidTable = schema.nodes[names.table]!.create(null, [
      schema.nodes[names.body]!.create(null, [
        schema.nodes[names.row]!.create(),
      ]),
    ]);
    const invalidState = EditorState.create({ schema, doc: schema.nodes.doc!.create(null, [invalidTable]) });
    const fixed = createFixTablesTransaction(invalidState, undefined, { names });

    expect(fixed).toBeDefined();
    expect(getCellNodeNames(fixed!.doc)).toEqual([names.cell]);
  });
});

function createCell(
  typeName: string,
  text: string,
  attrs?: Record<string, unknown>,
): ProseMirrorNode {
  return schema.nodes[typeName]!.create(attrs, [schema.nodes.paragraph!.create(null, schema.text(text))]);
}

function withCellTexts(table: ProseMirrorNode, texts: string[]): ProseMirrorNode {
  let index = 0;
  const children: ProseMirrorNode[] = [];

  table.forEach((section) => {
    const rows: ProseMirrorNode[] = [];
    section.forEach((row) => {
      const cells: ProseMirrorNode[] = [];
      row.forEach((cell) => {
        const text = texts[index++] ?? '';
        cells.push(cell.type.create(
          cell.attrs,
          [schema.nodes.paragraph!.create(null, text ? schema.text(text) : undefined)],
        ));
      });
      rows.push(row.copy(Fragment.fromArray(cells)));
    });
    children.push(section.copy(Fragment.fromArray(rows)));
  });

  return table.copy(Fragment.fromArray(children));
}

function createView(state: EditorState): EditorView & { state: EditorState } {
  let currentState = state;
  return {
    get state() {
      return currentState;
    },
    dispatch(tr: Transaction) {
      currentState = currentState.apply(tr);
    },
    endOfTextblock() {
      return true;
    },
  } as unknown as EditorView & { state: EditorState };
}

function createKeyboardEvent(key: string): KeyboardEvent {
  let prevented = false;
  return {
    key,
    get defaultPrevented() {
      return prevented;
    },
    preventDefault() {
      prevented = true;
    },
  } as KeyboardEvent;
}

function getCellTexts(doc: ProseMirrorNode): string[] {
  const texts: string[] = [];
  doc.descendants((node) => {
    if (node.type.name === names.cell || node.type.name === names.headerCell) {
      texts.push(node.textContent);
    }
    return true;
  });
  return texts;
}

function getCellNodeNames(doc: ProseMirrorNode): string[] {
  const nodeNames: string[] = [];
  doc.descendants((node) => {
    if (node.type.name === names.cell || node.type.name === names.headerCell) {
      nodeNames.push(node.type.name);
    }
    return true;
  });
  return nodeNames;
}

function findNodePositions(doc: ProseMirrorNode, typeNames: string[]): number[] {
  const positions: number[] = [];

  doc.descendants((node, pos) => {
    if (typeNames.includes(node.type.name)) positions.push(pos);
    return true;
  });

  return positions;
}
