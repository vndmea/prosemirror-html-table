import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { NodeSelection, Plugin, PluginKey, type EditorState, type Selection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { CellSelection, createHtmlTableGrid, type HtmlTableCellRef } from 'prosemirror-html-table';

import {
  findHtmlTableAtDOM,
  getRenderedHtmlTableContext,
  measureHtmlTableGeometry,
  type HtmlTableGeometry,
} from './table-dom.js';
import { getTableSelectionInfo } from './table-utils.js';

export type HtmlTableHoverKind = 'table' | 'cell';
export type HtmlTableSelectedAxisKind = 'row' | 'column';
const HTML_TABLE_OVERLAY_SELECTOR = '[data-html-table-overlay]';

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
  selectedAxisExplicit?: boolean;
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
  selectedAxisExplicit?: boolean | null;
  contextMenuOpen?: boolean | null;
}

interface HtmlTableCellDragState {
  tablePos: number;
  anchorCellPos: number;
  headCellPos: number;
  selectionStarted: boolean;
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
  selectedAxisExplicit: false,
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
  const selectedAxisExplicit =
    selectedAxis.kind === null
      ? false
      : meta.selectedAxis !== undefined
        ? Boolean(meta.selectedAxis && (meta.selectedAxisExplicit ?? true))
        : Boolean(
            previous?.selectedAxisExplicit
            && previous.selectedAxis.kind === selectedAxis.kind
            && previous.selectedAxis.tablePos === selectedAxis.tablePos,
          );
  const hovered = activeTable && meta.hovered?.tablePos === activeTable.tablePos ? meta.hovered : null;
  const geometry =
    activeTable && meta.geometry
      ? meta.geometry
      : previous && previous.activeTable?.tablePos === activeTable?.tablePos
        ? previous.geometry
        : null;
  const contextTrigger = deriveContextTriggerState(
    activeTable,
    tableSelected,
    selectedAxisExplicit ? selectedAxis : defaultSelectedAxisState,
    geometry,
  );
  const canOpenContextMenu = contextTrigger.visible || Boolean(getTableSelectionInfo(state.doc, state.selection));
  const contextMenuOpen =
    meta.contextMenuOpen !== undefined
      ? Boolean(meta.contextMenuOpen) && canOpenContextMenu
      : canOpenContextMenu && !selectionChanged
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
    selectedAxisExplicit,
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
    if (geometry.visibleTableRect.width <= 0 || geometry.visibleTableRect.height <= 0) {
      return {
        visible: false,
        left: null,
        top: null,
      };
    }

    return {
      visible: true,
      left: geometry.visibleTableRect.left,
      top: geometry.visibleTableRect.top,
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
    if (!row) {
      return {
        visible: false,
        left: null,
        top: null,
      };
    }

    const top = Math.max(geometry.visibleTableRect.top, geometry.tableRect.top + row.top);
    const bottom = Math.min(geometry.visibleTableRect.bottom, geometry.tableRect.top + row.top + row.height);
    if (bottom <= top || geometry.visibleTableRect.width <= 0) {
      return {
        visible: false,
        left: null,
        top: null,
      };
    }

    return {
      visible: true,
      left: geometry.visibleTableRect.left,
      top: top + (bottom - top) / 2,
    };
  }

  if (selectedAxis.kind === 'column' && selectedAxis.index !== null) {
    const column = geometry.columns[selectedAxis.index];
    if (!column) {
      return {
        visible: false,
        left: null,
        top: null,
      };
    }

    const left = Math.max(geometry.visibleTableRect.left, geometry.tableRect.left + column.left);
    const right = Math.min(geometry.visibleTableRect.right, geometry.tableRect.left + column.left + column.width);
    if (right <= left || geometry.visibleTableRect.height <= 0) {
      return {
        visible: false,
        left: null,
        top: null,
      };
    }

    return {
      visible: true,
      left: left + (right - left) / 2,
      top: geometry.visibleTableRect.top,
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
  private activeCellDrag: HtmlTableCellDragState | null = null;
  private suppressNextClick = false;
  private previousUserSelect: string | null = null;
  private previousWebkitUserSelect: string | null = null;
  private readonly onMouseDown = (event: MouseEvent) => this.handleMouseDown(event);
  private readonly onClickCapture = (event: MouseEvent) => this.handleClickCapture(event);
  private readonly onDocumentMouseMove = (event: MouseEvent) => this.updateCellDragSelection(event);
  private readonly onMouseMove = (event: MouseEvent) => this.handleMouseMove(event);
  private readonly onMouseLeave = (event: MouseEvent) => this.handleMouseLeave(event);
  private readonly onDocumentMouseUp = (event: MouseEvent) => this.handleDocumentMouseUp(event);
  private readonly onViewportChange = () => this.syncSelectionGeometry();

  constructor(view: EditorView) {
    this.view = view;
    this.ownerDocument = view.dom.ownerDocument;
    this.view.dom.addEventListener('mousedown', this.onMouseDown);
    this.view.dom.addEventListener('click', this.onClickCapture, true);
    this.view.dom.addEventListener('mousemove', this.onMouseMove);
    this.view.dom.addEventListener('mouseleave', this.onMouseLeave);
    this.ownerDocument.addEventListener('mouseup', this.onDocumentMouseUp);
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
    this.restoreNativeSelectionSuppression();
    this.view.dom.removeEventListener('mousedown', this.onMouseDown);
    this.view.dom.removeEventListener('click', this.onClickCapture, true);
    this.view.dom.removeEventListener('mousemove', this.onMouseMove);
    this.view.dom.removeEventListener('mouseleave', this.onMouseLeave);
    this.ownerDocument.removeEventListener('mouseup', this.onDocumentMouseUp);
    this.ownerDocument.defaultView?.removeEventListener('resize', this.onViewportChange);
    this.ownerDocument.removeEventListener('scroll', this.onViewportChange, true);
  }

  private handleMouseDown(event: MouseEvent): void {
    if (event.button !== 0) {
      this.clearCellDrag();
      return;
    }

    const cellContext = getCellSelectionDragContext(this.view, event.target, event.clientX, event.clientY);
    if (!cellContext) {
      this.clearCellDrag();
      return;
    }

    this.activeCellDrag = {
      tablePos: cellContext.tablePos,
      anchorCellPos: cellContext.cellPos,
      headCellPos: cellContext.cellPos,
      selectionStarted: false,
    };
    this.ownerDocument.addEventListener('mousemove', this.onDocumentMouseMove);
  }

  private handleClickCapture(event: MouseEvent): void {
    if (!this.suppressNextClick) {
      return;
    }

    this.suppressNextClick = false;
    event.preventDefault();
    event.stopPropagation();
  }

  private handleMouseMove(event: MouseEvent): void {
    this.updateCellDragSelection(event);

    const tableContext = findHtmlTableAtDOM(this.view, event.target);
    if (!tableContext) {
      this.clearHover();
      return;
    }

    const geometry = measureHtmlTableGeometry(tableContext.dom, tableContext.wrapper);
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

  private handleMouseLeave(event: MouseEvent): void {
    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Element && relatedTarget.closest(HTML_TABLE_OVERLAY_SELECTOR)) {
      return;
    }

    this.clearHover();
  }

  private syncSelectionGeometry(): void {
    const current = getHtmlTableInteractionState(this.view.state);
    const selectionTable = getSelectionTableReference(this.view.state.selection);
    const measuredTable = selectionTable ?? current.activeTable;

    if (!measuredTable) {
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

    const domContext = getRenderedHtmlTableContext(this.view, measuredTable.tablePos);
    if (!domContext) return;

    const geometry = measureHtmlTableGeometry(domContext.dom, domContext.wrapper);
    if (
      isSameReference(current.activeTable, measuredTable)
      && isSameGeometry(current.geometry, geometry)
    ) {
      return;
    }

    this.dispatchInteractionMeta({
      hovered: current.hovered?.tablePos === measuredTable.tablePos ? current.hovered : null,
      hoveredTable: measuredTable,
      geometry,
    });
  }

  private dispatchInteractionMeta(meta: HtmlTableInteractionMeta): void {
    const transaction = this.view.state.tr.setMeta(htmlTableInteractionPluginKey, meta);
    this.view.dispatch(transaction);
  }

  private updateCellDragSelection(event: MouseEvent): void {
    const activeCellDrag = this.activeCellDrag;
    if (!activeCellDrag) return;

    if ((event.buttons & 1) === 0) {
      this.clearCellDrag();
      return;
    }

    if (activeCellDrag.selectionStarted) {
      event.preventDefault();
      this.ownerDocument.getSelection()?.removeAllRanges();
    }

    const cellContext = getCellSelectionDragContext(
      this.view,
      this.ownerDocument.elementFromPoint(event.clientX, event.clientY),
      event.clientX,
      event.clientY,
    );
    if (!cellContext || cellContext.tablePos !== activeCellDrag.tablePos) {
      return;
    }

    if (cellContext.cellPos === activeCellDrag.headCellPos) {
      return;
    }

    activeCellDrag.headCellPos = cellContext.cellPos;
    if (activeCellDrag.anchorCellPos === activeCellDrag.headCellPos) {
      return;
    }

    const nextSelection = CellSelection.create(
      this.view.state.doc,
      activeCellDrag.anchorCellPos,
      activeCellDrag.headCellPos,
    );
    const currentSelection = this.view.state.selection;
    if (
      currentSelection instanceof CellSelection
      && currentSelection.anchorCellPos === nextSelection.anchorCellPos
      && currentSelection.headCellPos === nextSelection.headCellPos
    ) {
      return;
    }

    if (!activeCellDrag.selectionStarted) {
      activeCellDrag.selectionStarted = true;
      this.suppressNativeSelection();
    }
    this.ownerDocument.getSelection()?.removeAllRanges();
    event.preventDefault();
    this.view.dispatch(this.view.state.tr.setSelection(nextSelection));
  }

  private handleDocumentMouseUp(event: MouseEvent): void {
    const activeCellDrag = this.activeCellDrag;
    if (
      activeCellDrag?.selectionStarted
      && activeCellDrag.anchorCellPos !== activeCellDrag.headCellPos
    ) {
      const nextSelection = CellSelection.create(
        this.view.state.doc,
        activeCellDrag.anchorCellPos,
        activeCellDrag.headCellPos,
      );
      this.suppressNextClick = true;
      this.ownerDocument.getSelection()?.removeAllRanges();
      event.preventDefault();
      event.stopPropagation();
      this.view.dispatch(this.view.state.tr.setSelection(nextSelection));
    }

    this.clearCellDrag();
  }

  private clearCellDrag(): void {
    this.ownerDocument.removeEventListener('mousemove', this.onDocumentMouseMove);
    this.activeCellDrag = null;
    this.restoreNativeSelectionSuppression();
  }

  private suppressNativeSelection(): void {
    if (this.previousUserSelect !== null || this.previousWebkitUserSelect !== null) {
      this.ownerDocument.getSelection()?.removeAllRanges();
      return;
    }

    const { style } = this.view.dom;
    this.previousUserSelect = style.userSelect;
    this.previousWebkitUserSelect = style.webkitUserSelect;
    style.userSelect = 'none';
    style.webkitUserSelect = 'none';
    this.ownerDocument.getSelection()?.removeAllRanges();
  }

  private restoreNativeSelectionSuppression(): void {
    if (this.previousUserSelect === null || this.previousWebkitUserSelect === null) {
      return;
    }

    const { style } = this.view.dom;
    style.userSelect = this.previousUserSelect;
    style.webkitUserSelect = this.previousWebkitUserSelect;
    this.previousUserSelect = null;
    this.previousWebkitUserSelect = null;
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
    current.wrapperRect.left !== next.wrapperRect.left ||
    current.wrapperRect.top !== next.wrapperRect.top ||
    current.wrapperRect.width !== next.wrapperRect.width ||
    current.wrapperRect.height !== next.wrapperRect.height ||
    current.visibleTableRect.left !== next.visibleTableRect.left ||
    current.visibleTableRect.top !== next.visibleTableRect.top ||
    current.visibleTableRect.width !== next.visibleTableRect.width ||
    current.visibleTableRect.height !== next.visibleTableRect.height ||
    current.scrollLeft !== next.scrollLeft ||
    current.scrollTop !== next.scrollTop ||
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

function getCellSelectionDragContext(
  view: EditorView,
  target: EventTarget | null,
  clientX?: number,
  clientY?: number,
): { tablePos: number; cellPos: number } | null {
  const targetNode = target instanceof Node ? target : null;
  const targetElement = targetNode instanceof Element ? targetNode : targetNode?.parentElement ?? null;
  const tableContext = findHtmlTableAtDOM(view, targetElement);
  if (!tableContext) return null;

  const geometry = measureHtmlTableGeometry(tableContext.dom, tableContext.wrapper);
  const pointX = clientX ?? targetElement?.getBoundingClientRect().left ?? null;
  const pointY = clientY ?? targetElement?.getBoundingClientRect().top ?? null;
  if (pointX === null || pointY === null) return null;

  const localX = pointX - geometry.tableRect.left;
  const localY = pointY - geometry.tableRect.top;
  const column = geometry.columns.find((item) => localX >= item.left && localX <= item.left + item.width);
  const row = geometry.rows.find((item) => localY >= item.top && localY <= item.top + item.height);
  if (!row || !column) return null;

  const grid = createHtmlTableGrid(tableContext.table);
  const cell = grid.slots[row.index]?.[column.index]?.cell;
  if (!cell) return null;

  const cellPositions = collectDragCellPositions(tableContext.table, tableContext.tablePos, grid);
  const cellPos = cellPositions.get(cell);
  if (cellPos === undefined) return null;

  return {
    tablePos: tableContext.tablePos,
    cellPos,
  };
}

function collectDragCellPositions(
  table: ProseMirrorNode,
  tablePos: number,
  grid: ReturnType<typeof createHtmlTableGrid>,
): Map<HtmlTableCellRef, number> {
  const cellPositions = new Map<HtmlTableCellRef, number>();
  const sectionCounters = {
    head: 0,
    body: 0,
    foot: 0,
  };

  table.forEach((section, sectionOffset) => {
    const sectionName = getDragSectionName(section);
    if (!sectionName) return;

    const sectionIndex = sectionCounters[sectionName];
    sectionCounters[sectionName] += 1;

    section.forEach((row, rowOffset, rowIndexInSection) => {
      row.forEach((cellNode, cellOffset, cellIndex) => {
        const cell = grid.cells.find(
          (item) =>
            item.section === sectionName
            && item.sectionIndex === sectionIndex
            && item.rowIndexInSection === rowIndexInSection
            && item.cellIndex === cellIndex
            && item.node === cellNode,
        );

        if (cell) {
          cellPositions.set(cell, tablePos + 1 + sectionOffset + 1 + rowOffset + 1 + cellOffset);
        }
      });
    });
  });

  return cellPositions;
}

function getDragSectionName(node: ProseMirrorNode): 'head' | 'body' | 'foot' | null {
  if (node.type.name === 'htmlTableHead') return 'head';
  if (node.type.name === 'htmlTableBody') return 'body';
  if (node.type.name === 'htmlTableFoot') return 'foot';
  return null;
}
