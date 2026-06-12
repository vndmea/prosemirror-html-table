import { Schema, type Node as ProseMirrorNode } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';

import { createFixTablesTransaction, createHtmlTableNodeSpecs } from './index.js';

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

describe('createFixTablesTransaction', () => {
  it('returns undefined when the document is already normalized', () => {
    const table = schema.nodes.htmlTable!.create(null, [
      schema.nodes.htmlTableBody!.create(null, [
        schema.nodes.htmlTableRow!.create(null, [
          schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create()]),
        ]),
      ]),
    ]);
    const state = EditorState.create({
      schema,
      doc: schema.nodes.doc!.create(null, [table]),
    });

    expect(createFixTablesTransaction(state)).toBeUndefined();
  });

  it('returns a transaction that fixes malformed tables across the document', () => {
    const malformedA = schema.nodes.htmlTable!.create(null, []);
    const malformedB = schema.nodes.htmlTable!.create(null, []);
    const state = EditorState.create({
      schema,
      doc: schema.nodes.doc!.create(null, [malformedA, malformedB]),
    });

    const transaction = createFixTablesTransaction(state);

    expect(transaction).toBeDefined();
    const nextDoc = transaction!.doc;
    expect(nextDoc.childCount).toBe(2);
    expect(nextDoc.child(0).firstChild?.childCount).toBe(1);
    expect(nextDoc.child(1).firstChild?.childCount).toBe(1);
  });

  it('does not repair unchanged malformed tables when oldState is provided', () => {
    const malformed = schema.nodes.htmlTable!.create(null, []);
    const state = EditorState.create({
      schema,
      doc: schema.nodes.doc!.create(null, [malformed]),
    });

    expect(createFixTablesTransaction(state, state)).toBeUndefined();
  });

  it('repairs only changed tables when oldState is provided', () => {
    const unchangedMalformed = schema.nodes.htmlTable!.create(null, []);
    const changedMalformed = schema.nodes.htmlTable!.create(null, []);
    const oldState = EditorState.create({
      schema,
      doc: schema.nodes.doc!.create(null, [unchangedMalformed, changedMalformed]),
    });
    const state = EditorState.create({
      schema,
      doc: schema.nodes.doc!.create(null, [
        unchangedMalformed,
        changedMalformed.type.create({ width: 480 }, changedMalformed.content),
      ]),
    });

    const transaction = createFixTablesTransaction(state, oldState);

    expect(transaction).toBeDefined();
    const nextDoc = transaction!.doc;
    expect(nextDoc.child(0).firstChild).toBeNull();
    expect(nextDoc.child(1).firstChild?.type.name).toBe('htmlTableBody');
    expect(nextDoc.child(1).firstChild?.childCount).toBe(1);
  });

  it('scopes incremental repair in a large multi-table document', () => {
    const unchangedMalformed = schema.nodes.htmlTable!.create(null, []);
    const changedMalformed = schema.nodes.htmlTable!.create(null, []);
    const prefixTables = Array.from({ length: 12 }, (_value, index) => createValidTable(`P${index}`));
    const suffixTables = Array.from({ length: 12 }, (_value, index) => createValidTable(`S${index}`));
    const oldState = EditorState.create({
      schema,
      doc: schema.nodes.doc!.create(null, [
        ...prefixTables,
        unchangedMalformed,
        changedMalformed,
        ...suffixTables,
      ]),
    });
    const state = EditorState.create({
      schema,
      doc: schema.nodes.doc!.create(null, [
        ...prefixTables,
        unchangedMalformed,
        changedMalformed.type.create({ width: 640 }, changedMalformed.content),
        ...suffixTables,
      ]),
    });

    const transaction = createFixTablesTransaction(state, oldState);

    expect(transaction).toBeDefined();
    const nextDoc = transaction!.doc;
    const unchangedIndex = prefixTables.length;
    const changedIndex = unchangedIndex + 1;
    expect(nextDoc.childCount).toBe(state.doc.childCount);
    expect(nextDoc.child(unchangedIndex).firstChild).toBeNull();
    expect(nextDoc.child(changedIndex).firstChild?.type.name).toBe('htmlTableBody');
    expect(nextDoc.child(0).eq(prefixTables[0]!)).toBe(true);
    expect(nextDoc.child(nextDoc.childCount - 1).eq(suffixTables[suffixTables.length - 1]!)).toBe(true);
  });
});

function createValidTable(text: string): ProseMirrorNode {
  return schema.nodes.htmlTable!.create(null, [
    schema.nodes.htmlTableBody!.create(null, [
      schema.nodes.htmlTableRow!.create(null, [
        schema.nodes.htmlTableCell!.create(null, [
          schema.nodes.paragraph!.create(null, schema.text(text)),
        ]),
      ]),
    ]),
  ]);
}
