import { Schema, type Node as ProseMirrorNode } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';

import { CellSelection, createHtmlTableNode, createHtmlTableNodeSpecs } from './index.js';

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

describe('CellSelection row and column helpers', () => {
  it('expands rowSelection to the full logical row', () => {
    const table = createHtmlTableNode(schema, { rows: 2, cols: 3, withHeaderRow: false });
    const doc = schema.nodes.doc!.create(null, [table]);
    const cellPositions = findNodePositions(doc, ['htmlTableCell']);
    const singleCellSelection = CellSelection.create(doc, cellPositions[1]!);

    const selection = CellSelection.rowSelection(singleCellSelection.$anchor);

    expect([selection.anchorCellPos, selection.headCellPos]).toEqual([
      cellPositions[0],
      cellPositions[2],
    ]);
    expect(selection.isRowSelection()).toBe(true);
    expect(selection.isColSelection()).toBe(false);
  });

  it('expands colSelection across head, body, and foot sections', () => {
    const table = schema.nodes.htmlTable!.create(null, [
      schema.nodes.htmlTableHead!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [
          createCell(schema.nodes.htmlTableHeaderCell!, 'head-1'),
          createCell(schema.nodes.htmlTableHeaderCell!, 'head-2'),
        ]),
      ]),
      schema.nodes.htmlTableBody!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [
          createCell(schema.nodes.htmlTableCell!, 'body-1'),
          createCell(schema.nodes.htmlTableCell!, 'body-2'),
        ]),
      ]),
      schema.nodes.htmlTableFoot!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [
          createCell(schema.nodes.htmlTableCell!, 'foot-1'),
          createCell(schema.nodes.htmlTableCell!, 'foot-2'),
        ]),
      ]),
    ]);
    const doc = schema.nodes.doc!.create(null, [table]);
    const cellPositions = findNodePositions(doc, ['htmlTableHeaderCell', 'htmlTableCell']);
    const singleCellSelection = CellSelection.create(doc, cellPositions[3]!);

    const selection = CellSelection.colSelection(singleCellSelection.$anchor);

    expect([selection.anchorCellPos, selection.headCellPos]).toEqual([
      cellPositions[1],
      cellPositions[5],
    ]);
    expect(selection.isColSelection()).toBe(true);
    expect(selection.isRowSelection()).toBe(false);
  });

  it('does not treat partial rectangular selections as full rows or columns', () => {
    const table = createHtmlTableNode(schema, { rows: 2, cols: 3, withHeaderRow: false });
    const doc = schema.nodes.doc!.create(null, [table]);
    const cellPositions = findNodePositions(doc, ['htmlTableCell']);
    const selection = CellSelection.create(doc, cellPositions[0]!, cellPositions[1]!);

    expect(selection.isRowSelection()).toBe(false);
    expect(selection.isColSelection()).toBe(false);
  });
});

function createCell(
  cellType: NonNullable<Schema['nodes'][string]>,
  text: string,
): ProseMirrorNode {
  return cellType.create(null, [schema.nodes.paragraph!.create(null, schema.text(text))]);
}

function findNodePositions(doc: ProseMirrorNode, typeNames: string[]): number[] {
  const positions: number[] = [];

  doc.descendants((node, pos) => {
    if (typeNames.includes(node.type.name)) positions.push(pos);
    return true;
  });

  return positions;
}
