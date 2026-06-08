import { Schema, type Node as ProseMirrorNode, type NodeSpec } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';

import { createHtmlTableNode, createHtmlTableNodeSpecs, type HtmlTableNodeNames } from './index.js';

const baseNodes: Record<'doc' | 'text' | 'paragraph', NodeSpec> = {
  doc: { content: 'block+' },
  text: { group: 'inline' },
  paragraph: {
    group: 'block',
    content: 'inline*',
    toDOM: () => ['p', 0] as const,
    parseDOM: [{ tag: 'p' }],
  },
};

const schema = createSchema();

describe('createHtmlTableNode', () => {
  it('creates a 3x3 body-only table by default', () => {
    const table = createHtmlTableNode(schema);
    const body = getRequiredChild(table, 'htmlTableBody');

    expect(table.type.name).toBe('htmlTable');
    expect(table.childCount).toBe(1);
    expect(body.childCount).toBe(3);

    for (let rowIndex = 0; rowIndex < body.childCount; rowIndex += 1) {
      const row = body.child(rowIndex);
      expect(row.childCount).toBe(3);
      for (let columnIndex = 0; columnIndex < row.childCount; columnIndex += 1) {
        const cell = row.child(columnIndex);
        expect(cell.type.name).toBe('htmlTableCell');
        expect(cell.content.size).toBeGreaterThan(0);
      }
    }
  });

  it('clamps generated row and column counts to at least one', () => {
    const table = createHtmlTableNode(schema, { rows: 0, cols: -3 });
    const body = getRequiredChild(table, 'htmlTableBody');

    expect(body.childCount).toBe(1);
    expect(body.child(0).childCount).toBe(1);
  });

  it('creates only the first generated row as header cells when requested', () => {
    const table = createHtmlTableNode(schema, { rows: 2, cols: 2, withHeaderRow: true });
    const body = getRequiredChild(table, 'htmlTableBody');

    expect(body.child(0).child(0).type.name).toBe('htmlTableHeaderCell');
    expect(body.child(0).child(1).type.name).toBe('htmlTableHeaderCell');
    expect(body.child(1).child(0).type.name).toBe('htmlTableCell');
    expect(body.child(1).child(1).type.name).toBe('htmlTableCell');
  });

  it('creates a caption with the provided text before the body', () => {
    const table = createHtmlTableNode(schema, {
      rows: 1,
      cols: 1,
      withCaption: true,
      captionText: 'Summary',
    });

    expect(table.child(0).type.name).toBe('htmlTableCaption');
    expect(table.child(0).textContent).toBe('Summary');
    expect(table.child(1).type.name).toBe('htmlTableBody');
  });

  it('creates an empty caption when caption support is enabled without text', () => {
    const table = createHtmlTableNode(schema, {
      rows: 1,
      cols: 1,
      withCaption: true,
    });

    expect(table.child(0).type.name).toBe('htmlTableCaption');
    expect(table.child(0).textContent).toBe('');
    expect(table.child(1).type.name).toBe('htmlTableBody');
  });

  it('uses custom node names for generated table structure', () => {
    const names = {
      table: 'table',
      caption: 'tableCaption',
      colgroup: 'tableColgroup',
      col: 'tableCol',
      head: 'tableHead',
      body: 'tableBody',
      foot: 'tableFoot',
      row: 'tableRow',
      headerCell: 'tableHeaderCell',
      cell: 'tableCell',
    } satisfies HtmlTableNodeNames;
    const customSchema = createSchema(names);
    const table = createHtmlTableNode(customSchema, {
      names,
      rows: 1,
      cols: 2,
      withCaption: true,
      withHeaderRow: true,
    });

    expect(table.type.name).toBe('table');
    expect(table.child(0).type.name).toBe('tableCaption');
    expect(table.child(1).type.name).toBe('tableBody');
    expect(table.child(1).child(0).type.name).toBe('tableRow');
    expect(table.child(1).child(0).child(0).type.name).toBe('tableHeaderCell');
    expect(table.child(1).child(0).child(1).type.name).toBe('tableHeaderCell');
  });

  it('throws a clear error when the schema is missing required table node types', () => {
    const schemaWithoutTable = new Schema({ nodes: baseNodes });

    expect(() => createHtmlTableNode(schemaWithoutTable)).toThrow('Missing node type in schema');
  });
});

function createSchema(names?: Partial<HtmlTableNodeNames>): Schema {
  return new Schema({
    nodes: {
      ...baseNodes,
      ...createHtmlTableNodeSpecs(names ? { names } : {}),
    },
  });
}

function getRequiredChild(node: ProseMirrorNode, typeName: string): ProseMirrorNode {
  for (let index = 0; index < node.childCount; index += 1) {
    const child = node.child(index);
    if (child.type.name === typeName) return child;
  }

  throw new Error(`Expected child node of type ${typeName}.`);
}
