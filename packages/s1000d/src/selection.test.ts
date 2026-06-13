import { Schema } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';

import { S1000DCellSelection, parseS1000DTableXml } from './index.js';
import { createS1000DTableNodeSpecs } from './schema.js';
import { extendedSchema } from './tests/test-schema.js';

const docSchema = new Schema({
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

describe('S1000DCellSelection helpers', () => {
  it('expands rowSelection to the full logical row', () => {
    const table = parseS1000DTableXml(
      '<table id="tab-1"><tgroup cols="3"><tbody><row id="row-1"><entry>A</entry><entry>B</entry><entry>C</entry></row><row id="row-2"><entry>D</entry><entry>E</entry><entry>F</entry></row></tbody></tgroup></table>',
      extendedSchema,
      { profile: 'extended' },
    );
    const doc = docSchema.nodes.doc!.create(null, [table]);
    const entryPositions = findNodePositions(doc, 's1000dEntry');
    const singleEntrySelection = S1000DCellSelection.create(doc, entryPositions[1]!);

    const selection = S1000DCellSelection.rowSelection(singleEntrySelection.$anchor);

    expect([selection.anchorEntryPos, selection.headEntryPos]).toEqual([
      entryPositions[0],
      entryPositions[2],
    ]);
    expect(selection.isRowSelection()).toBe(true);
    expect(selection.isColSelection()).toBe(false);
  });

  it('expands colSelection across tbody rows', () => {
    const table = parseS1000DTableXml(
      '<table id="tab-1"><title>Fault isolation</title><tgroup cols="2"><tbody><row id="row-1"><entry>A1</entry><entry>A2</entry></row><row id="row-2"><entry>B1</entry><entry>B2</entry></row><row id="row-3"><entry>C1</entry><entry>C2</entry></row></tbody></tgroup></table>',
      extendedSchema,
      { profile: 'extended' },
    );
    const doc = docSchema.nodes.doc!.create(null, [table]);
    const entryPositions = findNodePositions(doc, 's1000dEntry');
    const singleEntrySelection = S1000DCellSelection.create(doc, entryPositions[3]!);

    const selection = S1000DCellSelection.colSelection(singleEntrySelection.$anchor);

    expect([selection.anchorEntryPos, selection.headEntryPos]).toEqual([
      entryPositions[1],
      entryPositions[5],
    ]);
    expect(selection.isColSelection()).toBe(true);
    expect(selection.isRowSelection()).toBe(false);
  });

  it('serializes and deserializes JSON using official and legacy names', () => {
    const table = parseS1000DTableXml(
      '<table id="tab-1"><tgroup cols="2"><tbody><row id="row-1"><entry>A</entry><entry>B</entry></row><row id="row-2"><entry>C</entry><entry>D</entry></row></tbody></tgroup></table>',
      extendedSchema,
      { profile: 'extended' },
    );
    const doc = docSchema.nodes.doc!.create(null, [table]);
    const entryPositions = findNodePositions(doc, 's1000dEntry');
    const official = S1000DCellSelection.fromJSON(doc, {
      anchor: entryPositions[0]!,
      head: entryPositions[3]!,
    });
    const legacy = S1000DCellSelection.fromJSON(doc, {
      anchorEntryPos: entryPositions[1]!,
      headEntryPos: entryPositions[2]!,
    });

    expect(official.toJSON()).toEqual({
      type: 's1000d-table-cell',
      anchor: entryPositions[0],
      head: entryPositions[3],
      anchorEntryPos: entryPositions[0],
      headEntryPos: entryPositions[3],
    });
    expect([legacy.anchorEntryPos, legacy.headEntryPos]).toEqual([entryPositions[1], entryPositions[2]]);
  });
});

function findNodePositions(doc: import('prosemirror-model').Node, nodeName: string): number[] {
  const positions: number[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name === nodeName) {
      positions.push(pos);
    }
  });

  return positions;
}
