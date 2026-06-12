import { Schema } from 'prosemirror-model';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';

import {
  S1000DTableMap,
  addS1000DColumnAfter,
  addS1000DColumnBefore,
  addS1000DRowAfter,
  addS1000DRowBefore,
  canOperateOnS1000DTable,
  createS1000DTableAdapter,
  createS1000DTableGrid,
  deleteS1000DColumn,
  deleteS1000DRow,
  findS1000DEntryContext,
  findS1000DRowContext,
  findS1000DTableContext,
  getActiveS1000DTgroupGrid,
  getS1000DEntryAt,
  moveS1000DColumnLeft,
  moveS1000DColumnRight,
  moveS1000DRowDown,
  moveS1000DRowUp,
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

  it('exposes adapter helpers for empty entries, span copies, and normalization', () => {
    const table = parseS1000DTableXml(
      '<table id="tab-1"><tgroup cols="3"><tbody><row id="row-1"><entry namest="c1" nameend="c2" morerows="1">A</entry></row></tbody></tgroup></table>',
      schema,
    );
    const adapter = createS1000DTableAdapter();
    const entry = table.child(0)!.child(0)!.child(0)!.child(0)!;
    const copied = adapter.copyEntryWithSpan(entry, {
      namest: 'c2',
      nameend: 'c3',
      morerows: '2',
    });
    const empty = adapter.createEmptyEntry(table);
    const normalized = adapter.normalizeTable(table);

    expect(copied.attrs.namest).toBe('c2');
    expect(copied.attrs.nameend).toBe('c3');
    expect(copied.attrs.morerows).toBe('2');
    expect(empty.type.name).toBe('s1000dEntry');
    expect(normalized.child(0)!.attrs.cols).toBe('1');
    expect(normalized.child(0)!.child(0)!.childCount).toBe(1);
  });

  it('adds and deletes rows with stable selection recovery', () => {
    const table = parseS1000DTableXml(
      '<table id="tab-1"><tgroup cols="2"><tbody><row id="row-1"><entry>A</entry><entry>B</entry></row><row id="row-2"><entry>C</entry><entry>D</entry></row></tbody></tgroup></table>',
      schema,
    );
    const doc = schema.nodes.doc!.create(null, [table]);
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, findTextPosition(doc, 'A')),
    });

    let nextState = state;
    const addResult = addS1000DRowAfter()(state, (transaction) => {
      nextState = nextState.apply(transaction);
    });

    expect(addResult).toBe(true);
    const addedContext = findS1000DRowContext(nextState);
    expect(addedContext?.rowRef.rowIndexInSection).toBe(1);
    expect(addedContext?.row.childCount).toBe(2);
    expect(addedContext?.row.textContent).toBe('');
    expect(findS1000DTableContext(nextState)?.table.child(0)?.child(0)?.childCount).toBe(3);

    const deleteResult = deleteS1000DRow()(nextState, (transaction) => {
      nextState = nextState.apply(transaction);
    });

    expect(deleteResult).toBe(true);
    const deletedContext = findS1000DRowContext(nextState);
    expect(deletedContext?.rowRef.rowIndexInSection).toBe(1);
    expect(deletedContext?.row.textContent).toBe('CD');
    expect(findS1000DTableContext(nextState)?.table.child(0)?.child(0)?.childCount).toBe(2);
  });

  it('adds a row before the current row and selects it', () => {
    const table = parseS1000DTableXml(
      '<table id="tab-1"><tgroup cols="2"><tbody><row id="row-1"><entry>A</entry><entry>B</entry></row><row id="row-2"><entry>C</entry><entry>D</entry></row></tbody></tgroup></table>',
      schema,
    );
    const doc = schema.nodes.doc!.create(null, [table]);
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, findTextPosition(doc, 'C')),
    });

    let nextState = state;
    const result = addS1000DRowBefore()(state, (transaction) => {
      nextState = nextState.apply(transaction);
    });

    expect(result).toBe(true);
    const rowContext = findS1000DRowContext(nextState);
    expect(rowContext?.rowRef.rowIndexInSection).toBe(1);
    expect(rowContext?.row.textContent).toBe('');
    expect(findS1000DTableContext(nextState)?.table.child(0)?.child(0)?.childCount).toBe(3);
  });

  it('moves rows up and down within the same section', () => {
    const table = parseS1000DTableXml(
      '<table id="tab-1"><tgroup cols="2"><tbody><row id="row-1"><entry>A</entry><entry>B</entry></row><row id="row-2"><entry>C</entry><entry>D</entry></row><row id="row-3"><entry>E</entry><entry>F</entry></row></tbody></tgroup></table>',
      schema,
    );
    const doc = schema.nodes.doc!.create(null, [table]);
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, findTextPosition(doc, 'C')),
    });

    let nextState = state;
    const moveUpResult = moveS1000DRowUp()(state, (transaction) => {
      nextState = nextState.apply(transaction);
    });

    expect(moveUpResult).toBe(true);
    const movedUpRows = findS1000DTableContext(nextState)?.table.child(0)?.child(0);
    expect(movedUpRows?.child(0)?.textContent).toBe('CD');
    expect(movedUpRows?.child(1)?.textContent).toBe('AB');
    expect(findS1000DRowContext(nextState)?.rowRef.rowIndexInSection).toBe(0);
    expect(findS1000DRowContext(nextState)?.row.textContent).toBe('CD');

    const moveDownResult = moveS1000DRowDown()(nextState, (transaction) => {
      nextState = nextState.apply(transaction);
    });

    expect(moveDownResult).toBe(true);
    const movedDownRows = findS1000DTableContext(nextState)?.table.child(0)?.child(0);
    expect(movedDownRows?.child(0)?.textContent).toBe('AB');
    expect(movedDownRows?.child(1)?.textContent).toBe('CD');
    expect(findS1000DRowContext(nextState)?.rowRef.rowIndexInSection).toBe(1);
    expect(findS1000DRowContext(nextState)?.row.textContent).toBe('CD');
  });

  it('rejects row move when morerows is involved', () => {
    const table = parseS1000DTableXml(
      '<table id="tab-1"><tgroup cols="2"><tbody><row id="row-1"><entry morerows="1">A</entry><entry>B</entry></row><row id="row-2"><entry>C</entry></row><row id="row-3"><entry>D</entry><entry>E</entry></row></tbody></tgroup></table>',
      extendedSchema,
      { profile: 'extended' },
    );
    const doc = extendedSchema.nodes.doc!.create(null, [table]);
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, findTextPosition(doc, 'D')),
    });

    expect(moveS1000DRowUp()(state)).toBe(false);
  });

  it('adds and deletes columns for simple tgroups with stable selection recovery', () => {
    const table = parseS1000DTableXml(
      '<table id="tab-1"><tgroup cols="2"><tbody><row id="row-1"><entry>A</entry><entry>B</entry></row><row id="row-2"><entry>C</entry><entry>D</entry></row></tbody></tgroup></table>',
      schema,
    );
    const doc = schema.nodes.doc!.create(null, [table]);
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, findTextPosition(doc, 'B')),
    });

    let nextState = state;
    const addAfterResult = addS1000DColumnAfter()(state, (transaction) => {
      nextState = nextState.apply(transaction);
    });

    expect(addAfterResult).toBe(true);
    expect(findS1000DTableContext(nextState)?.table.child(0)?.attrs.cols).toBe('3');
    expect(findS1000DRowContext(nextState)?.row.childCount).toBe(3);
    expect(findS1000DEntryContext(nextState)?.entry.columnIndex).toBe(2);
    expect(findS1000DEntryContext(nextState)?.entry.node.textContent).toBe('');

    const deleteResult = deleteS1000DColumn()(nextState, (transaction) => {
      nextState = nextState.apply(transaction);
    });

    expect(deleteResult).toBe(true);
    expect(findS1000DTableContext(nextState)?.table.child(0)?.attrs.cols).toBe('2');
    expect(findS1000DRowContext(nextState)?.row.childCount).toBe(2);
    expect(findS1000DEntryContext(nextState)?.entry.columnIndex).toBe(1);
    expect(findS1000DEntryContext(nextState)?.entry.node.textContent).toBe('B');
  });

  it('adds a column before the current entry and selects it', () => {
    const table = parseS1000DTableXml(
      '<table id="tab-1"><tgroup cols="2"><tbody><row id="row-1"><entry>A</entry><entry>B</entry></row><row id="row-2"><entry>C</entry><entry>D</entry></row></tbody></tgroup></table>',
      schema,
    );
    const doc = schema.nodes.doc!.create(null, [table]);
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, findTextPosition(doc, 'D')),
    });

    let nextState = state;
    const result = addS1000DColumnBefore()(state, (transaction) => {
      nextState = nextState.apply(transaction);
    });

    expect(result).toBe(true);
    expect(findS1000DTableContext(nextState)?.table.child(0)?.attrs.cols).toBe('3');
    expect(findS1000DEntryContext(nextState)?.entry.columnIndex).toBe(1);
    expect(findS1000DEntryContext(nextState)?.entry.node.textContent).toBe('');
  });

  it('moves simple columns left and right with stable selection recovery', () => {
    const table = parseS1000DTableXml(
      '<table id="tab-1"><tgroup cols="3"><tbody><row id="row-1"><entry>A</entry><entry>B</entry><entry>C</entry></row><row id="row-2"><entry>D</entry><entry>E</entry><entry>F</entry></row></tbody></tgroup></table>',
      schema,
    );
    const doc = schema.nodes.doc!.create(null, [table]);
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, findTextPosition(doc, 'B')),
    });

    let nextState = state;
    const moveLeftResult = moveS1000DColumnLeft()(state, (transaction) => {
      nextState = nextState.apply(transaction);
    });

    expect(moveLeftResult).toBe(true);
    const movedLeftRows = findS1000DTableContext(nextState)?.table.child(0)?.child(0);
    expect(movedLeftRows?.child(0)?.textContent).toBe('BAC');
    expect(movedLeftRows?.child(1)?.textContent).toBe('EDF');
    expect(findS1000DEntryContext(nextState)?.entry.columnIndex).toBe(0);
    expect(findS1000DEntryContext(nextState)?.entry.node.textContent).toBe('B');

    const moveRightResult = moveS1000DColumnRight()(nextState, (transaction) => {
      nextState = nextState.apply(transaction);
    });

    expect(moveRightResult).toBe(true);
    const movedRightRows = findS1000DTableContext(nextState)?.table.child(0)?.child(0);
    expect(movedRightRows?.child(0)?.textContent).toBe('ABC');
    expect(movedRightRows?.child(1)?.textContent).toBe('DEF');
    expect(findS1000DEntryContext(nextState)?.entry.columnIndex).toBe(1);
    expect(findS1000DEntryContext(nextState)?.entry.node.textContent).toBe('B');
  });

  it('moves simple colspec-backed columns and keeps colspec order aligned', () => {
    const table = parseS1000DTableXml(
      '<table id="tab-1"><tgroup cols="3"><colspec colname="c1" colnum="1"/><colspec colname="c2" colnum="2"/><colspec colname="c3" colnum="3"/><tbody><row id="row-1"><entry colname="c1">A</entry><entry colname="c2">B</entry><entry colname="c3">C</entry></row></tbody></tgroup></table>',
      extendedSchema,
      { profile: 'extended' },
    );
    const doc = extendedSchema.nodes.doc!.create(null, [table]);
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, findTextPosition(doc, 'B')),
    });

    let nextState = state;
    const result = moveS1000DColumnRight()(state, (transaction) => {
      nextState = nextState.apply(transaction);
    });

    expect(result).toBe(true);
    const nextTable = findS1000DTableContext(nextState)?.table;
    const nextTgroup = nextTable?.child(0);
    const nextTbody = nextTgroup?.child(3);
    expect(nextTbody?.child(0)?.textContent).toBe('ACB');
    expect(nextTgroup?.child(0)?.attrs.colname).toBe('c1');
    expect(nextTgroup?.child(1)?.attrs.colname).toBe('c3');
    expect(nextTgroup?.child(2)?.attrs.colname).toBe('c2');
    expect(nextTgroup?.child(0)?.attrs.colnum).toBe('1');
    expect(nextTgroup?.child(1)?.attrs.colnum).toBe('2');
    expect(nextTgroup?.child(2)?.attrs.colnum).toBe('3');
    expect(findS1000DEntryContext(nextState)?.entry.columnIndex).toBe(2);
    expect(findS1000DEntryContext(nextState)?.entry.node.textContent).toBe('B');
  });

  it('rejects column move when complex spans are involved', () => {
    const table = parseS1000DTableXml(
      '<table id="tab-1"><tgroup cols="3"><colspec colname="c1" colnum="1"/><colspec colname="c2" colnum="2"/><colspec colname="c3" colnum="3"/><spanspec spanname="wide" namest="c1" nameend="c2"/><tbody><row id="row-1"><entry spanname="wide">A</entry><entry colname="c3">B</entry></row></tbody></tgroup></table>',
      extendedSchema,
      { profile: 'extended' },
    );
    const doc = extendedSchema.nodes.doc!.create(null, [table]);
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, findTextPosition(doc, 'B')),
    });

    expect(moveS1000DColumnLeft()(state)).toBe(false);
  });

  it('moves columns when morerows is involved but entries remain single-column', () => {
    const table = parseS1000DTableXml(
      '<table id="tab-1"><tgroup cols="3"><tbody><row id="row-1"><entry morerows="1">A</entry><entry>B</entry><entry>C</entry></row><row id="row-2"><entry>D</entry><entry>E</entry></row></tbody></tgroup></table>',
      extendedSchema,
      { profile: 'extended' },
    );
    const doc = extendedSchema.nodes.doc!.create(null, [table]);
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, findTextPosition(doc, 'B')),
    });

    let nextState = state;
    const result = moveS1000DColumnRight()(state, (transaction) => {
      nextState = nextState.apply(transaction);
    });

    expect(result).toBe(true);
    const nextTable = findS1000DTableContext(nextState)?.table;
    const nextTgroup = nextTable?.child(0);
    const nextTbody = nextTgroup?.child(0);
    expect(nextTbody?.child(0)?.textContent).toBe('ACB');
    expect(nextTbody?.child(1)?.textContent).toBe('ED');
    expect(nextTbody?.child(0)?.child(0)?.attrs.morerows).toBe('1');
    expect(findS1000DEntryContext(nextState)?.entry.columnIndex).toBe(2);
    expect(findS1000DEntryContext(nextState)?.entry.node.textContent).toBe('B');
  });

  it('deletes a spanned column in colspec tables by shrinking namest/nameend', () => {
    const table = parseS1000DTableXml(
      '<table id="tab-1"><tgroup cols="3"><colspec colname="c1" colnum="1"/><colspec colname="c2" colnum="2"/><colspec colname="c3" colnum="3"/><tbody><row id="row-1"><entry namest="c1" nameend="c2">A</entry><entry colname="c3">B</entry></row><row id="row-2"><entry colname="c1">C</entry><entry colname="c2">D</entry><entry colname="c3">E</entry></row></tbody></tgroup></table>',
      extendedSchema,
      { profile: 'extended' },
    );
    const doc = extendedSchema.nodes.doc!.create(null, [table]);
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, findTextPosition(doc, 'D')),
    });

    let nextState = state;
    const result = deleteS1000DColumn()(state, (transaction) => {
      nextState = nextState.apply(transaction);
    });

    expect(result).toBe(true);
    const nextTable = findS1000DTableContext(nextState)?.table;
    const nextTgroup = nextTable?.child(0);
    const nextTbody = nextTgroup?.child(2);
    const firstRowFirstEntry = nextTbody?.child(0)?.child(0);
    expect(nextTgroup?.attrs.cols).toBe('2');
    expect(nextTgroup?.childCount).toBe(3);
    expect(nextTgroup?.child(0)?.attrs.colname).toBe('c1');
    expect(nextTgroup?.child(1)?.attrs.colname).toBe('c3');
    expect(firstRowFirstEntry?.attrs.namest).toBeNull();
    expect(firstRowFirstEntry?.attrs.nameend).toBeNull();
    expect(firstRowFirstEntry?.textContent).toBe('A');
    expect(findS1000DEntryContext(nextState)?.entry.columnIndex).toBe(1);
    expect(findS1000DEntryContext(nextState)?.entry.node.textContent).toBe('E');
  });

  it('adds a column after a spanspec-backed entry', () => {
    const table = parseS1000DTableXml(
      '<table id="tab-1"><tgroup cols="3"><colspec colname="c1" colnum="1"/><colspec colname="c2" colnum="2"/><colspec colname="c3" colnum="3"/><spanspec spanname="wide" namest="c1" nameend="c2"/><tbody><row id="row-1"><entry spanname="wide">A</entry><entry colname="c3">B</entry></row></tbody></tgroup></table>',
      extendedSchema,
      { profile: 'extended' },
    );
    const doc = extendedSchema.nodes.doc!.create(null, [table]);
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, findTextPosition(doc, 'A')),
    });

    let nextState = state;
    const result = addS1000DColumnAfter()(state, (transaction) => {
      nextState = nextState.apply(transaction);
    });

    expect(result).toBe(true);
    const nextTable = findS1000DTableContext(nextState)?.table;
    const nextTgroup = nextTable?.child(0);
    const nextTbody = nextTgroup?.child(5);
    expect(nextTgroup?.attrs.cols).toBe('4');
    expect(nextTgroup?.childCount).toBe(6);
    expect(nextTgroup?.child(4)?.attrs.spanname).toBe('wide');
    expect(nextTbody?.child(0)?.childCount).toBe(3);
    expect(findS1000DEntryContext(nextState)?.entry.columnIndex).toBe(2);
    expect(findS1000DEntryContext(nextState)?.entry.node.textContent).toBe('');
  });

  it('deletes a column from a spanspec-backed entry and collapses it when needed', () => {
    const table = parseS1000DTableXml(
      '<table id="tab-1"><tgroup cols="3"><colspec colname="c1" colnum="1"/><colspec colname="c2" colnum="2"/><colspec colname="c3" colnum="3"/><spanspec spanname="wide" namest="c1" nameend="c2"/><tbody><row id="row-1"><entry spanname="wide">A</entry><entry colname="c3">B</entry></row></tbody></tgroup></table>',
      extendedSchema,
      { profile: 'extended' },
    );
    const doc = extendedSchema.nodes.doc!.create(null, [table]);
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, findTextPosition(doc, 'A')),
    });

    let nextState = state;
    const result = deleteS1000DColumn()(state, (transaction) => {
      nextState = nextState.apply(transaction);
    });

    expect(result).toBe(true);
    const nextTable = findS1000DTableContext(nextState)?.table;
    const nextTgroup = nextTable?.child(0);
    const nextTbody = nextTgroup?.child(2);
    const firstEntry = nextTbody?.child(0)?.child(0);
    expect(nextTgroup?.attrs.cols).toBe('2');
    expect(nextTgroup?.childCount).toBe(3);
    expect(nextTgroup?.child(0)?.attrs.colname).toBe('c2');
    expect(nextTgroup?.child(1)?.attrs.colname).toBe('c3');
    expect(firstEntry?.attrs.spanname).toBeNull();
    expect(firstEntry?.attrs.colname).toBe('c2');
    expect(firstEntry?.textContent).toBe('A');
  });

  it('adds a column after a morerows-backed entry and keeps selection in the edited row', () => {
    const table = parseS1000DTableXml(
      '<table id="tab-1"><tgroup cols="2"><tbody><row id="row-1"><entry morerows="1">A</entry><entry>B</entry></row><row id="row-2"><entry>C</entry></row></tbody></tgroup></table>',
      extendedSchema,
      { profile: 'extended' },
    );
    const doc = extendedSchema.nodes.doc!.create(null, [table]);
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, findTextPosition(doc, 'A')),
    });

    let nextState = state;
    const result = addS1000DColumnAfter()(state, (transaction) => {
      nextState = nextState.apply(transaction);
    });

    expect(result).toBe(true);
    const nextTable = findS1000DTableContext(nextState)?.table;
    const nextTgroup = nextTable?.child(0);
    const nextTbody = nextTgroup?.child(0);
    expect(nextTgroup?.attrs.cols).toBe('3');
    expect(nextTbody?.child(0)?.childCount).toBe(3);
    expect(nextTbody?.child(1)?.childCount).toBe(2);
    expect(nextTbody?.child(0)?.child(0)?.attrs.morerows).toBe('1');
    expect(findS1000DRowContext(nextState)?.rowRef.rowIndexInSection).toBe(0);
    expect(findS1000DEntryContext(nextState)?.entry.columnIndex).toBe(1);
    expect(findS1000DEntryContext(nextState)?.entry.node.textContent).toBe('');
  });

  it('deletes a column covered by morerows and keeps the anchor entry intact', () => {
    const table = parseS1000DTableXml(
      '<table id="tab-1"><tgroup cols="3"><tbody><row id="row-1"><entry morerows="1">A</entry><entry>B</entry><entry>C</entry></row><row id="row-2"><entry>D</entry><entry>E</entry></row></tbody></tgroup></table>',
      extendedSchema,
      { profile: 'extended' },
    );
    const doc = extendedSchema.nodes.doc!.create(null, [table]);
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, findTextPosition(doc, 'D')),
    });

    let nextState = state;
    const result = deleteS1000DColumn()(state, (transaction) => {
      nextState = nextState.apply(transaction);
    });

    expect(result).toBe(true);
    const nextTable = findS1000DTableContext(nextState)?.table;
    const nextTgroup = nextTable?.child(0);
    const nextTbody = nextTgroup?.child(0);
    expect(nextTgroup?.attrs.cols).toBe('2');
    expect(nextTbody?.child(0)?.childCount).toBe(2);
    expect(nextTbody?.child(1)?.childCount).toBe(1);
    expect(nextTbody?.child(0)?.child(0)?.attrs.morerows).toBe('1');
    expect(nextTbody?.child(0)?.child(0)?.textContent).toBe('A');
    expect(findS1000DRowContext(nextState)?.rowRef.rowIndexInSection).toBe(1);
    expect(findS1000DEntryContext(nextState)?.entry.columnIndex).toBe(1);
    expect(findS1000DEntryContext(nextState)?.entry.node.textContent).toBe('E');
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
