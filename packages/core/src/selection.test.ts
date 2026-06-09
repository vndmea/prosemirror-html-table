import { Fragment, Schema, type Node as ProseMirrorNode } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
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

  it('serializes partial selections as a table-internal slice grouped by section', () => {
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
    ]);
    const doc = schema.nodes.doc!.create(null, [table]);
    const cellPositions = findNodePositions(doc, ['htmlTableHeaderCell', 'htmlTableCell']);
    const selection = CellSelection.create(doc, cellPositions[1]!, cellPositions[3]!);
    const slice = selection.content();

    expect(slice.openStart).toBe(1);
    expect(slice.openEnd).toBe(1);
    expect(slice.content.childCount).toBe(2);
    expect(slice.content.child(0).type.name).toBe('htmlTableHead');
    expect(slice.content.child(1).type.name).toBe('htmlTableBody');
    expect(slice.content.child(0).firstChild?.firstChild?.textContent).toBe('head-2');
    expect(slice.content.child(1).firstChild?.firstChild?.textContent).toBe('body-2');
  });

  it('iterates selected cells once in top-left order', () => {
    const table = createHtmlTableNode(schema, { rows: 2, cols: 2, withHeaderRow: false });
    const doc = schema.nodes.doc!.create(null, [withCellTexts(table, ['A', 'B', 'C', 'D'])]);
    const cellPositions = findNodePositions(doc, ['htmlTableCell']);
    const selection = CellSelection.create(doc, cellPositions[0]!, cellPositions[3]!);
    const seen: Array<{ text: string; pos: number }> = [];

    selection.forEachCell((node, pos) => {
      seen.push({ text: node.textContent, pos });
    });

    expect(seen).toEqual([
      { text: 'A', pos: cellPositions[0] },
      { text: 'B', pos: cellPositions[1] },
      { text: 'C', pos: cellPositions[2] },
      { text: 'D', pos: cellPositions[3] },
    ]);
  });

  it('replaces selected cell contents with the provided slice semantics', () => {
    const table = createHtmlTableNode(schema, { rows: 2, cols: 2, withHeaderRow: false });
    const doc = schema.nodes.doc!.create(null, [withCellTexts(table, ['A', 'B', 'C', 'D'])]);
    const cellPositions = findNodePositions(doc, ['htmlTableCell']);
    const selection = CellSelection.create(doc, cellPositions[0]!, cellPositions[3]!);
    const state = EditorState.create({ schema, doc, selection });
    const nextParagraph = schema.nodes.paragraph!.create(null, schema.text('X'));
    const transaction = state.tr;

    selection.replaceWith(transaction, nextParagraph);

    expect(getCellTexts(transaction.doc)).toEqual(['', '', '', 'X']);
  });
});

function createCell(
  cellType: NonNullable<Schema['nodes'][string]>,
  text: string,
): ProseMirrorNode {
  return cellType.create(null, [schema.nodes.paragraph!.create(null, schema.text(text))]);
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
        cells.push(cell.type.create(
          cell.attrs,
          [schema.nodes.paragraph!.create(null, text ? schema.text(text) : undefined)],
        ));
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
    if (node.type.name === 'htmlTableCell') {
      texts.push(node.textContent);
    }

    return true;
  });

  return texts;
}

function findNodePositions(doc: ProseMirrorNode, typeNames: string[]): number[] {
  const positions: number[] = [];

  doc.descendants((node, pos) => {
    if (typeNames.includes(node.type.name)) positions.push(pos);
    return true;
  });

  return positions;
}
