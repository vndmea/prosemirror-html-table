import { Fragment, Slice, Schema, type Node as ProseMirrorNode } from 'prosemirror-model';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { describe, expect, it } from 'vitest';

import { CellSelection, createHtmlTableNode, createHtmlTableNodeSpecs, tableEditing } from './index.js';

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

function createStateWithTableSelection(): EditorState {
  const table = createHtmlTableNode(schema, { rows: 2, cols: 2, withHeaderRow: false });
  const doc = schema.nodes.doc!.create(null, [table]);

  return EditorState.create({
    schema,
    doc,
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
    view.state = view.state.apply(tr);
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
