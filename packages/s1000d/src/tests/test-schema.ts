import { Schema } from 'prosemirror-model';
import { createS1000DTableNodeSpecs } from '../schema.js';

export const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    text: { group: 'inline' },
    paragraph: {
      group: 'block',
      content: 'inline*',
      toDOM: () => ['p', 0],
      parseDOM: [{ tag: 'p' }],
    },
    ...createS1000DTableNodeSpecs(),
  },
});

export const extendedSchema = new Schema({
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

export function canonicalXml(xml: string): string {
  return xml.replace(/>\s+</g, '><').trim();
}
