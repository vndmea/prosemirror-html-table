import { Schema } from 'prosemirror-model';
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
});
