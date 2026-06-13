import { Schema } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';

import {
  S1000DCellSelection,
  createS1000DTableNodeSpecs,
  parseS1000DTableXml,
} from 'prosemirror-html-table-s1000d';
import {
  parseS1000DHtmlClipboard,
  serializeS1000DCellSelectionToHtml,
} from 'prosemirror-html-table-s1000d/clipboard';

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
    ...createS1000DTableNodeSpecs({ profile: 'proced' }),
  },
});

const table = parseS1000DTableXml(
  '<table><tgroup cols="1"><tbody><row><entry>A</entry></row></tbody></tgroup></table>',
  schema,
);
const doc = schema.topNodeType.createAndFill(null, [table]);

if (!doc) {
  throw new Error('Failed to build example document.');
}

const entryPositions: number[] = [];
doc.descendants((node, pos) => {
  if (node.type.name === 's1000dEntry') {
    entryPositions.push(pos);
  }
  return true;
});

const state = EditorState.create({
  schema,
  doc,
  selection: S1000DCellSelection.create(doc, entryPositions[0]!),
});
const html = serializeS1000DCellSelectionToHtml(state);
const parsed = html ? parseS1000DHtmlClipboard(html, schema) : null;

console.log({
  hasHtml: Boolean(html),
  parsedRows: parsed?.rows.length ?? 0,
  firstCell: parsed?.rows[0]?.[0]?.text ?? null,
});
