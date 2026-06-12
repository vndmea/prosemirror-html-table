import { Schema } from 'prosemirror-model';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';

import {
  S1000DTableMap,
  canOperateOnS1000DTable,
  createS1000DTableGrid,
  findS1000DEntryContext,
  findS1000DRowContext,
  findS1000DTableContext,
  getActiveS1000DTgroupGrid,
  getS1000DEntryAt,
  normalizeS1000DTgroup,
  parseS1000DTableXml,
  rejectGraphicOnlyS1000DTable,
} from './index.js';
import { createS1000DTableNodeSpecs } from './schema.js';
import { extendedSchema, schema } from './tests/test-schema.js';

describe('S1000D table commands and adapters', () => {
  it('finds the active tgroup and grid for the current selection', () => {
    const table = parseS1000DTableXml(
      '<table id="tab-1"><tgroup cols="1"><tbody><row id="row-1"><entry>A</entry></row></tbody></tgroup><tgroup cols="2"><tbody><row id="row-2"><entry>B</entry><entry>C</entry></row></tbody></tgroup></table>',
      schema,
    );
    const doc = createDocSchema().nodes.doc!.create(null, [table]);
    const secondTgroupPos = 1 + table.child(0)!.nodeSize;
    const secondTgroup = table.child(1)!;
    const secondRowStart = secondTgroupPos + 1 + 1 + 1;
    const secondEntryPos = secondRowStart + 1;
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, secondEntryPos + 1),
    });

    const context = findS1000DTableContext(state);
    const grid = getActiveS1000DTgroupGrid(state);

    expect(context?.activeTgroupIndex).toBe(1);
    expect(grid?.width).toBe(2);
    expect(grid && getS1000DEntryAt(grid, 0, 1)?.node.textContent).toBe('C');
  });

  it('builds a cached map for a selected tgroup', () => {
    const table = parseS1000DTableXml(
      '<table id="tab-1"><tgroup cols="2"><tbody><row id="row-1"><entry namest="c1" nameend="c2">A</entry></row><row id="row-2"><entry>B</entry><entry>C</entry></row></tbody></tgroup></table>',
      extendedSchema,
      { profile: 'extended' },
    );
    const map = S1000DTableMap.get(table, 0);

    expect(S1000DTableMap.get(table, 0)).toBe(map);
    expect(map.width).toBe(2);
    expect(map.height).toBe(2);
    expect(map.cellsInRect({ left: 0, top: 0, right: 2, bottom: 2 })).toHaveLength(3);
  });

  it('prevents operation commands on graphic-only tables', () => {
    const table = parseS1000DTableXml(
      '<table id="tab-1"><graphic infoEntityIdent="ICN-001"/></table>',
      extendedSchema,
      { profile: 'extended' },
    );
    const doc = createExtendedDocSchema().nodes.doc!.create(null, [table]);
    const state = EditorState.create({
      doc,
      selection: NodeSelection.create(doc, 0),
    });

    expect(canOperateOnS1000DTable(state)).toBe(false);
    expect(rejectGraphicOnlyS1000DTable()(state)).toBe(false);
  });

  it('creates table-level grids for all tgroups', () => {
    const table = parseS1000DTableXml(
      '<table id="tab-1"><tgroup cols="1"><tbody><row id="row-1"><entry>A</entry></row></tbody></tgroup><tgroup cols="1"><tbody><row id="row-2"><entry>B</entry></row></tbody></tgroup></table>',
      schema,
    );

    const grid = createS1000DTableGrid(table);

    expect(grid.tgroups).toHaveLength(2);
    expect(grid.tgroups.map((item) => item.width)).toEqual([1, 1]);
  });

  it('finds row and entry contexts from the current selection', () => {
    const table = parseS1000DTableXml(
      '<table id="tab-1"><tgroup cols="2"><tbody><row id="row-1"><entry>A</entry><entry>B</entry></row></tbody></tgroup></table>',
      schema,
    );
    const doc = createDocSchema().nodes.doc!.create(null, [table]);
    const entryNode = table.child(0)!.child(0)!.child(0)!.child(0)!;
    const rowNode = table.child(0)!.child(0)!.child(0)!;
    const entryTextPos = findTextPosition(doc, 'A');
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, entryTextPos),
    });

    expect(rowNode.attrs.id).toBe('row-1');
    expect(entryNode.textContent).toBe('A');
    expect(findS1000DRowContext(state)?.rowRef.rowIndexInSection).toBe(0);
    expect(findS1000DEntryContext(state)?.entry.entryIndex).toBe(0);
  });

  it('normalizes short rows to the tgroup width', () => {
    const table = parseS1000DTableXml(
      '<table id="tab-1"><tgroup cols="3"><tbody><row id="row-1"><entry>A</entry></row></tbody></tgroup></table>',
      schema,
    );

    const normalized = normalizeS1000DTgroup(table.child(0)!);

    expect(normalized.attrs.cols).toBe('1');
    expect(normalized.child(0)!.child(0)!.childCount).toBe(1);
  });
});

function createDocSchema(): Schema {
  return new Schema({
    nodes: {
      doc: { content: 'block+' },
      text: { group: 'inline' },
      paragraph: {
        group: 'block',
        content: 'inline*',
        toDOM: () => ['p', 0],
      },
      ...createS1000DTableNodeSpecs(),
    },
  });
}

function createExtendedDocSchema(): Schema {
  return new Schema({
    nodes: {
      doc: { content: 'block+' },
      text: { group: 'inline' },
      paragraph: {
        group: 'block',
        content: 'inline*',
        toDOM: () => ['p', 0],
      },
      ...createS1000DTableNodeSpecs({ profile: 'extended' }),
    },
  });
}

function findTextPosition(doc: import('prosemirror-model').Node, text: string): number {
  let found: number | undefined;

  doc.descendants((node, pos) => {
    if (found !== undefined) return false;
    if (!node.isText || node.text !== text) return true;
    found = pos + 1;
    return false;
  });

  if (found === undefined) {
    throw new Error(`Unable to find text position for "${text}"`);
  }

  return found;
}
