import { Schema } from 'prosemirror-model';
import { EditorState, NodeSelection, TextSelection, type Transaction } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';

import { getS1000DSelectionInfo } from './clipboard.js';
import {
  createS1000DTableInteractionPlugin,
  getS1000DTableContextTriggerState,
  getS1000DTableInteractionState,
  openS1000DTableContextMenu,
  s1000dTableInteractionPluginKey,
} from './interaction.js';
import { createS1000DTableNodeSpecs } from './schema.js';
import { S1000DCellSelection } from './selection.js';

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

describe('S1000D interaction plugin', () => {
  it('tracks the active table for selections inside an S1000D table', () => {
    const doc = schema.nodes.doc!.create(null, [createTableNode()]);
    const entryPositions = findNodePositions(doc, 's1000dEntry');
    const state = EditorState.create({
      schema,
      doc,
      selection: TextSelection.near(doc.resolve(entryPositions[0]! + 1)),
      plugins: [createS1000DTableInteractionPlugin()],
    });

    const interaction = getS1000DTableInteractionState(state);

    expect(interaction.activeTable?.tablePos).toBe(0);
    expect(interaction.tableSelected).toBe(false);
    expect(interaction.selectedAxis.kind).toBeNull();
    expect(interaction.selectedAxis.tgroupIndex).toBeNull();
    expect(interaction.menuScope).toBeNull();
    expect(getS1000DSelectionInfo(state)?.entries.length).toBe(1);
  });

  it('identifies row selections as an axis selection', () => {
    const doc = schema.nodes.doc!.create(null, [createTableNode()]);
    const entryPositions = findNodePositions(doc, 's1000dEntry');
    const state = EditorState.create({
      schema,
      doc,
      selection: S1000DCellSelection.rowSelection(doc.resolve(entryPositions[2]! + 1)),
      plugins: [createS1000DTableInteractionPlugin()],
    });

    const interaction = getS1000DTableInteractionState(state);

    expect(interaction.activeTable?.tablePos).toBe(0);
    expect(interaction.selectedAxis.kind).toBe('row');
    expect(interaction.selectedAxis.index).toBe(1);
    expect(interaction.selectedAxis.tgroupIndex).toBe(0);
  });

  it('opens a cell menu through plugin meta and closes it on selection changes', () => {
    const doc = schema.nodes.doc!.create(null, [createTableNode()]);
    const entryPositions = findNodePositions(doc, 's1000dEntry');
    const baseState = EditorState.create({
      schema,
      doc,
      selection: S1000DCellSelection.create(doc, entryPositions[0]!),
      plugins: [createS1000DTableInteractionPlugin()],
    });
    const view = createView(baseState);

    openS1000DTableContextMenu(view as never, {
      scope: 'cell',
      anchor: { left: 18, top: 36 },
    });

    const openInteraction = getS1000DTableInteractionState(view.state);
    expect(openInteraction.contextMenuOpen).toBe(true);
    expect(openInteraction.menuScope).toBe('cell');
    expect(openInteraction.menuAnchor).toEqual({ left: 18, top: 36 });

    view.dispatch(
      view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(entryPositions[1]! + 1))),
    );

    const closedInteraction = getS1000DTableInteractionState(view.state);
    expect(closedInteraction.contextMenuOpen).toBe(false);
    expect(closedInteraction.menuScope).toBeNull();
    expect(closedInteraction.menuAnchor).toBeNull();
  });

  it('derives context trigger anchors for table, row, and column scopes from shared geometry', () => {
    const tableReference = {
      tablePos: 0,
      table: createTableNode(),
    };
    const geometry = createGeometry();

    expect(
      getS1000DTableContextTriggerState(
        tableReference,
        true,
        { kind: null, index: null, tablePos: null },
        geometry,
      ),
    ).toEqual({
      visible: true,
      left: 10,
      top: 20,
    });

    expect(
      getS1000DTableContextTriggerState(
        tableReference,
        false,
        { kind: 'row', index: 1, tablePos: 0 },
        geometry,
      ),
    ).toEqual({
      visible: true,
      left: 10,
      top: 90,
    });

    expect(
      getS1000DTableContextTriggerState(
        tableReference,
        false,
        { kind: 'column', index: 1, tablePos: 0 },
        geometry,
      ),
    ).toEqual({
      visible: true,
      left: 150,
      top: 20,
    });
  });

  it('keeps table selections package-owned through the interaction plugin state', () => {
    const doc = schema.nodes.doc!.create(null, [createTableNode()]);
    const state = EditorState.create({
      schema,
      doc,
      selection: NodeSelection.create(doc, 0),
      plugins: [createS1000DTableInteractionPlugin()],
    });

    const interaction = s1000dTableInteractionPluginKey.getState(state);

    expect(interaction?.activeTable?.tablePos).toBe(0);
    expect(interaction?.tableSelected).toBe(true);
    expect(interaction?.contextMenuOpen).toBe(false);
  });
});

function createTableNode() {
  const entry = (text = '') =>
    schema.nodes.s1000dEntry!.create(null, [
      schema.nodes.s1000dEntryBlock!.create({ xmlName: 'para' }, text ? schema.text(text) : undefined),
    ]);
  const row = (...texts: string[]) => schema.nodes.s1000dRow!.create(null, texts.map((text) => entry(text)));
  const tbody = schema.nodes.s1000dTbody!.create(null, [row('A', 'B'), row('C', 'D')]);
  const tgroup = schema.nodes.s1000dTgroup!.create({ cols: '2' }, [tbody]);
  return schema.nodes.s1000dTable!.create(null, [tgroup]);
}

function findNodePositions(doc: import('prosemirror-model').Node, typeName: string): number[] {
  const positions: number[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === typeName) {
      positions.push(pos);
    }
    return true;
  });
  return positions;
}

function createView(initialState: EditorState) {
  const view = {
    state: initialState,
    dispatch(tr: Transaction) {
      this.state = this.state.apply(tr);
    },
  };

  return view as unknown as { state: EditorState; dispatch: (tr: Transaction) => void };
}

function createGeometry() {
  return {
    tableRect: {
      left: 10,
      top: 20,
      right: 210,
      bottom: 120,
      width: 200,
      height: 100,
    },
    wrapperRect: {
      left: 10,
      top: 20,
      right: 210,
      bottom: 120,
      width: 200,
      height: 100,
    },
    visibleTableRect: {
      left: 10,
      top: 20,
      right: 210,
      bottom: 120,
      width: 200,
      height: 100,
    },
    scrollLeft: 0,
    scrollTop: 0,
    columns: [
      { index: 0, left: 0, width: 80 },
      { index: 1, left: 80, width: 120 },
    ],
    rows: [
      { index: 0, top: 0, height: 40 },
      { index: 1, top: 40, height: 60 },
    ],
  };
}
