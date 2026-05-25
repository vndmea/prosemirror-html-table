import { Schema } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';

import { createHtmlTableNodeSpecs, insertHtmlTable } from './index.js';

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

describe('insertHtmlTable', () => {
  it('inserts a generated HTML table at the current selection', () => {
    const state = EditorState.create({
      schema,
      doc: schema.nodes.doc!.create(null, [schema.nodes.paragraph!.create()]),
    });
    let nextState = state;

    const result = insertHtmlTable({ rows: 2, cols: 2, withHeaderRow: true, withCaption: true, captionText: 'Demo' })(
      state,
      (tr) => {
        nextState = state.apply(tr);
      },
    );

    expect(result).toBe(true);
    expect(nextState.doc.firstChild?.type.name).toBe('htmlTable');
    expect(nextState.doc.firstChild?.child(0).type.name).toBe('htmlTableCaption');
    expect(nextState.doc.firstChild?.child(1).type.name).toBe('htmlTableBody');
  });
});
