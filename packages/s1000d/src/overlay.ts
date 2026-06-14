import { Fragment, type Node as ProseMirrorNode } from 'prosemirror-model';
import { NodeSelection, Plugin, PluginKey } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

import { createS1000DTableAdapter } from './adapter.js';
import { resolveColspecs } from './cals/index.js';
import { getS1000DSelectionInfo, isWholeS1000DTableSelection } from './clipboard.js';
import { findS1000DTableAtDOM, getRenderedS1000DTableContext, getSelectedRenderedS1000DTableContext, type S1000DTableDOMContext } from './dom-adapter.js';
import { replaceActiveS1000DTgroup, replaceS1000DTable } from './mutation.js';
import { s1000dTableNodeNames } from './names.js';
import { findS1000DEntryPosition } from './position.js';
import { S1000DCellSelection, isS1000DCellSelection } from './selection.js';
import type { S1000DEntryRef, S1000DTgroupGrid } from './grid.js';
import {
  getVisibleTableRect,
  toTableRect,
  type TableGeometry,
  type TableRect,
} from 'tiptap-html-table/table-interaction/dom-geometry';
import {
  getTableOverlayPositionState,
  getVisibleTableSelectionRect,
  type TableOverlayPositionState,
} from 'tiptap-html-table/table-interaction/overlay-geometry';
import { TableOverlayHost } from 'tiptap-html-table/table-interaction/overlay-host';
import { TableResizeLifecycle, applyTableColumnPreviewWidths } from 'tiptap-html-table/table-interaction/resize-lifecycle';

const ROW_HANDLE_OFFSET = 10;
const COLUMN_HANDLE_OFFSET = 10;
const MIN_HANDLE_INSET = 8;
const HANDLE_SIZE = 14;
const RESIZE_HANDLE_WIDTH = 12;
const MIN_COLUMN_WIDTH = 48;
const DRAG_SELECTION_THRESHOLD = 4;
const OVERLAY_SELECTOR = '[data-s1000d-table-overlay]';

export const s1000dTableOverlayPluginKey = new PluginKey('s1000d-table-overlay');

export function createS1000DTableOverlayPlugin(): Plugin {
  return new Plugin({
    key: s1000dTableOverlayPluginKey,
    view(view) {
      return new S1000DTableOverlayView(view);
    },
  });
}

export function applyS1000DColumnWidthsToTgroup(
  tgroup: ProseMirrorNode,
  widths: readonly number[],
): ProseMirrorNode {
  const children: ProseMirrorNode[] = [];
  tgroup.forEach((child) => children.push(child));

  const colspecType = tgroup.type.schema.nodes[s1000dTableNodeNames.colspec];
  if (!colspecType) {
    throw new Error(`Missing node type in schema: ${s1000dTableNodeNames.colspec}`);
  }

  const resolvedColspecs = resolveColspecs(tgroup);
  const preservedChildren = children.filter((child) => child.type.name !== s1000dTableNodeNames.colspec);
  const targetCount = Math.max(
    1,
    widths.length,
    resolvedColspecs.reduce((max, colspec) => Math.max(max, colspec.index + 1), 0),
    Number.parseInt(String(tgroup.attrs.cols ?? '0'), 10) || 0,
  );
  const nextColspecs = Array.from({ length: targetCount }, (_value, index) => {
    const existing = resolvedColspecs.find((colspec) => colspec.index === index)?.node;
    const width = formatS1000DColumnWidth(widths[index]);

    if (existing) {
      return existing.type.create(
        {
          ...existing.attrs,
          colwidth: width ?? existing.attrs.colwidth ?? null,
        },
        existing.content,
        existing.marks,
      );
    }

    return colspecType.create({
      colname: `c${index + 1}`,
      colwidth: width,
    });
  });

  return tgroup.type.create(
    {
      ...tgroup.attrs,
      cols: String(targetCount),
    },
    Fragment.fromArray([...nextColspecs, ...preservedChildren]),
    tgroup.marks,
  );
}

class S1000DTableOverlayView {
  private view: EditorView;
  private readonly root: HTMLDivElement;
  private readonly overlayHost: TableOverlayHost;
  private readonly rowHandlesParent: HTMLDivElement;
  private readonly columnHandlesParent: HTMLDivElement;
  private readonly resizersParent: HTMLDivElement;
  private readonly tableHandle: HTMLButtonElement;
  private readonly rowBand: HTMLDivElement;
  private readonly columnBand: HTMLDivElement;
  private readonly cellFill: HTMLDivElement;
  private readonly cellOutline: HTMLDivElement;
  private readonly hoverRowBand: HTMLDivElement;
  private readonly hoverColumnBand: HTMLDivElement;
  private readonly hoverCellFill: HTMLDivElement;
  private readonly hoverCellOutline: HTMLDivElement;
  private hoveredTablePos: number | null = null;
  private hoveredRowIndex: number | null = null;
  private hoveredColumnIndex: number | null = null;
  private hoverMode: 'cell' | 'row-handle' | 'column-handle' | 'table-handle' | null = null;
  private pendingCellDrag:
    | {
        tablePos: number;
        anchorEntryPos: number;
        startX: number;
        startY: number;
      }
    | null = null;
  private activeCellDrag:
    | {
        tablePos: number;
        anchorEntryPos: number;
        headEntryPos: number;
      }
    | null = null;
  private activeResize:
    | {
        tablePos: number;
        columnIndex: number;
        startX: number;
        startWidths: number[];
        currentWidths: number[];
      }
    | null = null;
  private readonly resizeLifecycle: TableResizeLifecycle;
  private readonly onMouseMove = (event: MouseEvent) => this.handleMouseMove(event);
  private readonly onMouseLeave = (event: MouseEvent) => this.handleMouseLeave(event);
  private readonly onMouseDown = (event: MouseEvent) => this.handleMouseDown(event);
  private readonly onViewportChange = () => this.render();
  private readonly onResizeMove = (event: MouseEvent) => this.handleResizeMove(event);
  private readonly onResizeEnd = () => this.finishResize();
  private readonly onDocumentMouseMove = (event: MouseEvent) => this.handleDocumentMouseMove(event);
  private readonly onDocumentMouseUp = (event: MouseEvent) => this.finishCellDrag(event);

  constructor(view: EditorView) {
    this.view = view;
    this.root = view.dom.ownerDocument.createElement('div');
    this.root.dataset.s1000dTableOverlay = 'true';
    this.root.dataset.testid = 's1000d-overlay';
    this.root.hidden = true;
    Object.assign(this.root.style, {
      position: 'absolute',
      inset: '0',
      zIndex: '5',
      pointerEvents: 'none',
    });

    this.overlayHost = new TableOverlayHost(this.root, {
      hostClassName: 's1000d-table-overlay-host',
      hostDataAttribute: 'data-s1000d-table-overlay-host',
      hostDataValue: 'true',
    });

    this.rowHandlesParent = createLayer(this.root.ownerDocument, 's1000d-table-overlay__rows');
    this.columnHandlesParent = createLayer(this.root.ownerDocument, 's1000d-table-overlay__columns');
    this.resizersParent = createLayer(this.root.ownerDocument, 's1000d-table-overlay__resizers');
    this.tableHandle = this.createTableHandle();
    this.rowBand = createBand(this.root.ownerDocument);
    this.rowBand.dataset.testid = 's1000d-selection-row-band';
    this.columnBand = createBand(this.root.ownerDocument);
    this.columnBand.dataset.testid = 's1000d-selection-column-band';
    this.cellFill = createBox(this.root.ownerDocument, {
      background: 'rgba(37, 99, 235, 0.08)',
      borderRadius: '2px',
      pointerEvents: 'none',
      position: 'absolute',
      zIndex: '2',
    });
    this.cellOutline = createBox(this.root.ownerDocument, {
      border: '1px solid #2563eb',
      borderRadius: '2px',
      boxSizing: 'border-box',
      pointerEvents: 'none',
      position: 'absolute',
      zIndex: '3',
    });
    this.cellFill.dataset.testid = 's1000d-selection-cell-fill';
    this.cellOutline.dataset.testid = 's1000d-selection-cell-outline';
    this.hoverRowBand = createBand(this.root.ownerDocument, {
      background: 'rgba(37, 99, 235, 0.08)',
      boxShadow: 'inset 0 0 0 1px rgba(37, 99, 235, 0.22)',
      zIndex: '1',
    });
    this.hoverRowBand.dataset.testid = 's1000d-hover-row-band';
    this.hoverColumnBand = createBand(this.root.ownerDocument, {
      background: 'rgba(37, 99, 235, 0.08)',
      boxShadow: 'inset 0 0 0 1px rgba(37, 99, 235, 0.22)',
      zIndex: '1',
    });
    this.hoverColumnBand.dataset.testid = 's1000d-hover-column-band';
    this.hoverCellFill = createBox(this.root.ownerDocument, {
      background: 'rgba(37, 99, 235, 0.06)',
      borderRadius: '2px',
      pointerEvents: 'none',
      position: 'absolute',
      zIndex: '1',
    });
    this.hoverCellFill.dataset.testid = 's1000d-hover-cell-fill';
    this.hoverCellOutline = createBox(this.root.ownerDocument, {
      border: '1px dashed rgba(37, 99, 235, 0.5)',
      borderRadius: '2px',
      boxSizing: 'border-box',
      pointerEvents: 'none',
      position: 'absolute',
      zIndex: '2',
    });
    this.hoverCellOutline.dataset.testid = 's1000d-hover-cell-outline';

    this.root.append(
      this.hoverRowBand,
      this.hoverColumnBand,
      this.hoverCellFill,
      this.hoverCellOutline,
      this.rowBand,
      this.columnBand,
      this.cellFill,
      this.cellOutline,
      this.tableHandle,
      this.rowHandlesParent,
      this.columnHandlesParent,
      this.resizersParent,
    );

    this.resizeLifecycle = new TableResizeLifecycle(this.root.ownerDocument, this.onResizeMove, this.onResizeEnd);

    this.view.dom.addEventListener('mousemove', this.onMouseMove);
    this.view.dom.addEventListener('mouseover', this.onMouseMove);
    this.view.dom.addEventListener('mouseleave', this.onMouseLeave);
    this.view.dom.addEventListener('mousedown', this.onMouseDown);
    this.root.ownerDocument.addEventListener('mousemove', this.onMouseMove);
    this.root.ownerDocument.addEventListener('mouseover', this.onMouseMove);
    this.root.ownerDocument.defaultView?.addEventListener('resize', this.onViewportChange);
    this.root.ownerDocument.addEventListener('scroll', this.onViewportChange, true);
    this.render();
  }

  update(view: EditorView): void {
    this.view = view;
    this.render();
  }

  destroy(): void {
    this.resizeLifecycle.destroy();
    this.view.dom.removeEventListener('mousemove', this.onMouseMove);
    this.view.dom.removeEventListener('mouseover', this.onMouseMove);
    this.view.dom.removeEventListener('mouseleave', this.onMouseLeave);
    this.view.dom.removeEventListener('mousedown', this.onMouseDown);
    this.root.ownerDocument.removeEventListener('mousemove', this.onMouseMove);
    this.root.ownerDocument.removeEventListener('mouseover', this.onMouseMove);
    this.root.ownerDocument.defaultView?.removeEventListener('resize', this.onViewportChange);
    this.root.ownerDocument.removeEventListener('scroll', this.onViewportChange, true);
    this.stopCellDragListeners();
    this.overlayHost.detach();
  }

  private render(): void {
    const context = this.getActiveContext();
    if (!context?.activeTgroup) {
      this.detach();
      return;
    }

    const geometry = measureS1000DRenderedTableGeometry(context.dom, context.wrapper);
    const overlayHost = this.overlayHost.attach(context.wrapper);
    const hostRect = overlayHost.getBoundingClientRect();
    const positionState = getTableOverlayPositionState(
      geometry,
      hostRect,
      MIN_HANDLE_INSET,
      ROW_HANDLE_OFFSET,
      COLUMN_HANDLE_OFFSET,
    );
    const selectionInfo =
      getS1000DSelectionInfo(this.view.state, { tablePos: context.tablePos })
      ?? getS1000DSelectionInfo(this.view.state);
    const tableSelection = isTableSelectionForContext(this.view, context.tablePos);
    const rowSelection = isS1000DCellSelection(this.view.state.selection) && this.view.state.selection.isRowSelection();
    const columnSelection = isS1000DCellSelection(this.view.state.selection) && this.view.state.selection.isColSelection();

    this.renderSelection(geometry, positionState, selectionInfo, rowSelection, columnSelection);
    this.renderHoverFeedback(context, geometry, positionState, selectionInfo);
    this.renderTableHandle(context, positionState, tableSelection);
    this.renderRowHandles(context, geometry, positionState, selectionInfo, rowSelection);
    this.renderColumnHandles(context, geometry, positionState, selectionInfo, columnSelection);
    this.renderResizeHandles(context, geometry, positionState);

    this.root.hidden = false;
  }

  private renderSelection(
    geometry: TableGeometry,
    positionState: TableOverlayPositionState,
    selectionInfo: ReturnType<typeof getS1000DSelectionInfo> | undefined,
    rowSelection: boolean,
    columnSelection: boolean,
  ): void {
    this.rowBand.hidden = true;
    this.columnBand.hidden = true;
    this.cellFill.hidden = true;
    this.cellOutline.hidden = true;
    this.hoverRowBand.hidden = true;
    this.hoverColumnBand.hidden = true;
    this.hoverCellFill.hidden = true;
    this.hoverCellOutline.hidden = true;

    if (!selectionInfo) {
      return;
    }

    const rect = getVisibleTableSelectionRect(
      geometry,
      positionState.tableLeft,
      positionState.tableTop,
      selectionInfo.left,
      selectionInfo.right,
      selectionInfo.top,
      selectionInfo.bottom,
    );
    if (!rect) {
      return;
    }

    if (rowSelection) {
      applyRect(this.rowBand, rect);
      this.rowBand.hidden = false;
      return;
    }

    if (columnSelection) {
      applyRect(this.columnBand, rect);
      this.columnBand.hidden = false;
      return;
    }

    applyRect(this.cellFill, rect);
    applyRect(this.cellOutline, rect);
    this.cellFill.hidden = false;
    this.cellOutline.hidden = false;
  }

  private renderHoverFeedback(
    context: S1000DTableDOMContext,
    geometry: TableGeometry,
    positionState: TableOverlayPositionState,
    selectionInfo: ReturnType<typeof getS1000DSelectionInfo> | undefined,
  ): void {
    this.hoverRowBand.hidden = true;
    this.hoverColumnBand.hidden = true;
    this.hoverCellFill.hidden = true;
    this.hoverCellOutline.hidden = true;

    if (this.hoveredTablePos !== context.tablePos) {
      return;
    }

    if (this.hoverMode === 'row-handle' && this.hoveredRowIndex !== null) {
      const rect = getVisibleContentRowRect(geometry, positionState, this.hoveredRowIndex);
      if (rect) {
        applyRect(this.hoverRowBand, rect);
        this.hoverRowBand.hidden = false;
      }
      return;
    }

    if (this.hoverMode === 'column-handle' && this.hoveredColumnIndex !== null) {
      const rect = getVisibleContentColumnRect(geometry, positionState, this.hoveredColumnIndex);
      if (rect) {
        applyRect(this.hoverColumnBand, rect);
        this.hoverColumnBand.hidden = false;
      }
      return;
    }

    if (this.hoverMode === 'cell' && this.hoveredRowIndex !== null && this.hoveredColumnIndex !== null) {
      const rect = getVisibleCellRect(geometry, positionState, this.hoveredRowIndex, this.hoveredColumnIndex);
      if (rect) {
        applyRect(this.hoverCellFill, rect);
        applyRect(this.hoverCellOutline, rect);
        this.hoverCellFill.hidden = false;
        this.hoverCellOutline.hidden = false;
        return;
      }
    }

    if (this.hoverMode === 'cell' && selectionInfo) {
      const rect = getVisibleTableSelectionRect(
        geometry,
        positionState.tableLeft,
        positionState.tableTop,
        selectionInfo.left,
        selectionInfo.right,
        selectionInfo.top,
        selectionInfo.bottom,
      );
      if (rect) {
        applyRect(this.hoverCellFill, rect);
        applyRect(this.hoverCellOutline, rect);
        this.hoverCellFill.hidden = false;
        this.hoverCellOutline.hidden = false;
      }
    }
  }

  private renderTableHandle(
    context: S1000DTableDOMContext,
    positionState: TableOverlayPositionState,
    tableSelection: boolean,
  ): void {
    this.tableHandle.hidden = false;
    this.tableHandle.dataset.tablePos = String(context.tablePos);
    this.tableHandle.classList.toggle('is-selected', tableSelection);
    this.tableHandle.classList.toggle(
      'is-hovered',
      this.hoveredTablePos === context.tablePos && this.hoverMode === 'table-handle',
    );
    Object.assign(this.tableHandle.style, {
      left: `${positionState.rowHandleLeft}px`,
      top: `${positionState.columnHandleTop}px`,
      width: `${HANDLE_SIZE}px`,
      height: `${HANDLE_SIZE}px`,
    });
  }

  private renderRowHandles(
    context: S1000DTableDOMContext,
    geometry: TableGeometry,
    positionState: TableOverlayPositionState,
    selectionInfo: ReturnType<typeof getS1000DSelectionInfo> | undefined,
    rowSelection: boolean,
  ): void {
    syncCount(this.rowHandlesParent, geometry.rows.length, () => this.createAxisHandle('row'));

    for (let index = 0; index < geometry.rows.length; index += 1) {
      const handle = this.rowHandlesParent.children[index] as HTMLButtonElement | undefined;
      const row = geometry.rows[index];
      if (!handle || !row) {
        continue;
      }

      const rect = getVisibleRowRect(geometry, positionState, row.index);
      handle.hidden = !rect;
      handle.dataset.tablePos = String(context.tablePos);
      handle.dataset.rowIndex = String(row.index);
      handle.classList.toggle('is-hovered', this.hoveredTablePos === context.tablePos && this.hoveredRowIndex === row.index);
      handle.classList.toggle(
        'is-selected',
        Boolean(rowSelection && selectionInfo && row.index >= selectionInfo.top && row.index <= selectionInfo.bottom),
      );

      if (!rect) {
        continue;
      }

      Object.assign(handle.style, {
        left: `${positionState.rowHandleLeft}px`,
        top: `${rect.top + rect.height / 2}px`,
        width: `${HANDLE_SIZE}px`,
        height: `${Math.max(HANDLE_SIZE, Math.min(22, rect.height))}px`,
      });
    }
  }

  private renderColumnHandles(
    context: S1000DTableDOMContext,
    geometry: TableGeometry,
    positionState: TableOverlayPositionState,
    selectionInfo: ReturnType<typeof getS1000DSelectionInfo> | undefined,
    columnSelection: boolean,
  ): void {
    syncCount(this.columnHandlesParent, geometry.columns.length, () => this.createAxisHandle('column'));

    for (let index = 0; index < geometry.columns.length; index += 1) {
      const handle = this.columnHandlesParent.children[index] as HTMLButtonElement | undefined;
      const column = geometry.columns[index];
      if (!handle || !column) {
        continue;
      }

      const rect = getVisibleColumnRect(geometry, positionState, column.index);
      handle.hidden = !rect;
      handle.dataset.tablePos = String(context.tablePos);
      handle.dataset.columnIndex = String(column.index);
      handle.classList.toggle('is-hovered', this.hoveredTablePos === context.tablePos && this.hoveredColumnIndex === column.index);
      handle.classList.toggle(
        'is-selected',
        Boolean(columnSelection && selectionInfo && column.index >= selectionInfo.left && column.index <= selectionInfo.right),
      );

      if (!rect) {
        continue;
      }

      Object.assign(handle.style, {
        left: `${rect.left + rect.width / 2}px`,
        top: `${positionState.columnHandleTop}px`,
        width: `${Math.max(HANDLE_SIZE, Math.min(22, rect.width))}px`,
        height: `${HANDLE_SIZE}px`,
      });
    }
  }

  private renderResizeHandles(
    context: S1000DTableDOMContext,
    geometry: TableGeometry,
    positionState: TableOverlayPositionState,
  ): void {
    syncCount(this.resizersParent, geometry.columns.length, () => this.createResizeHandle());

    for (let index = 0; index < geometry.columns.length; index += 1) {
      const handle = this.resizersParent.children[index] as HTMLButtonElement | undefined;
      const column = geometry.columns[index];
      if (!handle || !column) {
        continue;
      }

      const visibleLeft = positionState.tableLeft + (geometry.visibleTableRect.left - geometry.tableRect.left);
      const visibleRight = positionState.tableLeft + (geometry.visibleTableRect.right - geometry.tableRect.left);
      const boundary = positionState.tableLeft + column.left + column.width;

      handle.hidden = boundary < visibleLeft || boundary > visibleRight;
      handle.dataset.tablePos = String(context.tablePos);
      handle.dataset.columnIndex = String(column.index);
      handle.classList.toggle(
        'is-active',
        Boolean(this.activeResize && this.activeResize.tablePos === context.tablePos && this.activeResize.columnIndex === column.index),
      );
      Object.assign(handle.style, {
        left: `${boundary}px`,
        top: `${positionState.visibleTableTop}px`,
        width: `${RESIZE_HANDLE_WIDTH}px`,
        height: `${positionState.visibleTableHeight}px`,
      });
    }
  }

  private createTableHandle(): HTMLButtonElement {
    const handle = this.root.ownerDocument.createElement('button');
    handle.type = 'button';
    handle.tabIndex = -1;
    handle.dataset.testid = 's1000d-table-handle';
    handle.setAttribute('aria-label', 'Select table');
    Object.assign(handle.style, {
      position: 'absolute',
      minWidth: '0',
      padding: '0',
      border: '1px solid rgba(37, 99, 235, 0.22)',
      borderRadius: '4px',
      background: '#ffffff',
      boxShadow: '0 2px 8px rgba(15, 23, 42, 0.08)',
      color: '#1d4ed8',
      fontSize: '10px',
      fontWeight: '700',
      lineHeight: '1',
      transform: 'translate(-50%, -50%)',
      pointerEvents: 'auto',
      cursor: 'pointer',
    });
    handle.textContent = '□';
    handle.addEventListener('mousedown', (event) => this.handleTableMouseDown(event));
    handle.addEventListener('mouseenter', () => this.handleTableHover(handle));
    handle.addEventListener('mouseleave', (event) => this.handleAxisLeave(event));
    return handle;
  }

  private createAxisHandle(axis: 'row' | 'column'): HTMLButtonElement {
    const handle = this.root.ownerDocument.createElement('button');
    handle.type = 'button';
    handle.tabIndex = -1;
    handle.dataset.testid = axis === 'row' ? 's1000d-row-handle' : 's1000d-column-handle';
    Object.assign(handle.style, {
      position: 'absolute',
      minWidth: '0',
      padding: '0',
      border: '1px solid rgba(37, 99, 235, 0.22)',
      borderRadius: '999px',
      background: '#ffffff',
      boxShadow: '0 2px 8px rgba(15, 23, 42, 0.08)',
      color: '#1d4ed8',
      fontSize: '10px',
      fontWeight: '700',
      lineHeight: '1',
      transform: 'translate(-50%, -50%)',
      pointerEvents: 'auto',
      cursor: 'pointer',
    });
    handle.textContent = axis === 'row' ? '⋮' : '⋯';
    handle.addEventListener('mousedown', (event) => this.handleAxisMouseDown(event, axis));
    handle.addEventListener('mouseenter', () => this.handleAxisHover(handle, axis));
    handle.addEventListener('mouseleave', (event) => this.handleAxisLeave(event));
    return handle;
  }

  private createResizeHandle(): HTMLButtonElement {
    const handle = this.root.ownerDocument.createElement('button');
    handle.type = 'button';
    handle.tabIndex = -1;
    handle.dataset.testid = 's1000d-resize-handle';
    Object.assign(handle.style, {
      position: 'absolute',
      minWidth: '0',
      padding: '0',
      border: '0',
      background: 'transparent',
      transform: 'translateX(-50%)',
      pointerEvents: 'auto',
      cursor: 'col-resize',
    });
    handle.addEventListener('mousedown', (event) => this.handleResizeStart(event));
    return handle;
  }

  private handleAxisMouseDown(event: MouseEvent, axis: 'row' | 'column'): void {
    const handle = event.currentTarget as HTMLButtonElement | null;
    const tablePos = Number(handle?.dataset.tablePos);
    const axisIndex = Number(handle?.dataset[axis === 'row' ? 'rowIndex' : 'columnIndex']);
    const context = Number.isInteger(tablePos) ? getRenderedS1000DTableContext(this.view, tablePos) : undefined;

    if (!handle || !context?.activeTgroup || !Number.isInteger(axisIndex)) {
      return;
    }

    const grid = createS1000DTableAdapter().createGrid(context.activeTgroup, context.activeTgroupIndex);
    const entry = axis === 'row'
      ? findAxisAnchorEntry(grid, 'row', axisIndex)
      : findAxisAnchorEntry(grid, 'column', axisIndex);
    const entryPos = entry ? findS1000DEntryPosition(context, entry) : undefined;
    if (typeof entryPos !== 'number') {
      return;
    }

    const selection = axis === 'row'
      ? S1000DCellSelection.rowSelection(this.view.state.doc.resolve(entryPos + 1))
      : S1000DCellSelection.colSelection(this.view.state.doc.resolve(entryPos + 1));

    event.preventDefault();
    event.stopPropagation();
    this.view.dispatch(this.view.state.tr.setSelection(selection).scrollIntoView());
    this.view.focus();
  }

  private handleTableMouseDown(event: MouseEvent): void {
    const handle = event.currentTarget as HTMLButtonElement | null;
    const tablePos = Number(handle?.dataset.tablePos);
    if (!handle || !Number.isInteger(tablePos)) {
      return;
    }

    const context = getRenderedS1000DTableContext(this.view, tablePos);
    if (!context) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.view.dispatch(this.view.state.tr.setSelection(NodeSelection.create(this.view.state.doc, context.tablePos)).scrollIntoView());
    this.view.focus();
  }

  private handleTableHover(handle: HTMLButtonElement): void {
    const tablePos = Number(handle.dataset.tablePos);
    if (!Number.isInteger(tablePos)) {
      return;
    }

    this.hoveredTablePos = tablePos;
    this.hoveredRowIndex = null;
    this.hoveredColumnIndex = null;
    this.hoverMode = 'table-handle';
    this.render();
  }

  private handleAxisHover(handle: HTMLButtonElement, axis: 'row' | 'column'): void {
    const tablePos = Number(handle.dataset.tablePos);
    const axisIndex = Number(handle.dataset[axis === 'row' ? 'rowIndex' : 'columnIndex']);
    if (!Number.isInteger(tablePos) || !Number.isInteger(axisIndex)) {
      return;
    }

    this.hoveredTablePos = tablePos;
    this.hoverMode = axis === 'row' ? 'row-handle' : 'column-handle';
    if (axis === 'row') {
      this.hoveredRowIndex = axisIndex;
      this.hoveredColumnIndex = null;
    } else {
      this.hoveredRowIndex = null;
      this.hoveredColumnIndex = axisIndex;
    }
    this.render();
  }

  private handleAxisLeave(event: MouseEvent): void {
    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Element && relatedTarget.closest(OVERLAY_SELECTOR)) {
      return;
    }

    this.hoveredRowIndex = null;
    this.hoveredColumnIndex = null;
    this.hoverMode = null;
    this.render();
  }

  private handleResizeStart(event: MouseEvent): void {
    const handle = event.currentTarget as HTMLButtonElement | null;
    const tablePos = Number(handle?.dataset.tablePos);
    const columnIndex = Number(handle?.dataset.columnIndex);
    const context = Number.isInteger(tablePos) ? getRenderedS1000DTableContext(this.view, tablePos) : undefined;

    if (!handle || !context?.activeTgroup || !Number.isInteger(columnIndex)) {
      return;
    }

    const geometry = measureS1000DRenderedTableGeometry(context.dom, context.wrapper);
    if (!geometry.columns[columnIndex]) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    this.activeResize = {
      tablePos,
      columnIndex,
      startX: event.clientX,
      startWidths: geometry.columns.map((column) => Math.max(MIN_COLUMN_WIDTH, Math.round(column.width))),
      currentWidths: geometry.columns.map((column) => Math.max(MIN_COLUMN_WIDTH, Math.round(column.width))),
    };
    this.resizeLifecycle.start();
    this.render();
  }

  private handleResizeMove(event: MouseEvent): void {
    const activeResize = this.activeResize;
    if (!activeResize) {
      return;
    }

    const context = getRenderedS1000DTableContext(this.view, activeResize.tablePos);
    if (!context) {
      return;
    }

    const widths = activeResize.startWidths.slice();
    widths[activeResize.columnIndex] = Math.max(
      MIN_COLUMN_WIDTH,
      (activeResize.startWidths[activeResize.columnIndex] ?? MIN_COLUMN_WIDTH) + (event.clientX - activeResize.startX),
    );
    activeResize.currentWidths = widths;

    applyTableColumnPreviewWidths(context.dom, widths, MIN_COLUMN_WIDTH);
    this.render();
  }

  private finishResize(): void {
    const activeResize = this.activeResize;
    if (!activeResize) {
      return;
    }

    const context = getRenderedS1000DTableContext(this.view, activeResize.tablePos);
    if (!context?.activeTgroup) {
      this.clearResize(true);
      return;
    }

    const nextTgroup = applyS1000DColumnWidthsToTgroup(context.activeTgroup, activeResize.currentWidths);
    const nextTable = replaceActiveS1000DTgroup(context.table, nextTgroup, context.activeTgroupIndex);

    this.clearResize(false);
    replaceS1000DTable(this.view.state, this.view.dispatch, context, nextTable);
    this.view.focus();
  }

  private clearResize(restorePreview: boolean): void {
    if (restorePreview && this.activeResize) {
      const context = getRenderedS1000DTableContext(this.view, this.activeResize.tablePos);
      if (context) {
        applyTableColumnPreviewWidths(context.dom, this.activeResize.startWidths, MIN_COLUMN_WIDTH);
      }
    }

    this.resizeLifecycle.stop();
    this.activeResize = null;
    this.render();
  }

  private handleMouseMove(event: MouseEvent): void {
    if (this.activeCellDrag || this.pendingCellDrag) {
      return;
    }

    const eventElement = getPointerElement(this.root.ownerDocument, event);
    const hoveredRowHandle = eventElement?.closest('[data-testid="s1000d-row-handle"]') as HTMLButtonElement | null;
    if (hoveredRowHandle) {
      this.handleAxisHover(hoveredRowHandle, 'row');
      return;
    }

    const hoveredColumnHandle = eventElement?.closest('[data-testid="s1000d-column-handle"]') as HTMLButtonElement | null;
    if (hoveredColumnHandle) {
      this.handleAxisHover(hoveredColumnHandle, 'column');
      return;
    }

    const hoveredTableHandle = eventElement?.closest('[data-testid="s1000d-table-handle"]') as HTMLButtonElement | null;
    if (hoveredTableHandle) {
      this.handleTableHover(hoveredTableHandle);
      return;
    }

    const activeContext = this.getActiveContext();
    const hovered = activeContext && hitTestRenderedTablePoint(activeContext, event.clientX, event.clientY)
      ? activeContext
      : findS1000DTableAtDOM(this.view, eventElement ?? event.target);
    if (!hovered) {
      this.clearHoverState();
      return;
    }

    const geometry = measureS1000DRenderedTableGeometry(hovered.dom, hovered.wrapper);
    const rowIndex = getHoveredRowIndex(geometry, event.clientY);
    const columnIndex = getHoveredColumnIndex(geometry, event.clientX);

    if (
      this.hoveredTablePos === hovered.tablePos
      && this.hoveredRowIndex === rowIndex
      && this.hoveredColumnIndex === columnIndex
      && this.hoverMode === 'cell'
    ) {
      return;
    }

    this.hoveredTablePos = hovered.tablePos;
    this.hoveredRowIndex = rowIndex;
    this.hoveredColumnIndex = columnIndex;
    this.hoverMode = 'cell';
    this.render();
  }

  private handleMouseLeave(event: MouseEvent): void {
    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Element && relatedTarget.closest(OVERLAY_SELECTOR)) {
      return;
    }

    if (this.hoveredTablePos === null && this.hoveredRowIndex === null && this.hoveredColumnIndex === null) {
      return;
    }

    this.clearHoverState();
  }

  private handleMouseDown(event: MouseEvent): void {
    if (event.button !== 0 || this.activeResize) {
      return;
    }

    const target = getPointerElement(this.root.ownerDocument, event) ?? (event.target instanceof Element ? event.target : event.target instanceof Node ? event.target.parentElement : null);
    if (!target || target.closest(OVERLAY_SELECTOR) || !target.closest('td, th')) {
      return;
    }

    const context = findS1000DTableAtDOM(this.view, target);
    if (!context?.activeTgroup) {
      return;
    }

    const hit = getGridHitAtPoint(context, event.clientX, event.clientY, false);
    if (!hit) {
      return;
    }

    const anchorEntryPos = findS1000DEntryPosition(context, hit.entry);
    if (typeof anchorEntryPos !== 'number') {
      return;
    }

    this.pendingCellDrag = {
      tablePos: context.tablePos,
      anchorEntryPos,
      startX: event.clientX,
      startY: event.clientY,
    };
    this.startCellDragListeners();
  }

  private handleDocumentMouseMove(event: MouseEvent): void {
    const pendingCellDrag = this.pendingCellDrag;
    if (pendingCellDrag && !this.activeCellDrag) {
      const movedX = Math.abs(event.clientX - pendingCellDrag.startX);
      const movedY = Math.abs(event.clientY - pendingCellDrag.startY);
      if (Math.max(movedX, movedY) < DRAG_SELECTION_THRESHOLD) {
        return;
      }

      this.activeCellDrag = {
        tablePos: pendingCellDrag.tablePos,
        anchorEntryPos: pendingCellDrag.anchorEntryPos,
        headEntryPos: pendingCellDrag.anchorEntryPos,
      };
      this.view.dispatch(
        this.view.state.tr.setSelection(
          S1000DCellSelection.create(this.view.state.doc, pendingCellDrag.anchorEntryPos, pendingCellDrag.anchorEntryPos),
        ),
      );
    }

    if (!this.activeCellDrag) {
      return;
    }

    const context = getRenderedS1000DTableContext(this.view, this.activeCellDrag.tablePos);
    if (!context?.activeTgroup) {
      this.finishCellDrag();
      return;
    }

    const hit = getGridHitAtPoint(context, event.clientX, event.clientY, true);
    if (!hit) {
      return;
    }

    const headEntryPos = findS1000DEntryPosition(context, hit.entry);
    if (typeof headEntryPos !== 'number') {
      return;
    }

    this.hoveredTablePos = context.tablePos;
    this.hoveredRowIndex = hit.rowIndex;
    this.hoveredColumnIndex = hit.columnIndex;
    this.hoverMode = 'cell';

    if (this.activeCellDrag.headEntryPos === headEntryPos) {
      return;
    }

    this.activeCellDrag.headEntryPos = headEntryPos;
    event.preventDefault();
    this.view.dispatch(
      this.view.state.tr.setSelection(
        S1000DCellSelection.create(this.view.state.doc, this.activeCellDrag.anchorEntryPos, headEntryPos),
      ),
    );
    this.render();
  }

  private finishCellDrag(event?: MouseEvent): void {
    if (this.activeCellDrag) {
      this.view.dispatch(
        this.view.state.tr.setSelection(
          S1000DCellSelection.create(
            this.view.state.doc,
            this.activeCellDrag.anchorEntryPos,
            this.activeCellDrag.headEntryPos,
          ),
        ).scrollIntoView(),
      );
      this.view.focus();
      event?.preventDefault();
    }

    this.pendingCellDrag = null;
    this.activeCellDrag = null;
    this.stopCellDragListeners();
  }

  private startCellDragListeners(): void {
    const ownerDocument = this.root.ownerDocument;
    ownerDocument.addEventListener('mousemove', this.onDocumentMouseMove);
    ownerDocument.addEventListener('mouseup', this.onDocumentMouseUp);
  }

  private stopCellDragListeners(): void {
    const ownerDocument = this.root.ownerDocument;
    ownerDocument.removeEventListener('mousemove', this.onDocumentMouseMove);
    ownerDocument.removeEventListener('mouseup', this.onDocumentMouseUp);
  }

  private clearHoverState(): void {
    if (
      this.hoveredTablePos === null
      && this.hoveredRowIndex === null
      && this.hoveredColumnIndex === null
      && this.hoverMode === null
    ) {
      return;
    }

    this.hoveredTablePos = null;
    this.hoveredRowIndex = null;
    this.hoveredColumnIndex = null;
    this.hoverMode = null;
    this.render();
  }

  private getActiveContext(): S1000DTableDOMContext | undefined {
    const selected = getSelectedRenderedS1000DTableContext(this.view);
    if (selected?.activeTgroup) {
      return selected;
    }

    return this.hoveredTablePos !== null ? getRenderedS1000DTableContext(this.view, this.hoveredTablePos) : undefined;
  }

  private detach(): void {
    this.root.hidden = true;
    this.tableHandle.hidden = true;
    this.rowBand.hidden = true;
    this.columnBand.hidden = true;
    this.cellFill.hidden = true;
    this.cellOutline.hidden = true;
    this.hoverRowBand.hidden = true;
    this.hoverColumnBand.hidden = true;
    this.hoverCellFill.hidden = true;
    this.hoverCellOutline.hidden = true;
    this.overlayHost.detach();
  }
}

function createLayer(ownerDocument: Document, className: string): HTMLDivElement {
  const element = ownerDocument.createElement('div');
  element.className = className;
  Object.assign(element.style, {
    position: 'absolute',
    inset: '0',
    pointerEvents: 'none',
  });
  return element;
}

function createBand(
  ownerDocument: Document,
  style: Partial<CSSStyleDeclaration> = {},
): HTMLDivElement {
  return createBox(ownerDocument, {
    position: 'absolute',
    zIndex: '1',
    background: 'rgba(37, 99, 235, 0.05)',
    borderRadius: '2px',
    boxShadow: 'inset 0 0 0 1px rgba(37, 99, 235, 0.18)',
    pointerEvents: 'none',
    ...style,
  });
}

function createBox(ownerDocument: Document, style: Partial<CSSStyleDeclaration>): HTMLDivElement {
  const element = ownerDocument.createElement('div');
  Object.assign(element.style, style);
  element.hidden = true;
  return element;
}

function syncCount(parent: HTMLElement, count: number, factory: () => HTMLElement): void {
  while (parent.children.length < count) {
    parent.append(factory());
  }

  while (parent.children.length > count) {
    parent.lastElementChild?.remove();
  }
}

function applyRect(element: HTMLElement, rect: TableRect): void {
  Object.assign(element.style, {
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  });
}

function getVisibleRowRect(
  geometry: TableGeometry,
  positionState: TableOverlayPositionState,
  rowIndex: number,
): TableRect | null {
  const row = geometry.rows[rowIndex];
  if (!row) {
    return null;
  }

  const top = positionState.tableTop + row.top;
  const bottom = top + row.height;
  const visibleTop = positionState.visibleTableTop;
  const visibleBottom = visibleTop + positionState.visibleTableHeight;
  const clampedTop = Math.max(top, visibleTop);
  const clampedBottom = Math.min(bottom, visibleBottom);
  if (clampedBottom <= clampedTop) {
    return null;
  }

  return {
    left: positionState.rowHandleLeft,
    top: clampedTop,
    right: positionState.rowHandleLeft + HANDLE_SIZE,
    bottom: clampedBottom,
    width: HANDLE_SIZE,
    height: clampedBottom - clampedTop,
  };
}

function getVisibleColumnRect(
  geometry: TableGeometry,
  positionState: TableOverlayPositionState,
  columnIndex: number,
): TableRect | null {
  const column = geometry.columns[columnIndex];
  if (!column) {
    return null;
  }

  const left = positionState.tableLeft + column.left;
  const right = left + column.width;
  const visibleLeft = positionState.visibleTableLeft;
  const visibleRight = visibleLeft + positionState.visibleTableWidth;
  const clampedLeft = Math.max(left, visibleLeft);
  const clampedRight = Math.min(right, visibleRight);
  if (clampedRight <= clampedLeft) {
    return null;
  }

  return {
    left: clampedLeft,
    top: positionState.columnHandleTop,
    right: clampedRight,
    bottom: positionState.columnHandleTop + HANDLE_SIZE,
    width: clampedRight - clampedLeft,
    height: HANDLE_SIZE,
  };
}

function getVisibleContentRowRect(
  geometry: TableGeometry,
  positionState: TableOverlayPositionState,
  rowIndex: number,
): TableRect | null {
  const row = geometry.rows[rowIndex];
  if (!row) {
    return null;
  }

  const top = positionState.tableTop + row.top;
  const bottom = top + row.height;
  const visibleTop = positionState.visibleTableTop;
  const visibleBottom = visibleTop + positionState.visibleTableHeight;
  const clampedTop = Math.max(top, visibleTop);
  const clampedBottom = Math.min(bottom, visibleBottom);
  if (clampedBottom <= clampedTop) {
    return null;
  }

  return {
    left: positionState.visibleTableLeft,
    top: clampedTop,
    right: positionState.visibleTableLeft + positionState.visibleTableWidth,
    bottom: clampedBottom,
    width: positionState.visibleTableWidth,
    height: clampedBottom - clampedTop,
  };
}

function getVisibleContentColumnRect(
  geometry: TableGeometry,
  positionState: TableOverlayPositionState,
  columnIndex: number,
): TableRect | null {
  const column = geometry.columns[columnIndex];
  if (!column) {
    return null;
  }

  const left = positionState.tableLeft + column.left;
  const right = left + column.width;
  const visibleLeft = positionState.visibleTableLeft;
  const visibleRight = visibleLeft + positionState.visibleTableWidth;
  const clampedLeft = Math.max(left, visibleLeft);
  const clampedRight = Math.min(right, visibleRight);
  if (clampedRight <= clampedLeft) {
    return null;
  }

  return {
    left: clampedLeft,
    top: positionState.visibleTableTop,
    right: clampedRight,
    bottom: positionState.visibleTableTop + positionState.visibleTableHeight,
    width: clampedRight - clampedLeft,
    height: positionState.visibleTableHeight,
  };
}

function getVisibleCellRect(
  geometry: TableGeometry,
  positionState: TableOverlayPositionState,
  rowIndex: number,
  columnIndex: number,
): TableRect | null {
  const rowRect = getVisibleContentRowRect(geometry, positionState, rowIndex);
  const columnRect = getVisibleContentColumnRect(geometry, positionState, columnIndex);
  if (!rowRect || !columnRect) {
    return null;
  }

  return {
    left: columnRect.left,
    top: rowRect.top,
    right: columnRect.right,
    bottom: rowRect.bottom,
    width: columnRect.width,
    height: rowRect.height,
  };
}

function isTableSelectionForContext(view: EditorView, tablePos: number): boolean {
  const selection = view.state.selection;
  return (
    (selection instanceof NodeSelection && selection.from === tablePos && selection.node.type.name === s1000dTableNodeNames.table)
    || isWholeS1000DTableSelection(view.state, { tablePos })
  );
}

function findAxisAnchorEntry(
  grid: S1000DTgroupGrid,
  axis: 'row' | 'column',
  axisIndex: number,
): S1000DEntryRef | undefined {
  if (axis === 'row') {
    for (let columnIndex = 0; columnIndex < grid.width; columnIndex += 1) {
      const entry = grid.slots[axisIndex]?.[columnIndex]?.entry;
      if (entry) {
        return entry;
      }
    }
    return undefined;
  }

  for (let rowIndex = 0; rowIndex < grid.height; rowIndex += 1) {
    const entry = grid.slots[rowIndex]?.[axisIndex]?.entry;
    if (entry) {
      return entry;
    }
  }
  return undefined;
}

function formatS1000DColumnWidth(width: number | undefined): string | null {
  if (!Number.isFinite(width) || width == null || width <= 0) {
    return null;
  }

  return `${Math.round(width)}px`;
}

function getHoveredRowIndex(geometry: TableGeometry, clientY: number): number | null {
  const localY = clientY - geometry.tableRect.top;
  const row = geometry.rows.find((item) => localY >= item.top && localY <= item.top + item.height);
  return row?.index ?? null;
}

function getHoveredColumnIndex(geometry: TableGeometry, clientX: number): number | null {
  const localX = clientX - geometry.tableRect.left;
  const column = geometry.columns.find((item) => localX >= item.left && localX <= item.left + item.width);
  return column?.index ?? null;
}

function getGridHitAtPoint(
  context: S1000DTableDOMContext,
  clientX: number,
  clientY: number,
  clampToTable: boolean,
): { entry: S1000DEntryRef; rowIndex: number; columnIndex: number } | undefined {
  if (!context.activeTgroup) {
    return undefined;
  }

  const geometry = measureS1000DRenderedTableGeometry(context.dom, context.wrapper);
  const localX = clampToTable
    ? clamp(clientX - geometry.tableRect.left, 0, Math.max(0, geometry.tableRect.width - 1))
    : clientX - geometry.tableRect.left;
  const localY = clampToTable
    ? clamp(clientY - geometry.tableRect.top, 0, Math.max(0, geometry.tableRect.height - 1))
    : clientY - geometry.tableRect.top;
  const rowIndex = findIndexByOffset(geometry.rows.map((row) => ({ start: row.top, size: row.height })), localY);
  const columnIndex = findIndexByOffset(geometry.columns.map((column) => ({ start: column.left, size: column.width })), localX);
  if (rowIndex === null || columnIndex === null) {
    return undefined;
  }

  const grid = createS1000DTableAdapter().createGrid(context.activeTgroup, context.activeTgroupIndex);
  const entry = grid.slots[rowIndex]?.[columnIndex]?.entry;
  return entry ? { entry, rowIndex, columnIndex } : undefined;
}

function findIndexByOffset(
  items: ReadonlyArray<{ start: number; size: number }>,
  offset: number,
): number | null {
  const match = items.findIndex((item) => offset >= item.start && offset <= item.start + item.size);
  return match >= 0 ? match : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getPointerElement(ownerDocument: Document, event: MouseEvent): Element | null {
  const pointTarget = ownerDocument.elementFromPoint(event.clientX, event.clientY);
  if (pointTarget instanceof Element) {
    return pointTarget;
  }

  if (event.target instanceof Element) {
    return event.target;
  }

  return event.target instanceof Node ? event.target.parentElement : null;
}

function hitTestRenderedTablePoint(
  context: S1000DTableDOMContext,
  clientX: number,
  clientY: number,
): boolean {
  const geometry = measureS1000DRenderedTableGeometry(context.dom, context.wrapper);
  return clientX >= geometry.tableRect.left
    && clientX <= geometry.tableRect.right
    && clientY >= geometry.tableRect.top
    && clientY <= geometry.tableRect.bottom;
}

function measureS1000DRenderedTableGeometry(table: HTMLTableElement, wrapper?: HTMLElement): TableGeometry {
  const tableRect = measureS1000DTableRect(table);
  const wrapperRect = wrapper ? toTableRect(wrapper.getBoundingClientRect()) : tableRect;
  const visibleTableRect = getVisibleTableRect(tableRect, wrapperRect);
  const columnBoundaries = measureS1000DColumnBoundaries(table, tableRect);
  const rows = Array.from(table.querySelectorAll('tr')).map((row, index) => {
    const rect = row.getBoundingClientRect();
    return {
      index,
      top: rect.top - tableRect.top,
      height: rect.height,
    };
  });

  return {
    tableRect,
    wrapperRect,
    visibleTableRect,
    scrollLeft: wrapper?.scrollLeft ?? 0,
    scrollTop: wrapper?.scrollTop ?? 0,
    columns: Array.from({ length: Math.max(0, columnBoundaries.length - 1) }, (_value, index) => ({
      index,
      left: columnBoundaries[index] ?? 0,
      width: Math.max(0, (columnBoundaries[index + 1] ?? 0) - (columnBoundaries[index] ?? 0)),
    })),
    rows,
  };
}

function measureS1000DTableRect(table: HTMLTableElement): TableRect {
  const tableRect = table.getBoundingClientRect();
  const rows = Array.from(table.querySelectorAll('tr'));
  if (rows.length === 0) {
    return toTableRect(tableRect);
  }

  const firstRowRect = rows[0]?.getBoundingClientRect();
  const lastRowRect = rows[rows.length - 1]?.getBoundingClientRect();
  if (!firstRowRect || !lastRowRect) {
    return toTableRect(tableRect);
  }

  return {
    left: tableRect.left,
    right: tableRect.right,
    width: tableRect.width,
    top: firstRowRect.top,
    bottom: lastRowRect.bottom,
    height: Math.max(0, lastRowRect.bottom - firstRowRect.top),
  };
}

function measureS1000DColumnBoundaries(table: HTMLTableElement, tableRect: TableRect): number[] {
  const rows = Array.from(table.querySelectorAll('tr'));
  const activeRowSpans: number[] = [];
  const boundaries: Array<number | undefined> = [0];
  const spanningCells: Array<{ start: number; span: number; left: number; right: number }> = [];
  let width = 0;

  for (const row of rows) {
    let columnIndex = 0;

    for (const cell of Array.from(row.cells)) {
      while ((activeRowSpans[columnIndex] ?? 0) > 0) {
        columnIndex += 1;
      }

      const colSpan = Math.max(1, cell.colSpan || 1);
      const rowSpan = Math.max(1, cell.rowSpan || 1);
      const rect = cell.getBoundingClientRect();
      const left = rect.left - tableRect.left;
      const right = rect.right - tableRect.left;

      boundaries[columnIndex] = left;
      boundaries[columnIndex + colSpan] = right;
      width = Math.max(width, columnIndex + colSpan);

      if (colSpan > 1) {
        spanningCells.push({
          start: columnIndex,
          span: colSpan,
          left,
          right,
        });
      }

      for (let offset = 0; offset < colSpan; offset += 1) {
        activeRowSpans[columnIndex + offset] = Math.max(activeRowSpans[columnIndex + offset] ?? 0, rowSpan);
      }

      columnIndex += colSpan;
    }

    for (let index = 0; index < activeRowSpans.length; index += 1) {
      if ((activeRowSpans[index] ?? 0) > 0) {
        activeRowSpans[index] = (activeRowSpans[index] ?? 0) - 1;
      }
    }
  }

  const resolvedBoundaries = boundaries.slice(0, width + 1);
  resolvedBoundaries[0] ??= 0;
  resolvedBoundaries[width] ??= tableRect.width;

  for (const cell of spanningCells) {
    const start = cell.start;
    const end = cell.start + cell.span;

    if (resolvedBoundaries[start] === undefined) {
      resolvedBoundaries[start] = cell.left;
    }

    if (resolvedBoundaries[end] === undefined) {
      resolvedBoundaries[end] = cell.right;
    }

    let hasGap = false;
    for (let index = start + 1; index < end; index += 1) {
      if (resolvedBoundaries[index] === undefined) {
        hasGap = true;
        break;
      }
    }

    if (!hasGap) continue;

    const segmentWidth = cell.right - cell.left;
    for (let index = start + 1; index < end; index += 1) {
      resolvedBoundaries[index] ??= cell.left + (segmentWidth * (index - start)) / cell.span;
    }
  }

  for (let index = 1; index < resolvedBoundaries.length; index += 1) {
    resolvedBoundaries[index] ??= resolvedBoundaries[index - 1] ?? 0;
  }

  return resolvedBoundaries.map((boundary) => boundary ?? 0);
}
