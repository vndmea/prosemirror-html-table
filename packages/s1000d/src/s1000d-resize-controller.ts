import type { EditorView } from 'prosemirror-view';

import { getS1000DSelectionInfo, isWholeS1000DTableSelection } from './clipboard.js';
import { applyS1000DColumnWidthsToTgroup } from './column-widths.js';
import { getRenderedS1000DTableContext, type S1000DTableDOMContext } from './dom-adapter.js';
import { setS1000DTableInteractionMeta, type S1000DTableInteractionMeta, type S1000DTableInteractionState } from './interaction.js';
import { replaceActiveS1000DTgroup, replaceS1000DTable } from './mutation.js';
import {
  measureS1000DRenderedTableGeometry,
  MIN_COLUMN_WIDTH,
  RESIZE_HANDLE_WIDTH,
  syncCount,
} from './s1000d-overlay-geometry.js';
import {
  applyTableColumnPreviewWidths,
  TableResizeLifecycle,
  type TableGeometry,
  type TableOverlayPositionState,
} from 'tiptap-html-table/table-interaction';

export class S1000DResizeController {
  private view: EditorView;
  private activeResize:
    | {
        tablePos: number;
        tgroupIndex: number;
        columnIndex: number;
        startX: number;
        startWidths: number[];
        currentWidths: number[];
      }
    | null = null;
  private readonly resizeLifecycle: TableResizeLifecycle;
  private readonly onRender: () => void;
  private readonly onSyncInteractionMeta: (meta: Partial<S1000DTableInteractionMeta>) => void;

  constructor(
    view: EditorView,
    ownerDocument: Document,
    onRender: () => void,
    onSyncInteractionMeta: (meta: Partial<S1000DTableInteractionMeta>) => void,
  ) {
    this.view = view;
    this.onRender = onRender;
    this.onSyncInteractionMeta = onSyncInteractionMeta;
    this.resizeLifecycle = new TableResizeLifecycle(
      ownerDocument,
      (event) => this.handleResizeMove(event),
      () => this.finishResize(),
    );
  }

  update(view: EditorView): void {
    this.view = view;
  }

  destroy(): void {
    this.resizeLifecycle.destroy();
  }

  get isActive(): boolean {
    return Boolean(this.activeResize);
  }

  renderHandles(
    resizersParent: HTMLDivElement,
    interaction: S1000DTableInteractionState,
    context: S1000DTableDOMContext,
    geometry: TableGeometry,
    positionState: TableOverlayPositionState,
    axisDragHasDragged: boolean,
    createResizeHandle: () => HTMLButtonElement,
  ): void {
    syncCount(resizersParent, geometry.columns.length, () => createResizeHandle());
    const selectionInfo = getS1000DSelectionInfo(this.view.state, { tablePos: context.tablePos });
    const selectionVisible = (
      this.view.hasFocus()
      && Boolean(selectionInfo)
    ) || isWholeS1000DTableSelection(this.view.state, { tablePos: context.tablePos });
    const interactionVisible = Boolean(interaction.resizing && interaction.resizing.tablePos === context.tablePos)
      || (
        interaction.hovered?.tablePos === context.tablePos
        && (
          interaction.hoveredControl === 'cell'
          || interaction.hoveredControl === 'column-handle'
        )
      )
      || (
        interaction.contextMenuOpen
        && interaction.selectedAxis.tablePos === context.tablePos
        && interaction.selectedAxis.kind === 'column'
      )
      || selectionVisible;

    for (let index = 0; index < geometry.columns.length; index += 1) {
      const handle = resizersParent.children[index] as HTMLButtonElement | undefined;
      const column = geometry.columns[index];
      if (!handle || !column) {
        continue;
      }

      const visibleLeft = positionState.tableLeft + (geometry.visibleTableRect.left - geometry.tableRect.left);
      const visibleRight = positionState.tableLeft + (geometry.visibleTableRect.right - geometry.tableRect.left);
      const boundary = positionState.tableLeft + column.left + column.width;

      handle.hidden = !interactionVisible || axisDragHasDragged || boundary < visibleLeft || boundary > visibleRight;
      handle.dataset.tablePos = String(context.tablePos);
      handle.dataset.tgroupIndex = String(context.activeTgroupIndex);
      handle.dataset.columnIndex = String(column.index);
      handle.style.pointerEvents = interactionVisible && !axisDragHasDragged ? 'auto' : 'none';
      handle.classList.toggle(
        'is-active',
        Boolean(interaction.resizing && interaction.resizing.tablePos === context.tablePos && interaction.resizing.columnIndex === column.index),
      );
      Object.assign(handle.style, {
        left: `${boundary + 10}px`,
        top: `${positionState.visibleTableTop}px`,
        width: `${RESIZE_HANDLE_WIDTH}px`,
        height: `${positionState.visibleTableHeight}px`,
      });
    }
  }

  handleResizeStart(event: MouseEvent): void {
    const handle = event.currentTarget as HTMLButtonElement | null;
    const tablePos = Number(handle?.dataset.tablePos);
    const preferredTgroupIndex = Number(handle?.dataset.tgroupIndex);
    const columnIndex = Number(handle?.dataset.columnIndex);
    const context = Number.isInteger(tablePos)
      ? getRenderedS1000DTableContext(this.view, tablePos, {
        preferredTgroupIndex: Number.isInteger(preferredTgroupIndex) ? preferredTgroupIndex : null,
      })
      : undefined;

    if (!handle || !context?.activeTgroup || !Number.isInteger(columnIndex)) {
      return;
    }

    const geometry = measureS1000DRenderedTableGeometry(context.dom, context.wrapper, context.activeTgroupIndex);
    if (!geometry.columns[columnIndex]) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    this.activeResize = {
      tablePos,
      tgroupIndex: context.activeTgroupIndex,
      columnIndex,
      startX: event.clientX,
      startWidths: geometry.columns.map((column) => Math.max(MIN_COLUMN_WIDTH, Math.round(column.width))),
      currentWidths: geometry.columns.map((column) => Math.max(MIN_COLUMN_WIDTH, Math.round(column.width))),
    };
    setS1000DTableInteractionMeta(this.view, {
      resizing: {
        tablePos,
        columnIndex,
      },
      contextMenuOpen: false,
      menuScope: null,
      menuAnchor: null,
    });
    this.resizeLifecycle.start();
    this.onRender();
  }

  private handleResizeMove(event: MouseEvent): void {
    const activeResize = this.activeResize;
    if (!activeResize) {
      return;
    }

    const context = getRenderedS1000DTableContext(this.view, activeResize.tablePos, {
      preferredTgroupIndex: activeResize.tgroupIndex,
    });
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
    this.onRender();
  }

  private finishResize(): void {
    const activeResize = this.activeResize;
    if (!activeResize) {
      return;
    }

    const context = getRenderedS1000DTableContext(this.view, activeResize.tablePos, {
      preferredTgroupIndex: activeResize.tgroupIndex,
    });
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
      const context = getRenderedS1000DTableContext(this.view, this.activeResize.tablePos, {
        preferredTgroupIndex: this.activeResize.tgroupIndex,
      });
      if (context) {
        applyTableColumnPreviewWidths(context.dom, this.activeResize.startWidths, MIN_COLUMN_WIDTH);
      }
    }

    this.resizeLifecycle.stop();
    this.activeResize = null;
    this.onSyncInteractionMeta({
      resizing: null,
    });
    this.onRender();
  }
}
