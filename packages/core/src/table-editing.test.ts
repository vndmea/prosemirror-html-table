import { Fragment, Slice, Schema, type Node as ProseMirrorNode } from 'prosemirror-model';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { describe, expect, it, vi } from 'vitest';

import { CellSelection, createHtmlTableNode, createHtmlTableNodeSpecs, serializeCellSelectionToHtmlTable, tableEditing } from './index.js';

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

describe('tableEditing', () => {
  it('writes html and plain text clipboard data for cell selections', () => {
    const plugin = tableEditing();
    const state = createStateWithCellSelection(['A', 'B', 'C', 'D'], [0, 3]);
    const view = createView(state);
    const event = createClipboardEvent();

    const handled = plugin.props.handleDOMEvents?.copy?.call(plugin, view, event as unknown as ClipboardEvent);

    expect(handled).toBe(true);
    expect(event.prevented).toBe(true);
    expect(event.clipboardData.getData('text/plain')).toBe('A\tB\nC\tD');
    expect(event.clipboardData.getData('text/html')).toContain('<table');
  });

  it('does not handle cell-range clipboard when disabled', () => {
    const plugin = tableEditing({ enableCellRangeClipboard: false });
    const state = createStateWithCellSelection(['A', 'B', 'C', 'D'], [0, 3]);
    const view = createView(state);
    const event = createClipboardEvent();

    const handled = plugin.props.handleDOMEvents?.copy?.call(plugin, view, event as unknown as ClipboardEvent);

    expect(handled).toBe(false);
    expect(event.prevented).toBe(false);
    expect(event.clipboardData.getData('text/plain')).toBe('');
  });

  it('clears partial cell selections on Delete', () => {
    const plugin = tableEditing();
    const state = createStateWithCellSelection(['A', 'B', 'C', 'D'], [0, 1]);
    const view = createView(state);
    const event = createKeyboardEvent('Delete');

    const handled = plugin.props.handleKeyDown?.call(plugin, view, event as unknown as KeyboardEvent);

    expect(handled).toBe(true);
    expect(event.prevented).toBe(true);
    expect(getCellTexts(view.state.doc)).toEqual(['', '', 'C', 'D']);
  });

  it('does not clear partial cell selections on Delete when disabled', () => {
    const plugin = tableEditing({ clearCellsOnDelete: false });
    const state = createStateWithCellSelection(['A', 'B', 'C', 'D'], [0, 1]);
    const view = createView(state);
    const event = createKeyboardEvent('Delete');

    const handled = plugin.props.handleKeyDown?.call(plugin, view, event as unknown as KeyboardEvent);

    expect(handled).toBe(false);
    expect(event.prevented).toBe(false);
    expect(getCellTexts(view.state.doc)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('clears whole-table CellSelections on Delete', () => {
    const plugin = tableEditing();
    const state = createStateWithCellSelection(['A', 'B', 'C', 'D'], [0, 3]);
    const view = createView(state);
    const event = createKeyboardEvent('Delete');

    const handled = plugin.props.handleKeyDown?.call(plugin, view, event as unknown as KeyboardEvent);

    expect(handled).toBe(true);
    expect(event.prevented).toBe(true);
    expect(getCellTexts(view.state.doc)).toEqual(['', '', '', '']);
  });

  it('deletes whole-table CellSelections on Delete when configured', () => {
    const plugin = tableEditing({ deleteTableOnAllCellsSelected: true });
    const state = createStateWithCellSelection(['A', 'B', 'C', 'D'], [0, 3]);
    const view = createView(state);
    const event = createKeyboardEvent('Delete');

    const handled = plugin.props.handleKeyDown?.call(plugin, view, event as unknown as KeyboardEvent);

    expect(handled).toBe(true);
    expect(event.prevented).toBe(true);
    expect(view.state.doc.child(0).type.name).toBe('paragraph');
  });

  it('does not clear whole-table CellSelections when whole-table clearing is disabled', () => {
    const plugin = tableEditing({
      clearWholeTableCellSelectionOnDelete: false,
      deleteTableOnAllCellsSelected: false,
    });
    const state = createStateWithCellSelection(['A', 'B', 'C', 'D'], [0, 3]);
    const view = createView(state);
    const event = createKeyboardEvent('Delete');

    const handled = plugin.props.handleKeyDown?.call(plugin, view, event as unknown as KeyboardEvent);

    expect(handled).toBe(false);
    expect(event.prevented).toBe(false);
    expect(getCellTexts(view.state.doc)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('clears partial cell selections on Mod-Backspace and Mod-Delete', () => {
    const plugin = tableEditing();

    const backspaceView = createView(createStateWithCellSelection(['A', 'B', 'C', 'D'], [0, 1]));
    const backspaceEvent = createKeyboardEvent('Backspace', { metaKey: true });
    const backspaceHandled = plugin.props.handleKeyDown?.call(
      plugin,
      backspaceView,
      backspaceEvent as unknown as KeyboardEvent,
    );

    expect(backspaceHandled).toBe(true);
    expect(backspaceEvent.prevented).toBe(true);
    expect(getCellTexts(backspaceView.state.doc)).toEqual(['', '', 'C', 'D']);

    const deleteView = createView(createStateWithCellSelection(['A', 'B', 'C', 'D'], [0, 1]));
    const deleteEvent = createKeyboardEvent('Delete', { ctrlKey: true });
    const deleteHandled = plugin.props.handleKeyDown?.call(
      plugin,
      deleteView,
      deleteEvent as unknown as KeyboardEvent,
    );

    expect(deleteHandled).toBe(true);
    expect(deleteEvent.prevented).toBe(true);
    expect(getCellTexts(deleteView.state.doc)).toEqual(['', '', 'C', 'D']);
  });

  it('pastes tabular plain text into the current table selection', () => {
    const plugin = tableEditing();
    const state = createStateWithCellSelection(['a', 'b', 'c', 'd'], [0, 3]);
    const view = createView(state);
    const event = createClipboardEvent({ plain: 'X\tY\nZ\tW' });

    const handled = plugin.props.handleDOMEvents?.paste?.call(plugin, view, event as unknown as ClipboardEvent);

    expect(handled).toBe(true);
    expect(event.prevented).toBe(true);
    expect(getCellTexts(view.state.doc)).toEqual(['X', 'Y', 'Z', 'W']);
  });

  it('repeats a single slice across a CellSelection via handlePaste', () => {
    const plugin = tableEditing();
    const state = createStateWithCellSelection(['a', 'b', 'c', 'd'], [0, 3]);
    const view = createView(state);
    const slice = createParagraphSlice('Z');

    const handled = plugin.props.handlePaste?.call(plugin, view, {} as ClipboardEvent, slice);

    expect(handled).toBe(true);
    expect(getCellTexts(view.state.doc)).toEqual(['Z', 'Z', 'Z', 'Z']);
  });

  it('pastes a CellSelection slice into a text cursor inside a table via handlePaste', () => {
    const plugin = tableEditing();
    const sourceState = createStateWithCellSelection(['A', 'B', 'C', 'D'], [0, 1]);
    const sourceSelection = sourceState.selection as CellSelection;
    const targetState = createStateWithTextCursor(['a', 'b', 'c', 'd'], 2);
    const view = createView(targetState);
    const slice = sourceSelection.content();

    const handled = plugin.props.handlePaste?.call(plugin, view, {} as ClipboardEvent, slice);

    expect(handled).toBe(true);
    expect(getCellTexts(view.state.doc)).toEqual(['a', 'b', 'A', 'B']);
    expect(view.state.selection).toBeInstanceOf(CellSelection);
  });

  it('pastes a cross-section CellSelection slice through handlePaste', () => {
    const plugin = tableEditing();
    const sourceTable = createSectionedTable([
      ['H1', 'H2'],
      ['B1', 'B2'],
    ]);
    const sourceDoc = schema.nodes.doc!.create(null, [sourceTable]);
    const sourcePositions = {
      header: findNodePositions(sourceDoc, 'htmlTableHeaderCell'),
      cell: findNodePositions(sourceDoc, 'htmlTableCell'),
    };
    const sourceState = EditorState.create({
      schema,
      doc: sourceDoc,
      selection: CellSelection.create(sourceDoc, sourcePositions.header[0]!, sourcePositions.cell[0]!),
    });
    const targetTable = createSectionedTable([
      ['h1', 'h2'],
      ['b1', 'b2'],
    ]);
    const targetDoc = schema.nodes.doc!.create(null, [targetTable]);
    const targetPositions = {
      header: findNodePositions(targetDoc, 'htmlTableHeaderCell'),
      cell: findNodePositions(targetDoc, 'htmlTableCell'),
    };
    const targetState = EditorState.create({
      schema,
      doc: targetDoc,
      selection: CellSelection.create(targetDoc, targetPositions.header[0]!, targetPositions.cell[0]!),
    });
    const view = createView(targetState);
    const slice = (sourceState.selection as CellSelection).content();

    const handled = plugin.props.handlePaste?.call(plugin, view, {} as ClipboardEvent, slice);

    expect(handled).toBe(true);
    expect(getAllTableCellDescriptors(view.state.doc)).toEqual([
      'htmlTableHeaderCell:H1',
      'htmlTableHeaderCell:h2',
      'htmlTableCell:B1',
      'htmlTableCell:b2',
    ]);
  });

  it('pastes across a non-rectangular logical selection by rebuilding merged target cells', () => {
    const plugin = tableEditing();
    const sourceState = createStateWithCellSelection(['1', '2', '3', '4'], [0, 3]);
    const sourceSelection = sourceState.selection as CellSelection;
    const targetTable = createMergedBodyTable();
    const targetDoc = schema.nodes.doc!.create(null, [targetTable]);
    const targetPositions = findNodePositions(targetDoc, 'htmlTableCell');
    const targetState = EditorState.create({
      schema,
      doc: targetDoc,
      selection: CellSelection.create(targetDoc, targetPositions[0]!, targetPositions[2]!),
    });
    const view = createView(targetState);
    const slice = sourceSelection.content();

    const handled = plugin.props.handlePaste?.call(plugin, view, {} as ClipboardEvent, slice);

    expect(handled).toBe(true);
    expect(getAllTableCellDescriptors(view.state.doc)).toEqual([
      'htmlTableCell:1',
      'htmlTableCell:2',
      'htmlTableCell:1',
      'htmlTableCell:3',
      'htmlTableCell:4',
      'htmlTableCell:3',
    ]);
  });

  it('replaces a selected table node with a pasted table slice', () => {
    const plugin = tableEditing();
    const targetState = createStateWithTableSelection(undefined, [plugin]);
    const view = createView(targetState);
    const replacementTable = withCellTexts(createHtmlTableNode(schema, { rows: 1, cols: 1, withHeaderRow: false }), ['Z']);
    const slice = new Slice(Fragment.from(replacementTable), 0, 0);

    const handled = plugin.props.handlePaste?.call(plugin, view, {} as ClipboardEvent, slice);

    expect(handled).toBe(true);
    expect(getCellTexts(view.state.doc)).toEqual(['Z']);
  });

  it('replaces a selected table node from DOM paste html data', () => {
    const plugin = tableEditing();
    const targetState = createStateWithTableSelection(undefined, [plugin]);
    const view = createView(targetState);
    const replacementTable = withCellTexts(createHtmlTableNode(schema, { rows: 1, cols: 2, withHeaderRow: false }), ['X', 'Y']);
    const sourceDoc = schema.nodes.doc!.create(null, [replacementTable]);
    const sourceState = EditorState.create({
      schema,
      doc: sourceDoc,
      selection: NodeSelection.create(sourceDoc, 0),
    });
    const event = createClipboardEvent({
      html: serializeCellSelectionToHtmlTable(sourceState)!,
    });

    const handled = plugin.props.handleDOMEvents?.paste?.call(plugin, view, event as unknown as ClipboardEvent);

    expect(handled).toBe(true);
    expect(event.prevented).toBe(true);
    expect(getCellTexts(view.state.doc)).toEqual(['X', 'Y']);
  });

  it('normalizes malformed pasted tables after handlePaste', () => {
    const plugin = tableEditing();
    const state = createStateWithTableSelection(undefined, [plugin]);
    const view = createView(state);
    const malformedTable = schema.nodes.htmlTable!.create(null, []);
    const slice = new Slice(Fragment.from(malformedTable), 0, 0);

    const handled = plugin.props.handlePaste?.call(plugin, view, {} as ClipboardEvent, slice);

    expect(handled).toBe(true);
    expect(view.state.doc.child(0).firstChild?.type.name).toBe('htmlTableBody');
    expect(getAllTableCellDescriptors(view.state.doc)).toEqual(['htmlTableCell:']);
  });

  it('normalizes table node selections into whole-table CellSelections by default', () => {
    const plugin = tableEditing();
    const state = createStateWithTableSelection();
    const cellPositions = findNodePositions(state.doc, 'htmlTableCell');

    const appended = plugin.spec.appendTransaction?.([], state, state);

    expect(appended).toBeDefined();
    expect(appended!.selection).toBeInstanceOf(CellSelection);
    if (appended?.selection instanceof CellSelection) {
      expect([appended.selection.anchorCellPos, appended.selection.headCellPos]).toEqual([
        cellPositions[0],
        cellPositions[cellPositions.length - 1],
      ]);
    }
  });

  it('selects the clicked cell on triple click', () => {
    const plugin = tableEditing();
    const state = createStateWithTextCursor(['A', 'B', 'C', 'D'], 2);
    const view = createView(state);
    const cellPositions = findNodePositions(state.doc, 'htmlTableCell');

    const handled = plugin.props.handleTripleClick?.call(plugin, view, cellPositions[2]! + 2, {} as MouseEvent);

    expect(handled).toBe(true);
    expect(view.state.selection).toBeInstanceOf(CellSelection);
    if (view.state.selection instanceof CellSelection) {
      expect([view.state.selection.anchorCellPos, view.state.selection.headCellPos]).toEqual([
        cellPositions[2],
        cellPositions[2],
      ]);
    }
  });

  it('creates a dragged CellSelection across cells on mouse move', () => {
    const plugin = tableEditing();
    const state = createStateWithCellSelection(['A', 'B', 'C', 'D'], [0, 0], [plugin]);
    const cellPositions = findNodePositions(state.doc, 'htmlTableCell');
    const root = createRootEventTarget();
    const dom = { nodeName: 'DIV' };
    const startTarget = { nodeName: 'TD', parentNode: dom };
    const endTarget = { nodeName: 'TD', parentNode: dom };
    const view = createView(state, {
      dom,
      root,
      posAtCoords(coords) {
        if (coords.left === 0 && coords.top === 0) return { pos: cellPositions[0]! + 2, inside: cellPositions[0]! + 2 };
        if (coords.left === 30 && coords.top === 30) return { pos: cellPositions[3]! + 2, inside: cellPositions[3]! + 2 };
        return null;
      },
    });

    plugin.props.handleDOMEvents?.mousedown?.call(
      plugin,
      view,
      createMouseEvent({ target: startTarget, clientX: 0, clientY: 0 }) as unknown as MouseEvent,
    );

    root.dispatch('mousemove', createMouseEvent({ target: endTarget, clientX: 30, clientY: 30 }) as unknown as Event);
    root.dispatch('mouseup', createMouseEvent({ target: endTarget, clientX: 30, clientY: 30 }) as unknown as Event);

    expect(view.state.selection).toBeInstanceOf(CellSelection);
    if (view.state.selection instanceof CellSelection) {
      expect([view.state.selection.anchorCellPos, view.state.selection.headCellPos]).toEqual([
        cellPositions[0],
        cellPositions[3],
      ]);
    }
  });

  it('keeps the current dragged CellSelection when the pointer leaves the table', () => {
    const plugin = tableEditing();
    const state = createStateWithCellSelection(['A', 'B', 'C', 'D'], [0, 0], [plugin]);
    const cellPositions = findNodePositions(state.doc, 'htmlTableCell');
    const root = createRootEventTarget();
    const dom = { nodeName: 'DIV' };
    const startTarget = { nodeName: 'TD', parentNode: dom };
    const endTarget = { nodeName: 'TD', parentNode: dom };
    const outsideTarget = { nodeName: 'DIV', parentNode: null };
    const view = createView(state, {
      dom,
      root,
      posAtCoords(coords) {
        if (coords.left === 0 && coords.top === 0) return { pos: cellPositions[0]! + 2, inside: cellPositions[0]! + 2 };
        if (coords.left === 30 && coords.top === 30) return { pos: cellPositions[3]! + 2, inside: cellPositions[3]! + 2 };
        return null;
      },
    });

    plugin.props.handleDOMEvents?.mousedown?.call(
      plugin,
      view,
      createMouseEvent({ target: startTarget, clientX: 0, clientY: 0 }) as unknown as MouseEvent,
    );
    root.dispatch('mousemove', createMouseEvent({ target: endTarget, clientX: 30, clientY: 30 }) as unknown as Event);
    root.dispatch('mousemove', createMouseEvent({ target: outsideTarget, clientX: 60, clientY: 60 }) as unknown as Event);
    root.dispatch('mouseup', createMouseEvent({ target: outsideTarget, clientX: 60, clientY: 60 }) as unknown as Event);

    expect(view.state.selection).toBeInstanceOf(CellSelection);
    if (view.state.selection instanceof CellSelection) {
      expect([view.state.selection.anchorCellPos, view.state.selection.headCellPos]).toEqual([
        cellPositions[0],
        cellPositions[3],
      ]);
    }
  });

  it('keeps the current dragged CellSelection when the pointer enters another table', () => {
    const plugin = tableEditing();
    const state = createStateWithCellSelection(['A', 'B', 'C', 'D'], [0, 0], [plugin]);
    const otherTable = withCellTexts(createHtmlTableNode(schema, { rows: 1, cols: 1, withHeaderRow: false }), ['X']);
    const nextDoc = schema.nodes.doc!.create(null, [state.doc.child(0), otherTable]);
    const nextCellPositions = findNodePositions(nextDoc, 'htmlTableCell');
    const root = createRootEventTarget();
    const dom = { nodeName: 'DIV' };
    const startTarget = { nodeName: 'TD', parentNode: dom };
    const endTarget = { nodeName: 'TD', parentNode: dom };
    const otherTarget = { nodeName: 'TD', parentNode: { nodeName: 'TABLE', parentNode: dom } };
    const view = createView(EditorState.create({
      schema,
      doc: nextDoc,
      plugins: [plugin],
      selection: CellSelection.create(nextDoc, nextCellPositions[0]!, nextCellPositions[0]!),
    }), {
      dom,
      root,
      posAtCoords(coords) {
        if (coords.left === 0 && coords.top === 0) return { pos: nextCellPositions[0]! + 2, inside: nextCellPositions[0]! + 2 };
        if (coords.left === 30 && coords.top === 30) return { pos: nextCellPositions[3]! + 2, inside: nextCellPositions[3]! + 2 };
        if (coords.left === 60 && coords.top === 60) return { pos: nextCellPositions[4]! + 2, inside: nextCellPositions[4]! + 2 };
        return null;
      },
    });

    plugin.props.handleDOMEvents?.mousedown?.call(
      plugin,
      view,
      createMouseEvent({ target: startTarget, clientX: 0, clientY: 0 }) as unknown as MouseEvent,
    );
    root.dispatch('mousemove', createMouseEvent({ target: endTarget, clientX: 30, clientY: 30 }) as unknown as Event);
    root.dispatch('mousemove', createMouseEvent({ target: otherTarget, clientX: 60, clientY: 60 }) as unknown as Event);
    root.dispatch('mouseup', createMouseEvent({ target: otherTarget, clientX: 60, clientY: 60 }) as unknown as Event);

    expect(view.state.selection).toBeInstanceOf(CellSelection);
    if (view.state.selection instanceof CellSelection) {
      expect([view.state.selection.anchorCellPos, view.state.selection.headCellPos]).toEqual([
        nextCellPositions[0],
        nextCellPositions[3],
      ]);
    }
  });

  it('returns the current CellSelection from createSelectionBetween while dragging', () => {
    const plugin = tableEditing();
    const state = createStateWithCellSelection(['A', 'B', 'C', 'D'], [0, 0], [plugin]);
    const cellPositions = findNodePositions(state.doc, 'htmlTableCell');
    const root = createRootEventTarget();
    const dom = { nodeName: 'DIV' };
    const startTarget = { nodeName: 'TD', parentNode: dom };
    const endTarget = { nodeName: 'TD', parentNode: dom };
    const view = createView(state, {
      dom,
      root,
      posAtCoords(coords) {
        if (coords.left === 0 && coords.top === 0) return { pos: cellPositions[0]! + 2, inside: cellPositions[0]! + 2 };
        if (coords.left === 30 && coords.top === 30) return { pos: cellPositions[3]! + 2, inside: cellPositions[3]! + 2 };
        return null;
      },
    });

    plugin.props.handleDOMEvents?.mousedown?.call(
      plugin,
      view,
      createMouseEvent({ target: startTarget, clientX: 0, clientY: 0 }) as unknown as MouseEvent,
    );
    root.dispatch('mousemove', createMouseEvent({ target: endTarget, clientX: 30, clientY: 30 }) as unknown as Event);

    const recoveredSelection = plugin.props.createSelectionBetween?.call(
      plugin,
      view,
      view.state.doc.resolve(cellPositions[0]! + 1),
      view.state.doc.resolve(cellPositions[3]! + 1),
    );

    expect(recoveredSelection).toBe(view.state.selection);

    root.dispatch('mouseup', createMouseEvent({ target: endTarget, clientX: 30, clientY: 30 }) as unknown as Event);
    const afterMouseUpSelection = plugin.props.createSelectionBetween?.call(
      plugin,
      view,
      view.state.doc.resolve(cellPositions[0]! + 1),
      view.state.doc.resolve(cellPositions[3]! + 1),
    );

    expect(afterMouseUpSelection).toBeNull();
  });

  it('extends an existing CellSelection with Shift-ArrowRight', () => {
    const plugin = tableEditing();
    const state = createStateWithCellSelection(['A', 'B', 'C', 'D'], [0, 0]);
    const view = createView(state);
    const cellPositions = findNodePositions(state.doc, 'htmlTableCell');
    const event = createKeyboardEvent('ArrowRight', { shiftKey: true });

    const handled = plugin.props.handleKeyDown?.call(plugin, view, event as unknown as KeyboardEvent);

    expect(handled).toBe(true);
    expect(event.prevented).toBe(true);
    expect(view.state.selection).toBeInstanceOf(CellSelection);
    if (view.state.selection instanceof CellSelection) {
      expect([view.state.selection.anchorCellPos, view.state.selection.headCellPos]).toEqual([
        cellPositions[0],
        cellPositions[1],
      ]);
    }
  });

  it('stops Shift-Arrow expansion at section boundaries by default', () => {
    const plugin = tableEditing();
    const table = createSectionedTable([
      ['H1', 'H2'],
      ['B1', 'B2'],
    ]);
    const doc = schema.nodes.doc!.create(null, [table]);
    const headerPositions = findNodePositions(doc, 'htmlTableHeaderCell');
    const state = EditorState.create({
      schema,
      doc,
      selection: CellSelection.create(doc, headerPositions[0]!),
    });
    const view = createView(state);
    const event = createKeyboardEvent('ArrowDown', { shiftKey: true });

    const handled = plugin.props.handleKeyDown?.call(plugin, view, event as unknown as KeyboardEvent);

    expect(handled).toBe(false);
    expect(event.prevented).toBe(false);
    expect(view.state.selection.eq(state.selection)).toBe(true);
  });

  it('can extend Shift-Arrow selections across sections when explicitly enabled', () => {
    const plugin = tableEditing({ constrainShiftArrowToSection: false });
    const table = createSectionedTable([
      ['H1', 'H2'],
      ['B1', 'B2'],
    ]);
    const doc = schema.nodes.doc!.create(null, [table]);
    const headerPositions = findNodePositions(doc, 'htmlTableHeaderCell');
    const bodyPositions = findNodePositions(doc, 'htmlTableCell');
    const state = EditorState.create({
      schema,
      doc,
      selection: CellSelection.create(doc, headerPositions[0]!),
    });
    const view = createView(state);
    const event = createKeyboardEvent('ArrowDown', { shiftKey: true });

    const handled = plugin.props.handleKeyDown?.call(plugin, view, event as unknown as KeyboardEvent);

    expect(handled).toBe(true);
    expect(event.prevented).toBe(true);
    expect(view.state.selection).toBeInstanceOf(CellSelection);
    if (view.state.selection instanceof CellSelection) {
      expect([view.state.selection.anchorCellPos, view.state.selection.headCellPos]).toEqual([
        headerPositions[0],
        bodyPositions[0],
      ]);
    }
  });

  it('does not extend CellSelections with Shift-Arrow when disabled', () => {
    const plugin = tableEditing({ enableShiftArrowSelection: false });
    const state = createStateWithCellSelection(['A', 'B', 'C', 'D'], [0, 0]);
    const view = createView(state);
    const event = createKeyboardEvent('ArrowRight', { shiftKey: true });

    const handled = plugin.props.handleKeyDown?.call(plugin, view, event as unknown as KeyboardEvent);

    expect(handled).toBe(false);
    expect(event.prevented).toBe(false);
    expect(view.state.selection.eq(state.selection)).toBe(true);
  });

  it('starts a CellSelection from a text cursor at the end of a cell with Shift-ArrowRight', () => {
    const plugin = tableEditing();
    const state = createStateWithTextCursor(['A', 'B', 'C', 'D'], 0, 'end');
    const view = createView(state, {
      endOfTextblock() {
        return true;
      },
    });
    const cellPositions = findNodePositions(state.doc, 'htmlTableCell');
    const event = createKeyboardEvent('ArrowRight', { shiftKey: true });

    const handled = plugin.props.handleKeyDown?.call(plugin, view, event as unknown as KeyboardEvent);

    expect(handled).toBe(true);
    expect(event.prevented).toBe(true);
    expect(view.state.selection).toBeInstanceOf(CellSelection);
    if (view.state.selection instanceof CellSelection) {
      expect([view.state.selection.anchorCellPos, view.state.selection.headCellPos]).toEqual([
        cellPositions[0],
        cellPositions[1],
      ]);
    }
  });

  it('collapses a CellSelection back to text on ArrowRight', () => {
    const plugin = tableEditing();
    const state = createStateWithCellSelection(['A', 'B', 'C', 'D'], [0, 1]);
    const view = createView(state);
    const event = createKeyboardEvent('ArrowRight');

    const handled = plugin.props.handleKeyDown?.call(plugin, view, event as unknown as KeyboardEvent);

    expect(handled).toBe(true);
    expect(event.prevented).toBe(true);
    expect(view.state.selection).not.toBeInstanceOf(CellSelection);
  });

  it('moves horizontally to the next cell on ArrowRight at the end of a cell', () => {
    const plugin = tableEditing();
    const state = createStateWithTextCursor(['A', 'B', 'C', 'D'], 0, 'end');
    const view = createView(state, {
      endOfTextblock() {
        return true;
      },
    });
    const cellPositions = findNodePositions(state.doc, 'htmlTableCell');
    const event = createKeyboardEvent('ArrowRight');

    const handled = plugin.props.handleKeyDown?.call(plugin, view, event as unknown as KeyboardEvent);

    expect(handled).toBe(true);
    expect(event.prevented).toBe(true);
    expect(view.state.selection).not.toBeInstanceOf(CellSelection);
    expect(isPositionInsideCell(view.state.doc, view.state.selection.from, cellPositions[1]!)).toBe(true);
  });

  it('moves vertically to the cell below on ArrowDown at the end of a cell', () => {
    const plugin = tableEditing();
    const state = createStateWithTextCursor(['A', 'B', 'C', 'D'], 0, 'end');
    const view = createView(state, {
      endOfTextblock() {
        return true;
      },
    });
    const cellPositions = findNodePositions(state.doc, 'htmlTableCell');
    const event = createKeyboardEvent('ArrowDown');

    const handled = plugin.props.handleKeyDown?.call(plugin, view, event as unknown as KeyboardEvent);

    expect(handled).toBe(true);
    expect(event.prevented).toBe(true);
    expect(view.state.selection).not.toBeInstanceOf(CellSelection);
    expect(isPositionInsideCell(view.state.doc, view.state.selection.from, cellPositions[2]!)).toBe(true);
  });

  it('keeps table node selections when allowTableNodeSelection is true', () => {
    const plugin = tableEditing({ allowTableNodeSelection: true });
    const state = createStateWithTableSelection();

    const appended = plugin.spec.appendTransaction?.([], state, state);

    expect(appended).toBeUndefined();
  });

  it('applies plugin-level fixTables normalization in appendTransaction', () => {
    const plugin = tableEditing();
    const malformedTable = schema.nodes.htmlTable!.create(null, []);
    const state = EditorState.create({
      schema,
      doc: schema.nodes.doc!.create(null, [malformedTable]),
      plugins: [plugin],
    });

    const appended = plugin.spec.appendTransaction?.([], state, state);

    expect(appended).toBeDefined();
    expect(appended!.doc.child(0).firstChild?.childCount).toBe(1);
  });

  it('normalizes a text selection that starts at a cell boundary back to a cursor', () => {
    const plugin = tableEditing();
    const table = withCellTexts(createHtmlTableNode(schema, { rows: 1, cols: 2, withHeaderRow: false }), ['A', 'B']);
    const doc = schema.nodes.doc!.create(null, [table]);
    const cellPositions = findNodePositions(doc, 'htmlTableCell');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const state = EditorState.create({
      schema,
      doc,
      selection: TextSelection.create(doc, cellPositions[0]! + 3, cellPositions[1]!),
    });
    warn.mockRestore();

    const appended = plugin.spec.appendTransaction?.([], state, state);

    expect(appended?.selection).toBeInstanceOf(TextSelection);
    if (appended?.selection instanceof TextSelection) {
      expect(appended.selection.from).toBe(appended.selection.to);
      expect(appended.selection.from).toBe(cellPositions[0]! + 3);
    }
  });

  it('normalizes a text selection that crosses cell content back into the anchor cell', () => {
    const plugin = tableEditing();
    const table = withCellTexts(createHtmlTableNode(schema, { rows: 1, cols: 2, withHeaderRow: false }), ['A', 'B']);
    const doc = schema.nodes.doc!.create(null, [table]);
    const cellPositions = findNodePositions(doc, 'htmlTableCell');
    const state = EditorState.create({
      schema,
      doc,
      selection: TextSelection.create(doc, cellPositions[0]! + 2, cellPositions[1]! + 1),
    });

    const appended = plugin.spec.appendTransaction?.([], state, state);

    expect(appended?.selection).toBeInstanceOf(TextSelection);
    if (appended?.selection instanceof TextSelection) {
      expect([appended.selection.from, appended.selection.to]).toEqual([
        state.selection.$from.start(),
        state.selection.$from.end(),
      ]);
    }
  });
});

function createStateWithCellSelection(
  texts: string[],
  selection: [number, number],
  plugins: Parameters<typeof EditorState.create>[0]['plugins'] = [],
): EditorState {
  const table = withCellTexts(createHtmlTableNode(schema, { rows: 2, cols: 2, withHeaderRow: false }), texts);
  const doc = schema.nodes.doc!.create(null, [table]);
  const cellPositions = findNodePositions(doc, 'htmlTableCell');

  return EditorState.create({
    schema,
    doc,
    plugins,
    selection: CellSelection.create(doc, cellPositions[selection[0]]!, cellPositions[selection[1]]!),
  });
}

function createStateWithTableSelection(
  table: ProseMirrorNode = createHtmlTableNode(schema, { rows: 2, cols: 2, withHeaderRow: false }),
  plugins: Parameters<typeof EditorState.create>[0]['plugins'] = [],
): EditorState {
  return createStateWithTableSelectionFromTable(table, plugins);
}

function createStateWithTableSelectionFromTable(
  table: ProseMirrorNode,
  plugins: Parameters<typeof EditorState.create>[0]['plugins'] = [],
): EditorState {
  const doc = schema.nodes.doc!.create(null, [table]);

  return EditorState.create({
    schema,
    doc,
    plugins,
    selection: NodeSelection.create(doc, 0),
  });
}

function createStateWithTextCursor(
  texts: string[],
  cellIndex: number,
  placement: 'start' | 'end' = 'start',
): EditorState {
  const table = withCellTexts(createHtmlTableNode(schema, { rows: 2, cols: 2, withHeaderRow: false }), texts);
  const doc = schema.nodes.doc!.create(null, [table]);
  const cellPositions = findNodePositions(doc, 'htmlTableCell');
  const cellPos = cellPositions[cellIndex]!;
  const cellNode = doc.nodeAt(cellPos)!;
  const targetPos = placement === 'end' ? cellPos + cellNode.nodeSize - 2 : cellPos + 1;

  return EditorState.create({
    schema,
    doc,
    selection: TextSelection.near(doc.resolve(targetPos)),
  });
}

function createView(
  initialState: EditorState,
  options: {
    dom?: unknown;
    root?: ReturnType<typeof createRootEventTarget>;
    posAtCoords?: (coords: { left: number; top: number }) => { pos: number; inside: number } | null;
    endOfTextblock?: (direction: string) => boolean;
  } = {},
): EditorView & { state: EditorState } {
  const view = {} as EditorView & { state: EditorState };
  view.state = initialState;
  (view as { dom: unknown }).dom = options.dom ?? {};
  (view as { root: unknown }).root = options.root ?? createRootEventTarget();
  view.dispatch = (tr) => {
    view.state = view.state.applyTransaction(tr).state;
  };
  view.posAtCoords = ((coords) => options.posAtCoords?.(coords) ?? null) as EditorView['posAtCoords'];
  view.endOfTextblock = ((direction) => options.endOfTextblock?.(direction) ?? false) as EditorView['endOfTextblock'];
  return view;
}

function createClipboardEvent(
  values: { html?: string; plain?: string } = {},
): {
  clipboardData: { getData: (type: string) => string; setData: (type: string, value: string) => void };
  prevented: boolean;
  preventDefault: () => void;
} {
  const data = new Map<string, string>();
  if (values.html) data.set('text/html', values.html);
  if (values.plain) data.set('text/plain', values.plain);

  return {
    clipboardData: {
      getData: (type: string) => data.get(type) ?? '',
      setData: (type: string, value: string) => {
        data.set(type, value);
      },
    },
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
  };
}

function createKeyboardEvent(
  key: string,
  modifiers: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean } = {},
): {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  prevented: boolean;
  preventDefault: () => void;
} {
  return {
    key,
    shiftKey: modifiers.shiftKey ?? false,
    ctrlKey: modifiers.ctrlKey ?? false,
    metaKey: modifiers.metaKey ?? false,
    altKey: modifiers.altKey ?? false,
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
  };
}

function createMouseEvent(
  values: {
    target: unknown;
    clientX: number;
    clientY: number;
    button?: number;
    ctrlKey?: boolean;
    metaKey?: boolean;
    shiftKey?: boolean;
  },
): {
  target: unknown;
  clientX: number;
  clientY: number;
  button: number;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  prevented: boolean;
  preventDefault: () => void;
} {
  return {
    target: values.target,
    clientX: values.clientX,
    clientY: values.clientY,
    button: values.button ?? 0,
    ctrlKey: values.ctrlKey ?? false,
    metaKey: values.metaKey ?? false,
    shiftKey: values.shiftKey ?? false,
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
  };
}

function createRootEventTarget() {
  const listeners = new Map<string, Set<(event: Event) => void>>();

  return {
    addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      const set = listeners.get(type) ?? new Set<(event: Event) => void>();
      const callback =
        typeof listener === 'function'
          ? listener
          : ((event: Event) => listener.handleEvent(event));
      set.add(callback);
      listeners.set(type, set);
    },
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      const set = listeners.get(type);
      if (!set) return;
      const callback =
        typeof listener === 'function'
          ? listener
          : ((event: Event) => listener.handleEvent(event));
      set.delete(callback);
    },
    dispatch(type: string, event: Event) {
      const set = listeners.get(type);
      if (!set) return;
      for (const listener of [...set]) {
        listener(event);
      }
    },
  };
}

function withCellTexts(table: ProseMirrorNode, texts: string[]): ProseMirrorNode {
  let index = 0;
  const children: ProseMirrorNode[] = [];

  table.forEach((child) => {
    if (child.type.name !== 'htmlTableBody') {
      children.push(child);
      return;
    }

    const rows: ProseMirrorNode[] = [];
    child.forEach((row) => {
      const cells: ProseMirrorNode[] = [];
      row.forEach((cell) => {
        const text = texts[index++] ?? '';
        const content = schema.nodes.paragraph!.create(null, text ? schema.text(text) : undefined);
        cells.push(cell.type.create(cell.attrs, [content]));
      });
      rows.push(row.copy(Fragment.fromArray(cells)));
    });
    children.push(child.copy(Fragment.fromArray(rows)));
  });

  return table.copy(Fragment.fromArray(children));
}

function getCellTexts(doc: ProseMirrorNode): string[] {
  const texts: string[] = [];
  doc.descendants((node) => {
    if (node.type.name === 'htmlTableCell') texts.push(node.textContent);
    return true;
  });
  return texts;
}

function getAllTableCellDescriptors(doc: ProseMirrorNode): string[] {
  const descriptors: string[] = [];
  doc.descendants((node) => {
    if (node.type.name === 'htmlTableCell' || node.type.name === 'htmlTableHeaderCell') {
      descriptors.push(`${node.type.name}:${node.textContent}`);
    }
    return true;
  });
  return descriptors;
}

function createSectionedTable(rows: [string[], string[]]): ProseMirrorNode {
  return schema.nodes.htmlTable!.create(null, [
    schema.nodes.htmlTableHead!.create(null, [
      schema.nodes.htmlTableRow!.create(null, rows[0].map((text) =>
        schema.nodes.htmlTableHeaderCell!.create(null, [schema.nodes.paragraph!.create(null, text ? schema.text(text) : undefined)]))),
    ]),
    schema.nodes.htmlTableBody!.create(null, [
      schema.nodes.htmlTableRow!.create(null, rows[1].map((text) =>
        schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, text ? schema.text(text) : undefined)]))),
    ]),
  ]);
}

function createMergedBodyTable(): ProseMirrorNode {
  return schema.nodes.htmlTable!.create(null, [
    schema.nodes.htmlTableBody!.create(null, [
      schema.nodes.htmlTableRow!.create(null, [
        schema.nodes.htmlTableCell!.create({ colspan: 2, rowspan: 2 }, [schema.nodes.paragraph!.create(null, schema.text('A'))]),
        schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('B'))]),
      ]),
      schema.nodes.htmlTableRow!.create(null, [
        schema.nodes.htmlTableCell!.create(null, [schema.nodes.paragraph!.create(null, schema.text('C'))]),
      ]),
    ]),
  ]);
}


function findNodePositions(doc: ProseMirrorNode, typeName: string): number[] {
  const positions: number[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === typeName) positions.push(pos);
    return true;
  });
  return positions;
}

function isPositionInsideCell(doc: ProseMirrorNode, pos: number, cellPos: number): boolean {
  const cell = doc.nodeAt(cellPos);
  if (!cell) return false;
  return pos >= cellPos + 1 && pos <= cellPos + cell.nodeSize - 1;
}

function createParagraphSlice(text: string): Slice {
  return new Slice(
    Fragment.from(schema.nodes.paragraph!.create(null, text ? schema.text(text) : undefined)),
    0,
    0,
  );
}
