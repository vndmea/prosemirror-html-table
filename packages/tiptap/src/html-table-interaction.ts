import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { NodeSelection, Plugin, PluginKey, type EditorState, type Selection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { CellSelection, createHtmlTableGrid } from 'prosemirror-html-table';

import {
  findHtmlTableAtDOM,
  getRenderedHtmlTableContext,
  measureHtmlTableGeometry,
  type HtmlTableGeometry,
} from './table-dom.js';
import { getTableSelectionInfo } from './table-utils.js';

export type HtmlTableHoverKind = 'table' | 'cell';
export type HtmlTableSelectedAxisKind = 'row' | 'column';

export interface HtmlTableReference {
  tablePos: number;
  table: ProseMirrorNode;
}

export interface HtmlTableHoverState {
  kind: HtmlTableHoverKind;
  tablePos: number;
  rowIndex: number | null;
  columnIndex: number | null;
}

export interface HtmlTableSelectedAxisState {
  kind: HtmlTableSelectedAxisKind | null;
  index: number | null;
  tablePos: number | null;
}

export interface HtmlTableResizeState {
  tablePos: number;
  columnIndex: number;
}

export interface HtmlTableContextTriggerState {
  visible: boolean;
  left: number | null;
  top: number | null;
}

export interface HtmlTableInteractionState {
  activeTable: HtmlTableReference | null;
  tableSelected: boolean;
  hovered: HtmlTableHoverState | null;
  selectedAxis: HtmlTableSelectedAxisState;
  contextTrigger: HtmlTableContextTriggerState;
  contextMenuOpen: boolean;
  geometry: HtmlTableGeometry | null;
  resizing: HtmlTableResizeState | null;
}

interface HtmlTableInteractionMeta {
  hovered?: HtmlTableHoverState | null;
  hoveredTable?: HtmlTableReference | null;
  geometry?: HtmlTableGeometry | null;
  resizing?: HtmlTableResizeState | null;
  selectedAxis?: HtmlTableSelectedAxisState | null;
  contextMenuOpen?: boolean | null;
}

const defaultSelectedAxisState: HtmlTableSelectedAxisState = {
  kind: null,
  index: null,
  tablePos: null,
};

const defaultInteractionState: HtmlTableInteractionState = {
  activeTable: null,
  tableSelected: false,
  hovered: null,
  selectedAxis: defaultSelectedAxisState,
  contextTrigger: {
    visible: false,
    left: null,
    top: null,
  },
  contextMenuOpen: false,
  geometry: null,
  resizing: null,
};

export const htmlTableInteractionPluginKey = new PluginKey<HtmlTableInteractionState>('html-table-interaction');

export function createHtmlTableInteractionPlugin(): Plugin<HtmlTableInteractionState> {
  return new Plugin<HtmlTableInteractionState>({
    key: htmlTableInteractionPluginKey,
    state: {
      init(_config, state) {
        return buildInteractionState(state, undefined);
      },
      apply(transaction, pluginState, _oldState, newState) {
        const meta = transaction.getMeta(htmlTableInteractionPluginKey) as HtmlTableInteractionMeta | undefined;
        return buildInteractionState(newState, pluginState, meta, transaction.selectionSet);
      },
    },
    view(view) {
      return new HtmlTableInteractionView(view);
    },
  });
}

export function getHtmlTableInteractionState(state: EditorState): HtmlTableInteractionState {
  return htmlTableInteractionPluginKey.getState(state) ?? defaultInteractionState;
}

export function findSelectedHtmlTable(selection: Selection): HtmlTableReference | null {
  return getSelectionTableReference(selection);
}

export function getHtmlTableContextTriggerState(
  activeTable: HtmlTableReference | null,
  tableSelected: boolean,
  selectedAxis: HtmlTableSelectedAxisState,
  geometry: HtmlTableGeometry | null,
): HtmlTableContextTriggerState {
  return deriveContextTriggerState(activeTable, tableSelected, selectedAxis, geometry);
}

function buildInteractionState(
  state: EditorState,
  previous: HtmlTableInteractionState | undefined,
  meta: HtmlTableInteractionMeta = {},
  selectionChanged = false,
): HtmlTableInteractionState {
  const selectionTable = getSelectionTableReference(state.selection);
  const activeTable = selectionTable ?? meta.hoveredTable ?? null;
  const tableSelected = isTableNodeSelection(state.selection);
  const derivedSelectedAxis = selectionTable ? getSelectedAxisState(state.selection, selectionTable) : defaultSelectedAxisState;
  const selectedAxis =
    meta.selectedAxis !== undefined
      ? meta.selectedAxis ?? defaultSelectedAxisState
      : derivedSelectedAxis.kind || selectionChanged || !previous || previous.activeTable?.tablePos !== activeTable?.tablePos
        ? derivedSelectedAxis
        : previous.selectedAxis;
  const hovered = activeTable && meta.hovered?.tablePos === activeTable.tablePos ? meta.hovered : null;
  const geometry =
    activeTable && meta.geometry
      ? meta.geometry
      : previous && previous.activeTable?.tablePos === activeTable?.tablePos
        ? previous.geometry
        : null;
  const contextTrigger = deriveContextTriggerState(activeTable, tableSelected, derivedSelectedAxis, geometry);
  const contextMenuOpen =
    meta.contextMenuOpen !== undefined
      ? Boolean(meta.contextMenuOpen) && contextTrigger.visible
      : contextTrigger.visible && !selectionChanged
        ? previous?.contextMenuOpen ?? false
        : false;
  const resizing =
    activeTable && meta.resizing !== undefined
      ? meta.resizing
      : previous && previous.activeTable?.tablePos === activeTable?.tablePos
        ? previous.resizing
        : null;

  return {
    activeTable,
    tableSelected,
    hovered,
    selectedAxis,
    contextTrigger,
    contextMenuOpen,
    geometry,
    resizing,
  };
}

function getSelectionTableReference(selection: Selection): HtmlTableReference | null {
  if (isTableNodeSelection(selection)) {
    return {
      tablePos: selection.from,
      table: selection.node,
    };
  }

  const $from = selection.$from;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === 'htmlTable') {
      return {
        tablePos: $from.before(depth),
        table: node,
      };
    }
  }

  return null;
}

function isTableNodeSelection(selection: Selection): selection is NodeSelection {
  return selection instanceof NodeSelection && selection.node.type.name === 'htmlTable';
}

function getSelectedAxisState(selection: Selection, tableReference: HtmlTableReference): HtmlTableSelectedAxisState {
  if (!(selection instanceof CellSelection)) {
    return defaultSelectedAxisState;
  }

  const selectionInfo = getTableSelectionInfo(selection.$from.doc, selection);
  if (!selectionInfo || selectionInfo.tablePos !== tableReference.tablePos) {
    return defaultSelectedAxisState;
  }

  const grid = selectionInfo.grid;
  const selectedCells = new Set(selectionInfo.cells);

  for (let rowIndex = 0; rowIndex < grid.height; rowIndex += 1) {
    const rowCells = getAxisCells(grid, 'row', rowIndex);
    if (isSameCellSet(selectedCells, rowCells)) {
      return {
        kind: 'row',
        index: rowIndex,
        tablePos: tableReference.tablePos,
      };
    }
  }

  for (let columnIndex = 0; columnIndex < grid.width; columnIndex += 1) {
    const columnCells = getAxisCells(grid, 'column', columnIndex);
    if (isSameCellSet(selectedCells, columnCells)) {
      return {
        kind: 'column',
        index: columnIndex,
        tablePos: tableReference.tablePos,
      };
    }
  }

  return defaultSelectedAxisState;
}

function deriveContextTriggerState(
  activeTable: HtmlTableReference | null,
  tableSelected: boolean,
  selectedAxis: HtmlTableSelectedAxisState,
  geometry: HtmlTableGeometry | null,
): HtmlTableContextTriggerState {
  if (!activeTable || !geometry) {
    return {
      visible: false,
      left: null,
      top: null,
    };
  }

  if (tableSelected) {
    return {
      visible: true,
      left: geometry.tableRect.left,
      top: geometry.tableRect.top,
    };
  }

  if (selectedAxis.tablePos !== activeTable.tablePos) {
    return {
      visible: false,
      left: null,
      top: null,
    };
  }

  if (selectedAxis.kind === 'row' && selectedAxis.index !== null) {
    const row = geometry.rows[selectedAxis.index];
    return row
      ? {
          visible: true,
          left: geometry.tableRect.left,
          top: geometry.tableRect.top + row.top + row.height / 2,
        }
      : {
          visible: false,
          left: null,
          top: null,
        };
  }

  if (selectedAxis.kind === 'column' && selectedAxis.index !== null) {
    const column = geometry.columns[selectedAxis.index];
    return column
      ? {
          visible: true,
          left: geometry.tableRect.left + column.left + column.width / 2,
          top: geometry.tableRect.top,
        }
      : {
          visible: false,
          left: null,
          top: null,
        };
  }

  return {
    visible: false,
    left: null,
    top: null,
  };
}

class HtmlTableInteractionView {
  private view: EditorView;
  private readonly ownerDocument: Document;
  private readonly onMouseMove = (event: MouseEvent) => this.handleMouseMove(event);
  private readonly onMouseLeave = () => this.clearHover();
  private readonly onViewportChange = () => this.syncSelectionGeometry();

  constructor(view: EditorView) {
    this.view = view;
    this.ownerDocument = view.dom.ownerDocument;
    this.view.dom.addEventListener('mousemove', this.onMouseMove);
    this.view.dom.addEventListener('mouseleave', this.onMouseLeave);
    this.ownerDocument.defaultView?.addEventListener('resize', this.onViewportChange);
    this.ownerDocument.addEventListener('scroll', this.onViewportChange, true);
    this.syncSelectionGeometry();
  }

  update(view: EditorView, previousState: EditorState): void {
    this.view = view;

    if (previousState.selection.eq(view.state.selection) && previousState.doc.eq(view.state.doc)) {
      return;
    }

    this.syncSelectionGeometry();
  }

  destroy(): void {
    this.view.dom.removeEventListener('mousemove', this.onMouseMove);
    this.view.dom.removeEventListener('mouseleave', this.onMouseLeave);
    this.ownerDocument.defaultView?.removeEventListener('resize', this.onViewportChange);
    this.ownerDocument.removeEventListener('scroll', this.onViewportChange, true);
  }

  private handleMouseMove(event: MouseEvent): void {
    const tableContext = findHtmlTableAtDOM(this.view, event.target);
    if (!tableContext) {
      this.clearHover();
      return;
    }

    const geometry = measureHtmlTableGeometry(tableContext.dom);
    const nextHover = getHoverState(tableContext.tablePos, geometry, event.clientX, event.clientY, event.target);
    const current = getHtmlTableInteractionState(this.view.state);

    if (
      isSameReference(current.activeTable, getSelectionTableReference(this.view.state.selection) ?? tableContext)
      && isSameHover(current.hovered, nextHover)
      && isSameGeometry(current.geometry, geometry)
    ) {
      return;
    }

    this.dispatchInteractionMeta({
      hovered: nextHover,
      hoveredTable: {
        tablePos: tableContext.tablePos,
        table: tableContext.table,
      },
      geometry,
    });
  }

  private clearHover(): void {
    const current = getHtmlTableInteractionState(this.view.state);
    if (!current.hovered && !(!getSelectionTableReference(this.view.state.selection) && current.activeTable)) {
      return;
    }

    this.dispatchInteractionMeta({
      hovered: null,
      hoveredTable: getSelectionTableReference(this.view.state.selection),
    });
  }

  private syncSelectionGeometry(): void {
    const selectionTable = getSelectionTableReference(this.view.state.selection);
    const current = getHtmlTableInteractionState(this.view.state);

    if (!selectionTable) {
      if (current.activeTable || current.geometry) {
        this.dispatchInteractionMeta({
          hovered: current.hovered,
          hoveredTable: current.hovered
            ? current.activeTable
            : null,
          geometry: null,
        });
      }

      return;
    }

    const domContext = getRenderedHtmlTableContext(this.view, selectionTable.tablePos);
    if (!domContext) return;

    const geometry = measureHtmlTableGeometry(domContext.dom);
    if (
      isSameReference(current.activeTable, selectionTable)
      && isSameGeometry(current.geometry, geometry)
    ) {
      return;
    }

    this.dispatchInteractionMeta({
      hovered: current.hovered?.tablePos === selectionTable.tablePos ? current.hovered : null,
      hoveredTable: selectionTable,
      geometry,
    });
  }

  private dispatchInteractionMeta(meta: HtmlTableInteractionMeta): void {
    const transaction = this.view.state.tr.setMeta(htmlTableInteractionPluginKey, meta);
    this.view.dispatch(transaction);
  }
}

function getHoverState(
  tablePos: number,
  geometry: HtmlTableGeometry,
  clientX: number,
  clientY: number,
  target: EventTarget | null,
): HtmlTableHoverState {
  const localX = clientX - geometry.tableRect.left;
  const localY = clientY - geometry.tableRect.top;
  const column = geometry.columns.find((item) => localX >= item.left && localX <= item.left + item.width);
  const row = geometry.rows.find((item) => localY >= item.top && localY <= item.top + item.height);
  const targetElement = target instanceof Element ? target : null;

  return {
    kind: targetElement?.closest('td,th') ? 'cell' : 'table',
    tablePos,
    rowIndex: row?.index ?? null,
    columnIndex: column?.index ?? null,
  };
}

function getAxisCells(grid: ReturnType<typeof createHtmlTableGrid>, axis: HtmlTableSelectedAxisKind, index: number) {
  const cells = new Set<ReturnType<typeof createHtmlTableGrid>['cells'][number]>();

  if (axis === 'row') {
    for (let columnIndex = 0; columnIndex < grid.width; columnIndex += 1) {
      const cell = grid.slots[index]?.[columnIndex]?.cell;
      if (cell) {
        cells.add(cell);
      }
    }
  } else {
    for (let rowIndex = 0; rowIndex < grid.height; rowIndex += 1) {
      const cell = grid.slots[rowIndex]?.[index]?.cell;
      if (cell) {
        cells.add(cell);
      }
    }
  }

  return cells;
}

function isSameCellSet(
  selectedCells: Set<ReturnType<typeof createHtmlTableGrid>['cells'][number]>,
  axisCells: Set<ReturnType<typeof createHtmlTableGrid>['cells'][number]>,
) {
  if (selectedCells.size !== axisCells.size) return false;

  for (const cell of axisCells) {
    if (!selectedCells.has(cell)) return false;
  }

  return true;
}

function isSameReference(
  current: HtmlTableReference | null,
  next: HtmlTableReference | null,
) {
  return current?.tablePos === next?.tablePos;
}

function isSameHover(current: HtmlTableHoverState | null, next: HtmlTableHoverState | null) {
  return (
    current?.kind === next?.kind &&
    current?.tablePos === next?.tablePos &&
    current?.rowIndex === next?.rowIndex &&
    current?.columnIndex === next?.columnIndex
  );
}

function isSameGeometry(current: HtmlTableGeometry | null, next: HtmlTableGeometry | null) {
  if (!current || !next) return current === next;
  if (
    current.tableRect.left !== next.tableRect.left ||
    current.tableRect.top !== next.tableRect.top ||
    current.tableRect.width !== next.tableRect.width ||
    current.tableRect.height !== next.tableRect.height ||
    current.columns.length !== next.columns.length ||
    current.rows.length !== next.rows.length
  ) {
    return false;
  }

  for (let index = 0; index < current.columns.length; index += 1) {
    const column = current.columns[index]!;
    const nextColumn = next.columns[index]!;
    if (column.left !== nextColumn.left || column.width !== nextColumn.width) {
      return false;
    }
  }

  for (let index = 0; index < current.rows.length; index += 1) {
    const row = current.rows[index]!;
    const nextRow = next.rows[index]!;
    if (row.top !== nextRow.top || row.height !== nextRow.height) {
      return false;
    }
  }

  return true;
}
