import { Schema } from 'prosemirror-model';

import { createS1000DTableNodeSpecs, parseS1000DTableXml } from 'prosemirror-html-table-s1000d';
import { renderS1000DTableToHtml } from 'prosemirror-html-table-s1000d/renderer';

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
    ...createS1000DTableNodeSpecs({ profile: 'extended' }),
  },
});

const xml = '<table><title>Example</title><tgroup cols="2"><colspec colname="c1" colwidth="1*"/><colspec colname="c2" colwidth="2*"/><tbody><row><entry namest="c1" nameend="c2">A</entry></row></tbody></tgroup></table>';
const table = parseS1000DTableXml(xml, schema, { profile: 'extended' });
const html = renderS1000DTableToHtml(table, { profile: 'extended', strict: true });

console.log(html);
