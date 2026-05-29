import { Schema } from 'prosemirror-model';
import { EditorState, NodeSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';

import { CellSelection, createHtmlTableNode, createHtmlTableNodeSpecs } from 'prosemirror-html-table';

import {
  applyColumnWidths,
  createColumnResizeTransaction,
  createColumnSelectionTransaction,
  createHtmlTableSelectionPlugin,
  createRowSelectionTransaction,
  createSelectionDecorations,
  getTableColumnWidths,
  measureRenderedColumnBoundaries,
  measureRenderedRowBoundaries,
} from './table-utils.js';
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

describe('table width utilities', () => {
  it('derives widths from colgroup and cell colwidth attrs', () => {
    const table = schema.nodes.htmlTable!.create(null, [
      schema.nodes.htmlTableColgroup!.create(null, [
        schema.nodes.htmlTableCol!.create({ width: 180 }),
        schema.nodes.htmlTableCol!.create({ width: 240 }),
      ]),
      createHtmlTableNode(schema, { rows: 1, cols: 2 }).child(0),
    ]);

    expect(getTableColumnWidths(table, 120)).toEqual([180, 240]);
  });

  it('applies widths into colgroup and cell colwidth arrays', () => {
    const table = createHtmlTableNode(schema, { rows: 1, cols: 2 });
    const resized = applyColumnWidths(table, [160, 220]);
    const colgroup = resized.child(0);
    const body = resized.child(resized.childCount - 1);
    const firstRow = body.child(0);

    expect(colgroup.type.name).toBe('htmlTableColgroup');
    expect(colgroup.child(0).attrs.width).toBe(160);
    expect(colgroup.child(1).attrs.width).toBe(220);
    expect(firstRow.child(0).attrs.colwidth).toEqual([160]);
    expect(firstRow.child(1).attrs.colwidth).toEqual([220]);
  });

  it('measures rendered column boundaries from actual cell boxes', () => {
    const table = createMeasuredTable(
      20,
      320,
      [
        [{ left: 20, right: 320, colSpan: 2 }],
        [
          { left: 20, right: 140 },
          { left: 140, right: 320 },
        ],
      ],
    );

    expect(measureRenderedColumnBoundaries(table)).toEqual([0, 120, 300]);
  });

  it('falls back to proportional boundaries when only spanning cells are rendered', () => {
    const table = createMeasuredTable(10, 370, [[{ left: 10, right: 370, colSpan: 3 }]]);

    expect(measureRenderedColumnBoundaries(table)).toEqual([0, 120, 240, 360]);
  });

  it('measures rendered row boundaries from actual row boxes', () => {
    const table = createMeasuredTable(
      10,
      370,
      [
        [{ left: 10, right: 370 }],
        [{ left: 10, right: 370 }],
      ],
      [
        { top: 20, bottom: 52 },
        { top: 52, bottom: 104 },
      ],
      20,
      104,
    );

    expect(measureRenderedRowBoundaries(table)).toEqual([0, 32, 84]);
  });

  it('measures row boundaries from the rendered grid area instead of the caption box', () => {
    const table = createMeasuredTable(
      10,
      370,
      [
        [{ left: 10, right: 370 }],
        [{ left: 10, right: 370 }],
      ],
      [
        { top: 44, bottom: 76 },
        { top: 76, bottom: 128 },
      ],
      20,
      128,
    );

    expect(measureRenderedRowBoundaries(table)).toEqual([0, 32, 84]);
  });

  it('builds resize transactions that preserve cell selections', () => {
    const table = createHtmlTableNode(schema, { rows: 1, cols: 2 });
    const doc = schema.nodes.doc!.create(null, [table]);
    const cellPositions = findNodePositions(doc, 'htmlTableCell');
    const state = EditorState.create({
      schema,
      doc,
      selection: CellSelection.create(doc, cellPositions[1]!),
    });

    const transaction = createColumnResizeTransaction(state, 0, table, [160, 220]);
    const nextState = state.apply(transaction);
    const resizedTable = nextState.doc.firstChild!;
    const colgroup = resizedTable.child(0);
    const body = resizedTable.child(resizedTable.childCount - 1);
    const firstRow = body.child(0);
    const nextCellPositions = findNodePositions(nextState.doc, 'htmlTableCell');

    expect(colgroup.child(0).attrs.width).toBe(160);
    expect(colgroup.child(1).attrs.width).toBe(220);
    expect(firstRow.child(0).attrs.colwidth).toEqual([160]);
    expect(firstRow.child(1).attrs.colwidth).toEqual([220]);
    expect(nextState.selection).toBeInstanceOf(CellSelection);
    expect((nextState.selection as CellSelection).anchorCellPos).toBe(nextCellPositions[1]);
    expect((nextState.selection as CellSelection).headCellPos).toBe(nextCellPositions[1]);
  });

  it('builds row selection transactions for a specific rendered row', () => {
    const table = createHtmlTableNode(schema, { rows: 2, cols: 2 });
    const doc = schema.nodes.doc!.create(null, [table]);
    const cellPositions = findNodePositions(doc, 'htmlTableCell');
    const state = EditorState.create({
      schema,
      doc,
      selection: CellSelection.create(doc, cellPositions[0]!),
    });

    const transaction = createRowSelectionTransaction(state, 0, table, 1);
    expect(transaction?.selection).toBeInstanceOf(CellSelection);
    expect((transaction?.selection as CellSelection).anchorCellPos).toBe(cellPositions[2]);
    expect((transaction?.selection as CellSelection).headCellPos).toBe(cellPositions[3]);
  });

  it('builds column selection transactions for a specific rendered column', () => {
    const table = createHtmlTableNode(schema, { rows: 2, cols: 2 });
    const doc = schema.nodes.doc!.create(null, [table]);
    const cellPositions = findNodePositions(doc, 'htmlTableCell');
    const state = EditorState.create({
      schema,
      doc,
      selection: CellSelection.create(doc, cellPositions[0]!),
    });

    const transaction = createColumnSelectionTransaction(state, 0, table, 1);
    expect(transaction?.selection).toBeInstanceOf(CellSelection);
    expect((transaction?.selection as CellSelection).anchorCellPos).toBe(cellPositions[1]);
    expect((transaction?.selection as CellSelection).headCellPos).toBe(cellPositions[3]);
  });

  it('prevents direct table node click selection when allowTableNodeSelection is disabled', () => {
    const table = createHtmlTableNode(schema, { rows: 1, cols: 1 });
    const plugin = createHtmlTableSelectionPlugin({
      ...defaultHtmlTableTiptapOptions,
      allowTableNodeSelection: false,
    });
    const handleClickOn = plugin.props.handleClickOn;

    const result = handleClickOn?.call(
      plugin,
      {} as never,
      0,
      table,
      0,
      {
        target: {
          closest: () => null,
        },
      } as unknown as MouseEvent,
      true,
    );

    expect(result).toBe(true);
  });

  it('allows direct table node click selection when allowTableNodeSelection is enabled', () => {
    const table = createHtmlTableNode(schema, { rows: 1, cols: 1 });
    const plugin = createHtmlTableSelectionPlugin(defaultHtmlTableTiptapOptions);
    const handleClickOn = plugin.props.handleClickOn;

    const result = handleClickOn?.call(
      plugin,
      {} as never,
      0,
      table,
      0,
      {
        target: {
          closest: () => null,
        },
      } as unknown as MouseEvent,
      true,
    );

    expect(result).toBe(false);
  });

  it('renders selected table decorations for node selections', () => {
    const table = createHtmlTableNode(schema, { rows: 1, cols: 1 });
    const doc = schema.nodes.doc!.create(null, [table]);
    const state = EditorState.create({
      schema,
      doc,
      selection: NodeSelection.create(doc, 0),
    });

    const decorations = createSelectionDecorations(state, defaultHtmlTableTiptapOptions);
    const found = decorations.find(0, doc.content.size);

    expect(found.length).toBeGreaterThan(0);
    expect(found.some((decoration) => decoration.from === 0 && decoration.to === table.nodeSize)).toBe(true);
  });
});

function findNodePositions(doc: import('prosemirror-model').Node, typeName: string): number[] {
  const positions: number[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name === typeName) {
      positions.push(pos);
    }

    return true;
  });

  return positions;
}

function createMeasuredTable(
  left: number,
  right: number,
  rows: Array<Array<{ left: number; right: number; colSpan?: number; rowSpan?: number }>>,
  rowRects?: Array<{ top: number; bottom: number }>,
  tableTop = 0,
  tableBottom = 24,
): HTMLTableElement {
  return {
    rows: rows.map((cells, rowIndex) => ({
      cells: cells.map((cell) => ({
        colSpan: cell.colSpan ?? 1,
        rowSpan: cell.rowSpan ?? 1,
        getBoundingClientRect: () =>
          createRect(
            cell.left,
            cell.right,
            rowRects?.[rowIndex]?.top ?? tableTop,
            rowRects?.[rowIndex]?.bottom ?? tableBottom,
          ),
      })),
      getBoundingClientRect: () =>
        createRect(
          left,
          right,
          rowRects?.[rowIndex]?.top ?? tableTop,
          rowRects?.[rowIndex]?.bottom ?? tableBottom,
        ),
    })),
    getBoundingClientRect: () => createRect(left, right, tableTop, tableBottom),
  } as unknown as HTMLTableElement;
}

function createRect(left: number, right: number, top = 0, bottom = 24): DOMRect {
  return {
    x: left,
    y: top,
    left,
    right,
    top,
    bottom,
    width: right - left,
    height: bottom - top,
    toJSON: () => ({}),
  } as DOMRect;
}
