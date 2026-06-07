import { Fragment, Schema, type MarkSpec, type Node as ProseMirrorNode } from 'prosemirror-model';
import { EditorState, NodeSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';

import {
  CellSelection,
  applyTableClipboardToSelection,
  createHtmlTableNode,
  createHtmlTableNodeSpecs,
  getSelectionMatrix,
  isWholeTableSelection,
  parseHtmlTableClipboard,
  parsePlainTextTableClipboard,
  serializeCellSelectionToHtmlTable,
  serializeCellSelectionToText,
} from './index.js';

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
  marks: {
    strong: {
      toDOM: () => ['strong', 0],
      parseDOM: [{ tag: 'strong' }],
    } satisfies MarkSpec,
    link: {
      attrs: { href: {} },
      toDOM: (mark) => ['a', { href: mark.attrs.href }, 0],
      parseDOM: [{ tag: 'a[href]', getAttrs: (dom) => ({ href: (dom as HTMLElement).getAttribute('href') }) }],
    } satisfies MarkSpec,
  },
});

describe('html table clipboard helpers', () => {
  it('serializes a cell range to TSV text', () => {
    const table = createHtmlTableNode(schema, { rows: 2, cols: 2, withHeaderRow: false });
    const state = createStateForTable(withCellTexts(table, ['A', 'B', 'C', 'D']));
    const cellPositions = findNodePositions(state.doc, 'htmlTableCell');
    const selectedState = EditorState.create({
      schema,
      doc: state.doc,
      selection: CellSelection.create(state.doc, cellPositions[0]!, cellPositions[3]!),
    });

    expect(serializeCellSelectionToText(selectedState)).toBe('A\tB\nC\tD');
  });

  it('serializes a cell range to HTML and preserves internal marks through payload parsing', () => {
    const strong = schema.marks.strong!.create();
    const link = schema.marks.link!.create({ href: 'https://example.com' });
    const table = schema.nodes.htmlTable!.create(null, [
      schema.nodes.htmlTableBody!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create(null, [
            schema.nodes.paragraph!.create(null, [
              schema.text('Bold', [strong]),
              schema.text(' '),
              schema.text('Link', [link]),
            ]),
          ]),
        ]),
      ]),
    ]);
    const state = createStateForTable(table);
    const html = serializeCellSelectionToHtmlTable(state);

    expect(html).toContain('<strong>Bold</strong>');
    expect(html).toContain('<a href="https://example.com">Link</a>');

    const parsed = parseHtmlTableClipboard(html!, schema);
    const firstCell = parsed?.rows[0]?.[0];
    const paragraph = firstCell?.content?.firstChild;

    expect(paragraph?.textContent).toBe('Bold Link');
    expect(paragraph?.firstChild?.marks[0]?.type.name).toBe('strong');
    expect(paragraph?.lastChild?.marks[0]?.type.name).toBe('link');
  });

  it('serializes a whole table selection with caption colgroup and sections', () => {
    const table = schema.nodes.htmlTable!.create({ width: 480 }, [
      schema.nodes.htmlTableCaption!.create(null, schema.text('Summary')),
      schema.nodes.htmlTableColgroup!.create(null, [
        schema.nodes.htmlTableCol!.create({ width: 120 }),
        schema.nodes.htmlTableCol!.create({ width: 360 }),
      ]),
      schema.nodes.htmlTableHead!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableHeaderCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('H1'))]),
          schema.nodes.htmlTableHeaderCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('H2'))]),
        ]),
      ]),
      schema.nodes.htmlTableBody!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('A1'))]),
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('A2'))]),
        ]),
      ]),
      schema.nodes.htmlTableFoot!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('F1'))]),
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('F2'))]),
        ]),
      ]),
    ]);
    const doc = schema.nodes.doc!.create(null, [table]);
    const state = EditorState.create({
      schema,
      doc,
      selection: NodeSelection.create(doc, 0),
    });

    const html = serializeCellSelectionToHtmlTable(state);

    expect(html).toContain('<caption>');
    expect(html).toContain('<colgroup>');
    expect(html).toContain('<thead>');
    expect(html).toContain('<tbody>');
    expect(html).toContain('<tfoot>');
  });

  it('applies TSV clipboard data to the selected cells', () => {
    const table = createHtmlTableNode(schema, { rows: 3, cols: 3, withHeaderRow: false });
    const state = createStateForTable(withCellTexts(table, ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']));
    const cellPositions = findNodePositions(state.doc, 'htmlTableCell');
    const selectedState = EditorState.create({
      schema,
      doc: state.doc,
      selection: CellSelection.create(state.doc, cellPositions[0]!, cellPositions[4]!),
    });
    const clipboard = parsePlainTextTableClipboard('X\tY\nZ\tW', schema)!;
    let nextState = selectedState;

    const result = applyTableClipboardToSelection(selectedState, (tr) => {
      nextState = selectedState.apply(tr);
    }, clipboard);

    expect(result).toBe(true);
    expect(getCellTexts(nextState.doc)).toEqual(['X', 'Y', 'c', 'Z', 'W', 'f', 'g', 'h', 'i']);
  });

  it('reports whole-table cell selections and exposes a selection matrix', () => {
    const table = createHtmlTableNode(schema, { rows: 2, cols: 2, withHeaderRow: false });
    const state = createStateForTable(withCellTexts(table, ['A', 'B', 'C', 'D']));
    const cellPositions = findNodePositions(state.doc, 'htmlTableCell');
    const selectedState = EditorState.create({
      schema,
      doc: state.doc,
      selection: CellSelection.create(state.doc, cellPositions[0]!, cellPositions[3]!),
    });

    expect(isWholeTableSelection(selectedState)).toBe(true);
    expect(getSelectionMatrix(selectedState).map((row) => row.map((cell) => cell?.node.textContent ?? ''))).toEqual([
      ['A', 'B'],
      ['C', 'D'],
    ]);
  });
});

function createStateForTable(table: ProseMirrorNode): EditorState {
  const doc = schema.nodes.doc!.create(null, [table]);
  const firstCellPos = findNodePositions(doc, 'htmlTableHeaderCell')[0] ?? findNodePositions(doc, 'htmlTableCell')[0];
  return EditorState.create({
    schema,
    doc,
    selection: CellSelection.create(doc, firstCellPos!),
  });
}

function withCellTexts(table: ProseMirrorNode, texts: string[]): ProseMirrorNode {
  let index = 0;
  const children: ProseMirrorNode[] = [];
  table.forEach((child) => {
    if (child.type.name !== 'htmlTableHead' && child.type.name !== 'htmlTableBody' && child.type.name !== 'htmlTableFoot') {
      children.push(child);
      return;
    }

    const rows: ProseMirrorNode[] = [];
    child.forEach((row) => {
      const cells: ProseMirrorNode[] = [];
      row.forEach((cell) => {
        const text = texts[index++] ?? '';
        cells.push(cell.type.create(cell.attrs, Fragment.from(schema.nodes.paragraph!.create(null, text ? schema.text(text) : undefined))));
      });
      rows.push(row.copy(Fragment.fromArray(cells)));
    });
    children.push(child.copy(Fragment.fromArray(rows)));
  });
  return table.copy(Fragment.fromArray(children));
}

function getCellTexts(doc: ProseMirrorNode): string[] {
  return findNodes(doc, 'htmlTableCell').map((cell) => cell.textContent);
}

function findNodes(doc: ProseMirrorNode, typeName: string): ProseMirrorNode[] {
  const nodes: ProseMirrorNode[] = [];
  doc.descendants((node) => {
    if (node.type.name === typeName) nodes.push(node);
    return true;
  });
  return nodes;
}

function findNodePositions(doc: ProseMirrorNode, typeName: string): number[] {
  const positions: number[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === typeName) positions.push(pos);
    return true;
  });
  return positions;
}
