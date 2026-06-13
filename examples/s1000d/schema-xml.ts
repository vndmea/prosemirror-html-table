import { Schema } from 'prosemirror-model';

import {
  createS1000DTableNodeSpecs,
  parseS1000DTableXml,
  serializeS1000DTableXml,
  validateS1000DTable,
} from 'prosemirror-html-table-s1000d';

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

const xml = '<table><tgroup cols="1"><tbody><row><entry>A</entry></row></tbody></tgroup></table>';
const table = parseS1000DTableXml(xml, schema);
const validation = validateS1000DTable(table, { profile: 'proced' });
const serialized = serializeS1000DTableXml(table);

console.log({ valid: validation.valid, serialized });
