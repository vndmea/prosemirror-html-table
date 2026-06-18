import { NodeSelection, TextSelection, type Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

import { createS1000DTableAdapter } from './adapter.js';
import { getS1000DSelectionInfo, isWholeS1000DTableSelection } from './clipboard.js';
import {
  addS1000DColumnAfter,
  addS1000DRowAfter,
  moveS1000DColumnLeft,
  moveS1000DColumnRight,
  moveS1000DRowDown,
  moveS1000DRowUp,
} from './commands.js';
import { findS1000DTableAtDOM, getRenderedS1000DTableContext, type S1000DTableDOMContext } from './dom-adapter.js';
import {
  getS1000DTableInteractionState,
  openS1000DTableContextMenu,
  setS1000DTableInteractionMeta,
  s1000dTableInteractionPluginKey,
  type S1000DTableHoverControlKind,
  type S1000DTableHoverState,
  type S1000DTableInteractionMeta,
} from './interaction.js';
import {
  getS1000DContextMenuState,
  getS1000DContextTriggerButtonState,
  type S1000DContextMenuActionResolver,
} from './menu.js';
import { findS1000DEntryPosition } from './position.js';
import { S1000DCellSelection, isS1000DCellSelection } from './selection.js';
import { S1000DMenuAdapter } from './s1000d-menu-adapter.js';
import {
  applyRect,
  AXIS_DRAG_THRESHOLD,
  COLUMN_HANDLE_OFFSET,
  createBand,
  createBox,
  createLayer,
  DRAG_SELECTION_THRESHOLD,
  EXTEND_BUTTON_OFFSET,
  findAxisAnchorEntry,
  getExtendRowIndex,
  getHoveredColumnIndex,
  getHoveredRowIndex,
  getPointerElement,
  getS1000DCellDragContext,
  getVisibleCellRect,
  getVisibleColumnRect,
  getVisibleContentColumnRect,
  getVisibleContentRowRect,
  getVisibleRowRect,
  HANDLE_SIZE,
  hitTestRenderedTablePoint,
  isAxisHandleHovered,
  isAxisHandleSelected,
  isSameGeometry,
  isSingleColumnSelection,
  isSingleRowSelection,
  isTableSelectionForContext,
  measureS1000DRenderedTableGeometry,
  MIN_HANDLE_INSET,
  OVERLAY_SELECTOR,
  ROW_HANDLE_OFFSET,
  shouldToggleContextMenuFromAxisHandle,
  syncCount,
  type S1000DAxisDragState,
  type S1000DOverlayRenderState,
} from './s1000d-overlay-geometry.js';
import { S1000DResizeController } from './s1000d-resize-controller.js';
import {
  canToggleTableContextTriggerMenu,
  getScopedTableMenuToggleAction,
  getTableMenuAnchorForElement,
  createTableContextMenuElement,
  getTableOverlayMount,
  isKeyboardClick,
  getTableOverlayPositionState,
  getVisibleTableSelectionRect,
  TableOverlayHost,
  type TableGeometry,
  type TableOverlayPositionState,
} from 'tiptap-html-table/table-interaction';

export interface S1000DTableOverlayPluginOptions {
  contextMenuActionResolver?: S1000DContextMenuActionResolver | undefined;
}

export class S1000DTableOverlayView {
  private view: EditorView;
  private readonly options: S1000DTableOverlayPluginOptions;
  private readonly root: HTMLDivElement;
  private readonly overlayHost: TableOverlayHost;
  private readonly rowHandlesParent: HTMLDivElement;
  private readonly columnHandlesParent: HTMLDivElement;
  private readonly resizersParent: HTMLDivElement;
  private readonly tableHandle: HTMLButtonElement;
  private readonly contextTriggerButton: HTMLButtonElement;
  private readonly addRowButton: HTMLButtonElement;
  private readonly addColumnButton: HTMLButtonElement;
  private readonly dropIndicator: HTMLDivElement;
  private readonly rowBand: HTMLDivElement;
  private readonly columnBand: HTMLDivElement;
  private readonly cellFill: HTMLDivElement;
  private readonly cellOutline: HTMLDivElement;
  private readonly cellHandle: HTMLButtonElement;
  private readonly hoverRowBand: HTMLDivElement;
  private readonly hoverColumnBand: HTMLDivElement;
  private readonly hoverCellFill: HTMLDivElement;
  private readonly hoverCellOutline: HTMLDivElement;
  private readonly contextMenu: HTMLDivElement;
  private readonly contextSubmenu: HTMLDivElement;
  private readonly menuAdapter: S1000DMenuAdapter;
  private pendingCellDrag:
    | {
        tablePos: number;
        anchorEntryPos: number;
        rowIndex: number;
        columnIndex: number;
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
  private readonly resizeController: S1000DResizeController;
  private axisDrag: S1000DAxisDragState | null = null;
  private extendTarget:
    | {
        tablePos: number;
        tgroupIndex: number;
        geometry: TableGeometry;
      }
    | null = null;
  private lastRenderState: S1000DOverlayRenderState | null = null;
  private suppressNextClick = false;
  private previousUserSelect: string | null = null;
  private previousWebkitUserSelect: string | null = null;
  private readonly onMouseMove = (event: MouseEvent) => this.handleMouseMove(event);
  private readonly onMouseLeave = (event: MouseEvent) => this.handleMouseLeave(event);
  private readonly onMouseDown = (event: MouseEvent) => this.handleMouseDown(event);
  private readonly onClickCapture = (event: MouseEvent) => this.handleClickCapture(event);
  private readonly onViewportChange = () => this.render();
  private readonly onDocumentAxisDragMove = (event: MouseEvent) => this.handleDocumentAxisDragMove(event);
  private readonly onDocumentAxisDragEnd = (event: MouseEvent) => this.handleDocumentAxisDragEnd(event);
  private readonly onDocumentMouseMove = (event: MouseEvent) => this.handleDocumentMouseMove(event);
  private readonly onDocumentMouseUp = (event: MouseEvent) => this.finishCellDrag(event);
  private readonly onDocumentPointerDown = (event: MouseEvent) => this.handleDocumentPointerDown(event);
  private readonly onDocumentKeyDown = (event: KeyboardEvent) => this.handleDocumentKeyDown(event);

  constructor(view: EditorView, options: S1000DTableOverlayPluginOptions) {
    this.view = view;
    this.options = options;
    this.root = view.dom.ownerDocument.createElement('div');
    this.root.className = 'html-table-overlay';
    this.root.dataset.s1000dTableOverlay = 'true';
    this.root.dataset.testid = 's1000d-overlay';
    this.root.hidden = true;

    this.overlayHost = new TableOverlayHost(this.root, {
      hostClassName: 'html-table-overlay-host',
      hostDataAttribute: 'data-s1000d-table-overlay-host',
      hostDataValue: 'true',
    });

    this.rowHandlesParent = createLayer(this.root.ownerDocument, 'html-table-overlay__rows');
    this.columnHandlesParent = createLayer(this.root.ownerDocument, 'html-table-overlay__columns');
    this.resizersParent = createLayer(this.root.ownerDocument, 'html-table-overlay__resizers');
    this.tableHandle = this.createTableHandle();
    this.contextTriggerButton = this.createContextTriggerButton();
    this.addRowButton = this.createExtendButton('row');
    this.addColumnButton = this.createExtendButton('column');
    this.dropIndicator = createBox(this.root.ownerDocument, 'html-table-overlay__drop-indicator');
    this.dropIndicator.dataset.testid = 's1000d-drop-indicator';
    this.dropIndicator.setAttribute('aria-hidden', 'true');
    this.rowBand = createBand(this.root.ownerDocument, 'html-table-overlay__selection-band html-table-overlay__selection-band--row');
    this.rowBand.dataset.testid = 's1000d-selection-row-band';
    this.columnBand = createBand(this.root.ownerDocument, 'html-table-overlay__selection-band html-table-overlay__selection-band--column');
    this.columnBand.dataset.testid = 's1000d-selection-column-band';
    this.cellFill = createBox(this.root.ownerDocument, 'html-table-overlay__cell-selection-fill');
    this.cellOutline = createBox(this.root.ownerDocument, 'html-table-overlay__cell-selection-outline');
    this.cellHandle = this.createCellHandle();
    this.cellFill.dataset.testid = 's1000d-selection-cell-fill';
    this.cellOutline.dataset.testid = 's1000d-selection-cell-outline';
    this.hoverRowBand = createBand(this.root.ownerDocument, 'html-table-overlay__selection-band html-table-overlay__selection-band--row');
    this.hoverRowBand.dataset.testid = 's1000d-hover-row-band';
    this.hoverRowBand.style.opacity = '0.7';
    this.hoverColumnBand = createBand(this.root.ownerDocument, 'html-table-overlay__selection-band html-table-overlay__selection-band--column');
    this.hoverColumnBand.dataset.testid = 's1000d-hover-column-band';
    this.hoverColumnBand.style.opacity = '0.7';
    this.hoverCellFill = createBox(this.root.ownerDocument, 'html-table-overlay__cell-selection-fill');
    this.hoverCellFill.dataset.testid = 's1000d-hover-cell-fill';
    this.hoverCellFill.style.opacity = '0.55';
    this.hoverCellOutline = createBox(this.root.ownerDocument, 'html-table-overlay__cell-selection-outline');
    this.hoverCellOutline.dataset.testid = 's1000d-hover-cell-outline';
    this.hoverCellOutline.style.opacity = '0.7';
    this.contextMenu = this.createContextMenu();
    this.contextSubmenu = this.createContextSubmenu();
    this.cellOutline.append(this.cellHandle);

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
      this.contextTriggerButton,
      this.addRowButton,
      this.addColumnButton,
      this.dropIndicator,
      this.rowHandlesParent,
      this.columnHandlesParent,
      this.resizersParent,
      this.contextMenu,
      this.contextSubmenu,
    );

    this.menuAdapter = new S1000DMenuAdapter(view, {
      root: this.root,
      cellHandle: this.cellHandle,
      contextMenu: this.contextMenu,
      contextSubmenu: this.contextSubmenu,
      contextMenuActionResolver: this.options.contextMenuActionResolver,
      onRender: () => this.render(),
    });
    this.resizeController = new S1000DResizeController(
      view,
      this.root.ownerDocument,
      () => this.render(),
      (meta) => this.syncInteractionMeta(meta),
    );

    this.view.dom.addEventListener('mousemove', this.onMouseMove);
    this.view.dom.addEventListener('mouseover', this.onMouseMove);
    this.view.dom.addEventListener('mouseleave', this.onMouseLeave);
    this.view.dom.addEventListener('mousedown', this.onMouseDown);
    this.view.dom.addEventListener('click', this.onClickCapture, true);
    this.root.ownerDocument.addEventListener('mousemove', this.onMouseMove);
    this.root.ownerDocument.addEventListener('mouseover', this.onMouseMove);
    this.root.ownerDocument.defaultView?.addEventListener('resize', this.onViewportChange);
    this.root.ownerDocument.addEventListener('scroll', this.onViewportChange, true);
    this.root.ownerDocument.addEventListener('mousedown', this.onDocumentPointerDown);
    this.root.ownerDocument.addEventListener('keydown', this.onDocumentKeyDown);
    this.render();
  }

  update(view: EditorView): void {
    this.view = view;
    this.menuAdapter.update(view);
    this.resizeController.update(view);
    this.render();
  }

  destroy(): void {
    this.resizeController.destroy();
    this.view.dom.removeEventListener('mousemove', this.onMouseMove);
    this.view.dom.removeEventListener('mouseover', this.onMouseMove);
    this.view.dom.removeEventListener('mouseleave', this.onMouseLeave);
    this.view.dom.removeEventListener('mousedown', this.onMouseDown);
    this.view.dom.removeEventListener('click', this.onClickCapture, true);
    this.root.ownerDocument.removeEventListener('mousemove', this.onMouseMove);
    this.root.ownerDocument.removeEventListener('mouseover', this.onMouseMove);
    this.root.ownerDocument.defaultView?.removeEventListener('resize', this.onViewportChange);
    this.root.ownerDocument.removeEventListener('scroll', this.onViewportChange, true);
    this.root.ownerDocument.removeEventListener('mousedown', this.onDocumentPointerDown);
    this.root.ownerDocument.removeEventListener('keydown', this.onDocumentKeyDown);
    this.stopCellDragListeners();
    this.restoreNativeSelectionSuppression();
    this.stopAxisDragListeners();
    this.cancelAxisDrag();
    this.menuAdapter.destroy();
    this.overlayHost.detach();
  }

  private render(): void {
    const interaction = getS1000DTableInteractionState(this.view.state);
    const context = this.getActiveContext(interaction);
    if (!context?.activeTgroup) {
      if (interaction.hovered || interaction.hoveredControl || interaction.geometry || interaction.resizing) {
        this.syncInteractionMeta({
          hovered: null,
          hoveredControl: null,
          hoveredTgroupIndex: null,
          geometry: null,
          resizing: null,
        });
      }
      this.detach();
      return;
    }

    const geometry = measureS1000DRenderedTableGeometry(context.dom, context.wrapper, context.activeTgroupIndex);
    this.syncInteractionGeometry(context, geometry);
    const overlayHost = this.overlayHost.attach(getTableOverlayMount(this.view));
    const hostRect = overlayHost.getBoundingClientRect();
    const positionState = getTableOverlayPositionState(
      geometry,
      hostRect,
      MIN_HANDLE_INSET,
      ROW_HANDLE_OFFSET,
      COLUMN_HANDLE_OFFSET,
    );
    this.lastRenderState = {
      geometry,
      hostRect,
      positionState,
      tablePos: context.tablePos,
    };
    this.extendTarget = {
      tablePos: context.tablePos,
      tgroupIndex: context.activeTgroupIndex,
      geometry,
    };
    const selectionInfo =
      getS1000DSelectionInfo(this.view.state, { tablePos: context.tablePos })
      ?? getS1000DSelectionInfo(this.view.state);
    const tableSelection = isTableSelectionForContext(this.view, context.tablePos);
    const explicitAxisSelection =
      Boolean(interaction.selectedAxisExplicit)
      && interaction.selectedAxis.tablePos === context.tablePos;
    const rowSelection =
      explicitAxisSelection
      && interaction.selectedAxis.kind === 'row'
      && isSingleRowSelection(this.view.state.selection, selectionInfo);
    const columnSelection =
      explicitAxisSelection
      && interaction.selectedAxis.kind === 'column'
      && isSingleColumnSelection(this.view.state.selection, selectionInfo);

    this.root.classList.toggle(
      'html-table-overlay--dragging',
      Boolean(this.activeCellDrag || this.pendingCellDrag || this.axisDrag?.hasDragged),
    );
    this.root.classList.toggle('html-table-overlay--resizing', Boolean(interaction.resizing));

    this.renderSelection(interaction, geometry, positionState, selectionInfo, rowSelection, columnSelection);
    this.renderHoverFeedback(interaction, context, geometry, positionState, selectionInfo);
    this.renderTableHandle(interaction, context, positionState, tableSelection);
    this.renderRowHandles(interaction, context, geometry, positionState, selectionInfo, rowSelection);
    this.renderColumnHandles(interaction, context, geometry, positionState, selectionInfo, columnSelection);
    this.renderDropIndicator(geometry, positionState);
    this.renderResizeHandles(interaction, context, geometry, positionState);
    this.renderExtendButtons(interaction, positionState);
    this.renderContextTrigger(interaction, hostRect);
    this.menuAdapter.render(interaction, overlayHost.getBoundingClientRect(), { geometry });

    this.root.hidden = false;
  }

  private renderSelection(
    interaction: ReturnType<typeof getS1000DTableInteractionState>,
    geometry: TableGeometry,
    positionState: TableOverlayPositionState,
    selectionInfo: ReturnType<typeof getS1000DSelectionInfo> | undefined,
    rowSelection: boolean,
    columnSelection: boolean,
  ): void {
    const suppressSelectionControls = Boolean(interaction.resizing || this.axisDrag?.hasDragged);
    const hasCellSelection = isS1000DCellSelection(this.view.state.selection);
    this.rowBand.hidden = true;
    this.columnBand.hidden = true;
    this.cellFill.hidden = true;
    this.cellOutline.hidden = true;
    this.cellHandle.hidden = true;
    this.cellHandle.classList.toggle('is-menu-open', interaction.contextMenuOpen && interaction.menuScope === 'cell');
    this.cellHandle.classList.remove('is-selected');
    this.hoverRowBand.hidden = true;
    this.hoverColumnBand.hidden = true;
    this.hoverCellFill.hidden = true;
    this.hoverCellOutline.hidden = true;
    this.root.dataset.selectionScope = 'none';

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
      this.root.dataset.selectionScope = 'row';
      applyRect(this.rowBand, rect);
      this.rowBand.hidden = false;
    }

    if (columnSelection) {
      this.root.dataset.selectionScope = 'column';
      applyRect(this.columnBand, rect);
      this.columnBand.hidden = false;
    }

    const tableSelection = isTableSelectionForContext(this.view, selectionInfo.tablePos);
    if (tableSelection) {
      return;
    }

    const hideCursorCellHandle = !hasCellSelection
      && interaction.hovered?.tablePos === selectionInfo.tablePos
      && (
        interaction.hoveredControl !== 'cell'
        || interaction.hovered.rowIndex !== selectionInfo.top
        || interaction.hovered.columnIndex !== selectionInfo.left
      );

    if (!rowSelection && !columnSelection) {
      this.root.dataset.selectionScope = 'cell';
    }

    applyRect(this.cellOutline, rect);
    applyRect(this.cellFill, rect);

    this.cellFill.hidden = false;
    this.cellOutline.hidden = false;
    this.cellHandle.hidden = suppressSelectionControls || rowSelection || columnSelection || hideCursorCellHandle;
    this.cellHandle.classList.toggle('is-selected', hasCellSelection);
    this.cellHandle.setAttribute('aria-label', 'Cell actions');
    this.cellHandle.title = 'Cell actions';
  }

  private renderHoverFeedback(
    interaction: ReturnType<typeof getS1000DTableInteractionState>,
    context: S1000DTableDOMContext,
    geometry: TableGeometry,
    positionState: TableOverlayPositionState,
    selectionInfo: ReturnType<typeof getS1000DSelectionInfo> | undefined,
  ): void {
    this.hoverRowBand.hidden = true;
    this.hoverColumnBand.hidden = true;
    this.hoverCellFill.hidden = true;
    this.hoverCellOutline.hidden = true;

    if (interaction.hovered?.tablePos !== context.tablePos) {
      return;
    }

    if (interaction.hoveredControl === 'row-handle' && interaction.hovered.rowIndex !== null) {
      const rect = getVisibleContentRowRect(geometry, positionState, interaction.hovered.rowIndex);
      if (rect) {
        applyRect(this.hoverRowBand, rect);
        this.hoverRowBand.hidden = false;
      }
      return;
    }

    if (interaction.hoveredControl === 'column-handle' && interaction.hovered.columnIndex !== null) {
      const rect = getVisibleContentColumnRect(geometry, positionState, interaction.hovered.columnIndex);
      if (rect) {
        applyRect(this.hoverColumnBand, rect);
        this.hoverColumnBand.hidden = false;
      }
      return;
    }

    if (interaction.hoveredControl === 'cell' && interaction.hovered.rowIndex !== null && interaction.hovered.columnIndex !== null) {
      const rect = getVisibleCellRect(geometry, positionState, interaction.hovered.rowIndex, interaction.hovered.columnIndex);
      if (rect) {
        applyRect(this.hoverCellFill, rect);
        applyRect(this.hoverCellOutline, rect);
        this.hoverCellFill.hidden = false;
        this.hoverCellOutline.hidden = false;
        return;
      }
    }

    if (interaction.hoveredControl === 'cell' && selectionInfo) {
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
    interaction: ReturnType<typeof getS1000DTableInteractionState>,
    context: S1000DTableDOMContext,
    positionState: TableOverlayPositionState,
    tableSelection: boolean,
  ): void {
    void interaction;
    void context;
    void positionState;
    void tableSelection;

    this.tableHandle.hidden = true;
    this.tableHandle.tabIndex = -1;
    this.tableHandle.dataset.tablePos = String(context.tablePos);
    this.tableHandle.removeAttribute('aria-haspopup');
    this.tableHandle.removeAttribute('aria-controls');
    this.tableHandle.setAttribute('aria-label', 'Select table');
    this.tableHandle.title = 'Select table';
    this.tableHandle.classList.remove('is-selected');
    this.tableHandle.classList.remove('is-hovered');
    this.tableHandle.classList.remove('is-menu-open');
    this.tableHandle.setAttribute('aria-expanded', 'false');
  }

  private renderRowHandles(
    interaction: ReturnType<typeof getS1000DTableInteractionState>,
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
      const isHovered = isAxisHandleHovered(interaction, 'row', context.tablePos, row.index);
      const isSelected = isAxisHandleSelected(interaction, 'row', context.tablePos, row.index, context.activeTgroupIndex)
        || Boolean(rowSelection && selectionInfo && row.index >= selectionInfo.top && row.index <= selectionInfo.bottom);
      const isMenuOpen = isAxisHandleSelected(interaction, 'row', context.tablePos, row.index, context.activeTgroupIndex)
        && interaction.contextMenuOpen
        && interaction.menuScope === 'row';
      const isVisible = interaction.contextMenuOpen
        ? isSelected
        : this.isAxisHandleVisible(interaction, 'row', context.tablePos, row.index, context.activeTgroupIndex);
      handle.hidden = !rect || !isVisible;
      handle.tabIndex = handle.hidden ? -1 : 0;
      handle.dataset.tablePos = String(context.tablePos);
      handle.dataset.tgroupIndex = String(context.activeTgroupIndex);
      handle.dataset.rowIndex = String(row.index);
      handle.setAttribute('aria-label', `Row ${row.index + 1} actions`);
      handle.setAttribute('aria-haspopup', 'menu');
      handle.setAttribute('aria-expanded', isMenuOpen ? 'true' : 'false');
      if (isMenuOpen) {
        handle.setAttribute('aria-controls', this.contextMenu.id);
      } else {
        handle.removeAttribute('aria-controls');
      }
      handle.classList.toggle('is-hovered', isHovered);
      handle.classList.toggle('is-selected', isSelected);
      handle.classList.toggle('is-menu-open', isMenuOpen);

      if (!rect) {
        continue;
      }

      Object.assign(handle.style, {
        left: `${positionState.rowHandleLeft}px`,
        top: `${rect.top + rect.height / 2}px`,
        width: `${HANDLE_SIZE}px`,
        height: `${Math.max(HANDLE_SIZE, rect.height)}px`,
      });
    }
  }

  private renderColumnHandles(
    interaction: ReturnType<typeof getS1000DTableInteractionState>,
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
      const isHovered = isAxisHandleHovered(interaction, 'column', context.tablePos, column.index);
      const isSelected = isAxisHandleSelected(interaction, 'column', context.tablePos, column.index, context.activeTgroupIndex)
        || Boolean(columnSelection && selectionInfo && column.index >= selectionInfo.left && column.index <= selectionInfo.right);
      const isMenuOpen = isAxisHandleSelected(interaction, 'column', context.tablePos, column.index, context.activeTgroupIndex)
        && interaction.contextMenuOpen
        && interaction.menuScope === 'column';
      const isVisible = interaction.contextMenuOpen
        ? isSelected
        : this.isAxisHandleVisible(interaction, 'column', context.tablePos, column.index, context.activeTgroupIndex);
      handle.hidden = !rect || !isVisible;
      handle.tabIndex = handle.hidden ? -1 : 0;
      handle.dataset.tablePos = String(context.tablePos);
      handle.dataset.tgroupIndex = String(context.activeTgroupIndex);
      handle.dataset.columnIndex = String(column.index);
      handle.setAttribute('aria-label', `Column ${column.index + 1} actions`);
      handle.setAttribute('aria-haspopup', 'menu');
      handle.setAttribute('aria-expanded', isMenuOpen ? 'true' : 'false');
      if (isMenuOpen) {
        handle.setAttribute('aria-controls', this.contextMenu.id);
      } else {
        handle.removeAttribute('aria-controls');
      }
      handle.classList.toggle('is-hovered', isHovered);
      handle.classList.toggle('is-selected', isSelected);
      handle.classList.toggle('is-menu-open', isMenuOpen);

      if (!rect) {
        continue;
      }

      Object.assign(handle.style, {
        left: `${rect.left + rect.width / 2}px`,
        top: `${positionState.columnHandleTop}px`,
        width: `${Math.max(HANDLE_SIZE, rect.width)}px`,
        height: `${HANDLE_SIZE}px`,
      });
    }
  }

  private renderDropIndicator(
    geometry: TableGeometry,
    positionState: TableOverlayPositionState,
  ): void {
    const dragState = this.axisDrag;
    if (!dragState?.hasDragged || dragState.targetIndex === null) {
      this.dropIndicator.hidden = true;
      this.dropIndicator.className = 'html-table-overlay__drop-indicator';
      return;
    }

    if (dragState.axis === 'row') {
      const row = geometry.rows[dragState.targetIndex];
      if (!row) {
        this.dropIndicator.hidden = true;
        return;
      }

      this.dropIndicator.hidden = false;
      this.dropIndicator.className = `html-table-overlay__drop-indicator html-table-overlay__drop-indicator--row${dragState.isValidTarget ? '' : ' html-table-overlay__drop-indicator--invalid'}`;
      Object.assign(this.dropIndicator.style, {
        left: `${positionState.visibleTableLeft}px`,
        top: `${positionState.tableTop + row.top + row.height / 2}px`,
        width: `${positionState.visibleTableWidth}px`,
        height: '',
      });
      return;
    }

    const column = geometry.columns[dragState.targetIndex];
    if (!column) {
      this.dropIndicator.hidden = true;
      return;
    }

    this.dropIndicator.hidden = false;
    this.dropIndicator.className = `html-table-overlay__drop-indicator html-table-overlay__drop-indicator--column${dragState.isValidTarget ? '' : ' html-table-overlay__drop-indicator--invalid'}`;
    Object.assign(this.dropIndicator.style, {
      left: `${positionState.tableLeft + column.left + column.width / 2}px`,
      top: `${positionState.visibleTableTop}px`,
      width: '',
      height: `${positionState.visibleTableHeight}px`,
    });
  }

  private renderExtendButtons(
    interaction: ReturnType<typeof getS1000DTableInteractionState>,
    positionState: TableOverlayPositionState,
  ): void {
    const target = this.extendTarget;
    const hidden = this.shouldHideExtendButtons(interaction) || !target;

    this.addRowButton.hidden = hidden;
    this.addColumnButton.hidden = hidden;
    this.addRowButton.tabIndex = hidden ? -1 : 0;
    this.addColumnButton.tabIndex = hidden ? -1 : 0;

    if (!target) {
      return;
    }

    this.addRowButton.dataset.tablePos = String(target.tablePos);
    this.addRowButton.dataset.tgroupIndex = String(target.tgroupIndex);
    this.addColumnButton.dataset.tablePos = String(target.tablePos);
    this.addColumnButton.dataset.tgroupIndex = String(target.tgroupIndex);

    Object.assign(this.addRowButton.style, {
      left: `${positionState.visibleTableLeft + positionState.visibleTableWidth / 2}px`,
      top: `${positionState.visibleTableTop + positionState.visibleTableHeight + EXTEND_BUTTON_OFFSET}px`,
      width: `${positionState.visibleTableWidth}px`,
      height: '12px',
    });
    Object.assign(this.addColumnButton.style, {
      left: `${positionState.visibleTableLeft + positionState.visibleTableWidth + EXTEND_BUTTON_OFFSET}px`,
      top: `${positionState.visibleTableTop + positionState.visibleTableHeight / 2}px`,
      width: '12px',
      height: `${positionState.visibleTableHeight}px`,
    });
  }

  private renderContextTrigger(
    interaction: ReturnType<typeof getS1000DTableInteractionState>,
    hostRect: DOMRect,
  ): void {
    const trigger = getS1000DContextTriggerButtonState(this.view.state, interaction, {
      actionResolver: this.options.contextMenuActionResolver,
      view: this.view,
    });
    const hasDedicatedScopeHandle =
      trigger.scope === 'table'
      || trigger.scope === 'row'
      || trigger.scope === 'column'
      || trigger.scope === 'cell';
    const visible = trigger.visible && !hasDedicatedScopeHandle && !this.shouldHideExtendButtons(interaction);

    this.contextTriggerButton.hidden = !visible;
    this.contextTriggerButton.tabIndex = visible ? 0 : -1;
    this.contextTriggerButton.dataset.scope = trigger.scope ?? '';
    this.contextTriggerButton.setAttribute('aria-expanded', trigger.expanded ? 'true' : 'false');
    this.contextTriggerButton.setAttribute('aria-label', trigger.label ?? 'Context actions');
    this.contextTriggerButton.title = trigger.title ?? trigger.label ?? '';

    if (trigger.expanded) {
      this.contextTriggerButton.setAttribute('aria-controls', this.contextMenu.id);
    } else {
      this.contextTriggerButton.removeAttribute('aria-controls');
    }

    if (!visible || !trigger.anchor) {
      this.contextTriggerButton.style.removeProperty('left');
      this.contextTriggerButton.style.removeProperty('top');
      return;
    }

    this.contextTriggerButton.style.left = `${Math.max(MIN_HANDLE_INSET, trigger.anchor.left - hostRect.left)}px`;
    this.contextTriggerButton.style.top = `${Math.max(MIN_HANDLE_INSET, trigger.anchor.top - hostRect.top)}px`;
  }

  private renderResizeHandles(
    interaction: ReturnType<typeof getS1000DTableInteractionState>,
    context: S1000DTableDOMContext,
    geometry: TableGeometry,
    positionState: TableOverlayPositionState,
  ): void {
    this.resizeController.renderHandles(
      this.resizersParent,
      interaction,
      context,
      geometry,
      positionState,
      Boolean(this.axisDrag?.hasDragged),
      () => this.createResizeHandle(),
    );
  }

  private handleDocumentPointerDown(event: MouseEvent): void {
    this.menuAdapter.handleDocumentPointerDown(event);
  }

  private handleDocumentKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.axisDrag) {
      event.preventDefault();
      event.stopPropagation();
      this.cancelAxisDrag();
      this.render();
      return;
    }

    this.menuAdapter.handleDocumentKeyDown(event);
  }

  private closeContextMenu(restoreFocus: boolean): void {
    this.menuAdapter.closeContextMenu(restoreFocus);
  }

  private createTableHandle(): HTMLButtonElement {
    const handle = this.root.ownerDocument.createElement('button');
    handle.type = 'button';
    handle.tabIndex = -1;
    handle.className = 'html-table-overlay__handle html-table-overlay__handle--table';
    handle.dataset.testid = 's1000d-table-handle';
    handle.setAttribute('aria-label', 'Select table');
    handle.addEventListener('mousedown', (event) => this.handleTableMouseDown(event));
    handle.addEventListener('click', (event) => this.handleTableClick(event));
    handle.addEventListener('mouseenter', () => this.handleTableHover(handle));
    handle.addEventListener('mouseleave', (event) => this.handleAxisLeave(event));
    return handle;
  }

  private createAxisHandle(axis: 'row' | 'column'): HTMLButtonElement {
    const handle = this.root.ownerDocument.createElement('button');
    handle.type = 'button';
    handle.tabIndex = -1;
    handle.className = `html-table-overlay__handle html-table-overlay__handle--${axis}`;
    handle.dataset.testid = axis === 'row' ? 's1000d-row-handle' : 's1000d-column-handle';
    handle.addEventListener('mousedown', (event) => this.handleAxisMouseDown(event, axis));
    handle.addEventListener('click', (event) => this.handleAxisClick(event, axis));
    handle.addEventListener('mouseenter', () => this.handleAxisHover(handle, axis));
    handle.addEventListener('mouseleave', (event) => this.handleAxisLeave(event));
    return handle;
  }

  private createContextTriggerButton(): HTMLButtonElement {
    const button = this.root.ownerDocument.createElement('button');
    button.type = 'button';
    button.tabIndex = -1;
    button.hidden = true;
    button.className = 'html-table-overlay__context-trigger';
    button.dataset.testid = 's1000d-context-trigger';
    button.textContent = '...';
    button.setAttribute('aria-label', 'Context actions');
    button.setAttribute('aria-haspopup', 'menu');
    button.addEventListener('mousedown', (event) => this.handleContextTriggerMouseDown(event));
    button.addEventListener('click', (event) => this.handleContextTriggerClick(event));
    return button;
  }

  private createExtendButton(axis: 'row' | 'column'): HTMLButtonElement {
    const button = this.root.ownerDocument.createElement('button');
    button.type = 'button';
    button.tabIndex = -1;
    button.hidden = true;
    button.className = `html-table-overlay__extend-button html-table-overlay__extend-button--${axis}`;
    button.dataset.axis = axis;
    button.dataset.testid = axis === 'row' ? 's1000d-extend-row' : 's1000d-extend-column';
    button.textContent = '+';
    button.setAttribute('aria-label', axis === 'row' ? 'Add row after' : 'Add column after');
    button.title = axis === 'row' ? 'Add row after' : 'Add column after';
    button.addEventListener('mousedown', (event) => this.handleExtendButtonMouseDown(event));
    button.addEventListener('click', (event) => this.handleExtendButtonClick(event));
    return button;
  }

  private createResizeHandle(): HTMLButtonElement {
    const handle = this.root.ownerDocument.createElement('button');
    handle.type = 'button';
    handle.tabIndex = -1;
    handle.className = 'html-table-overlay__resize-handle';
    handle.dataset.testid = 's1000d-resize-handle';
    handle.addEventListener('mousedown', (event) => this.resizeController.handleResizeStart(event));
    return handle;
  }

  private createCellHandle(): HTMLButtonElement {
    const handle = this.root.ownerDocument.createElement('button');
    handle.type = 'button';
    handle.className = 'html-table-overlay__cell-selection-handle';
    handle.dataset.testid = 's1000d-cell-handle';
    handle.tabIndex = -1;
    handle.hidden = true;
    handle.addEventListener('mousedown', (event) => this.handleCellHandleMouseDown(event));
    handle.addEventListener('click', (event) => this.handleCellHandleClick(event));
    return handle;
  }

  private createContextMenu(): HTMLDivElement {
    return createTableContextMenuElement(this.root.ownerDocument, {
      className: 'html-table-overlay__context-menu',
      id: 's1000d-context-menu',
      testId: 'selection-menu',
      zIndex: 6,
    });
  }

  private createContextSubmenu(): HTMLDivElement {
    return createTableContextMenuElement(this.root.ownerDocument, {
      className: 'html-table-overlay__context-menu html-table-overlay__context-menu--submenu',
      id: 's1000d-context-submenu',
      testId: 'selection-submenu',
      zIndex: 7,
    });
  }

  private handleAxisMouseDown(event: MouseEvent, axis: 'row' | 'column'): void {
    const handle = event.currentTarget as HTMLButtonElement | null;
    const tablePos = Number(handle?.dataset.tablePos);
    const preferredTgroupIndex = Number(handle?.dataset.tgroupIndex);
    const axisIndex = Number(handle?.dataset[axis === 'row' ? 'rowIndex' : 'columnIndex']);
    const context = Number.isInteger(tablePos)
      ? getRenderedS1000DTableContext(this.view, tablePos, {
        preferredTgroupIndex: Number.isInteger(preferredTgroupIndex) ? preferredTgroupIndex : null,
      })
      : undefined;

    if (
      !handle
      || !context?.activeTgroup
      || !Number.isInteger(axisIndex)
      || event.button !== 0
      || getS1000DTableInteractionState(this.view.state).resizing?.tablePos === tablePos
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.axisDrag = {
      axis,
      handle,
      hasDragged: false,
      index: axisIndex,
      isValidTarget: false,
      startX: event.clientX,
      startY: event.clientY,
      tablePos,
      tgroupIndex: context.activeTgroupIndex,
      targetIndex: null,
    };
    this.startAxisDragListeners();
  }

  private handleTableMouseDown(event: MouseEvent): void {
    const handle = event.currentTarget as HTMLButtonElement | null;
    const tablePos = Number(handle?.dataset.tablePos);
    if (
      !handle
      || !Number.isInteger(tablePos)
      || event.button !== 0
      || getS1000DTableInteractionState(this.view.state).resizing?.tablePos === tablePos
    ) {
      return;
    }

    const context = getRenderedS1000DTableContext(this.view, tablePos);
    if (!context) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.activateTableHandle(context.tablePos, handle);
  }

  private handleTableClick(event: MouseEvent): void {
    if (!isKeyboardClick(event)) {
      return;
    }

    const handle = event.currentTarget as HTMLButtonElement | null;
    const tablePos = Number(handle?.dataset.tablePos);
    if (!handle || !Number.isInteger(tablePos)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.activateTableHandle(tablePos, handle);
  }

  private handleAxisClick(event: MouseEvent, axis: 'row' | 'column'): void {
    if (!isKeyboardClick(event)) {
      return;
    }

    const handle = event.currentTarget as HTMLButtonElement | null;
    const tablePos = Number(handle?.dataset.tablePos);
    const axisIndex = Number(handle?.dataset[axis === 'row' ? 'rowIndex' : 'columnIndex']);
    if (!handle || !Number.isInteger(tablePos) || !Number.isInteger(axisIndex)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.activateAxisHandle(axis, tablePos, axisIndex, handle);
  }

  private handleContextTriggerMouseDown(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.toggleContextTriggerMenu();
  }

  private handleContextTriggerClick(event: MouseEvent): void {
    if (!isKeyboardClick(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.toggleContextTriggerMenu();
  }

  private handleExtendButtonMouseDown(event: MouseEvent): void {
    const button = event.currentTarget as HTMLButtonElement | null;
    const axis = button?.dataset.axis;
    if (
      !button
      || (axis !== 'row' && axis !== 'column')
      || !this.extendTarget
      || getS1000DTableInteractionState(this.view.state).resizing?.tablePos === this.extendTarget.tablePos
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.activateExtendButton(axis);
  }

  private handleExtendButtonClick(event: MouseEvent): void {
    if (!isKeyboardClick(event)) {
      return;
    }

    const button = event.currentTarget as HTMLButtonElement | null;
    const axis = button?.dataset.axis;
    if (!button || (axis !== 'row' && axis !== 'column')) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.activateExtendButton(axis);
  }

  private handleTableHover(handle: HTMLButtonElement): void {
    const tablePos = Number(handle.dataset.tablePos);
    if (!Number.isInteger(tablePos)) {
      return;
    }

    const context = handle ? this.getContextFromDataset(handle) : getRenderedS1000DTableContext(this.view, tablePos);
    if (!context) {
      return;
    }

    this.syncHoverState(
      context,
      {
        kind: 'table',
        tablePos,
        rowIndex: null,
        columnIndex: null,
      },
      'table-handle',
    );
  }

  private handleAxisHover(handle: HTMLButtonElement, axis: 'row' | 'column'): void {
    const tablePos = Number(handle.dataset.tablePos);
    const axisIndex = Number(handle.dataset[axis === 'row' ? 'rowIndex' : 'columnIndex']);
    if (!Number.isInteger(tablePos) || !Number.isInteger(axisIndex)) {
      return;
    }

    const context = handle ? this.getContextFromDataset(handle) : getRenderedS1000DTableContext(this.view, tablePos);
    if (!context) {
      return;
    }

    this.syncHoverState(
      context,
      {
        kind: 'table',
        tablePos,
        rowIndex: axis === 'row' ? axisIndex : null,
        columnIndex: axis === 'column' ? axisIndex : null,
      },
      axis === 'row' ? 'row-handle' : 'column-handle',
    );
  }

  private handleAxisLeave(event: MouseEvent): void {
    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Element && relatedTarget.closest(OVERLAY_SELECTOR)) {
      return;
    }

    this.clearHoverState();
  }

  private startAxisDragListeners(): void {
    const ownerDocument = this.root.ownerDocument;
    ownerDocument.addEventListener('mousemove', this.onDocumentAxisDragMove);
    ownerDocument.addEventListener('mouseup', this.onDocumentAxisDragEnd, true);
  }

  private stopAxisDragListeners(): void {
    const ownerDocument = this.root.ownerDocument;
    ownerDocument.removeEventListener('mousemove', this.onDocumentAxisDragMove);
    ownerDocument.removeEventListener('mouseup', this.onDocumentAxisDragEnd, true);
  }

  private handleDocumentAxisDragMove(event: MouseEvent): void {
    const dragState = this.axisDrag;
    if (!dragState) {
      return;
    }

    const dragDistance = Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY);
    if (!dragState.hasDragged) {
      if (dragDistance < AXIS_DRAG_THRESHOLD) {
        return;
      }

      dragState.hasDragged = true;
      dragState.handle.classList.add('is-dragging');
      this.root.ownerDocument.body.style.userSelect = 'none';
      this.closeContextMenu(false);
    }

    event.preventDefault();
    this.updateAxisDragTarget(event.clientX, event.clientY);
    this.render();
  }

  private handleDocumentAxisDragEnd(event: MouseEvent): void {
    const dragState = this.axisDrag;
    if (!dragState) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (dragState.hasDragged) {
      this.finishAxisDrag(dragState);
      return;
    }

    this.cancelAxisDrag();
    this.activateAxisHandle(dragState.axis, dragState.tablePos, dragState.index, dragState.handle);
  }

  private updateAxisDragTarget(clientX: number, clientY: number): void {
    const dragState = this.axisDrag;
    const renderState = this.lastRenderState;
    if (!dragState || !renderState || renderState.tablePos !== dragState.tablePos) {
      return;
    }

    const targetIndex = this.findClosestAxisIndex(dragState.axis, clientX, clientY, renderState.hostRect);
    dragState.targetIndex = targetIndex;
    dragState.isValidTarget = this.canDropAxisAtIndex(dragState, targetIndex);
  }

  private findClosestAxisIndex(
    axis: 'row' | 'column',
    clientX: number,
    clientY: number,
    hostRect: DOMRect,
  ): number | null {
    const handlesParent = axis === 'row' ? this.rowHandlesParent : this.columnHandlesParent;
    const pointerCoordinate = axis === 'row' ? clientY - hostRect.top : clientX - hostRect.left;
    let bestIndex: number | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const child of Array.from(handlesParent.children)) {
      const handle = child as HTMLButtonElement;
      const index = Number(handle.dataset[axis === 'row' ? 'rowIndex' : 'columnIndex']);
      const center = Number(
        axis === 'row'
          ? handle.style.top.replace('px', '')
          : handle.style.left.replace('px', ''),
      );
      if (!Number.isInteger(index) || Number.isNaN(center)) {
        continue;
      }

      const distance = Math.abs(center - pointerCoordinate);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }

    return bestIndex;
  }

  private canDropAxisAtIndex(
    dragState: S1000DAxisDragState,
    targetIndex: number | null,
  ): boolean {
    if (targetIndex === null || targetIndex === dragState.index) {
      return false;
    }

    return this.simulateAxisReorder(
      dragState.axis,
      dragState.tablePos,
      dragState.tgroupIndex,
      dragState.index,
      targetIndex,
      false,
    );
  }

  private finishAxisDrag(dragState: S1000DAxisDragState): void {
    const targetIndex = dragState.targetIndex;
    if (targetIndex === null) {
      this.cancelAxisDrag();
      return;
    }

    this.simulateAxisReorder(
      dragState.axis,
      dragState.tablePos,
      dragState.tgroupIndex,
      dragState.index,
      targetIndex,
      true,
    );
    this.cancelAxisDrag();
    this.render();
  }

  private cancelAxisDrag(): void {
    if (this.axisDrag?.handle) {
      this.axisDrag.handle.classList.remove('is-dragging');
    }

    this.stopAxisDragListeners();
    this.axisDrag = null;
    this.dropIndicator.hidden = true;
    this.dropIndicator.className = 'html-table-overlay__drop-indicator';
    this.root.ownerDocument.body.style.removeProperty('user-select');
  }

  private activateAxisHandle(
    axis: 'row' | 'column',
    tablePos: number,
    axisIndex: number,
    handle: HTMLButtonElement | null,
  ): void {
    const interaction = getS1000DTableInteractionState(this.view.state);
    if (shouldToggleContextMenuFromAxisHandle(
      interaction,
      axis,
      axisIndex,
      tablePos,
      handle ? Number(handle.dataset.tgroupIndex) : null,
    )) {
      this.toggleContextMenuFromControl(axis, handle);
      return;
    }

      const context = handle ? this.getContextFromDataset(handle) : getRenderedS1000DTableContext(this.view, tablePos);
      const transaction = context ? this.createAxisSelectionTransaction(context, axis, axisIndex) : null;
    if (!transaction) {
      return;
    }

    this.view.dispatch(transaction.scrollIntoView());
    this.view.focus();
    this.openContextMenuFromControl(axis, handle);
  }

  private activateTableHandle(
    tablePos: number,
    handle: HTMLButtonElement | null,
  ): void {
    this.view.dispatch(this.view.state.tr.setSelection(NodeSelection.create(this.view.state.doc, tablePos)).scrollIntoView());
    this.view.focus();
    void handle;
  }

  private toggleContextTriggerMenu(): void {
    const interaction = getS1000DTableInteractionState(this.view.state);
    const menu = getS1000DContextMenuState(this.view.state, interaction, {
      actionResolver: this.options.contextMenuActionResolver,
      view: this.view,
    });
    if (!canToggleTableContextTriggerMenu(Boolean(menu.scope), {
      blockedByResize: interaction.resizing?.tablePos === interaction.activeTable?.tablePos,
    })) {
      if (interaction.resizing?.tablePos === interaction.activeTable?.tablePos) {
        this.view.focus();
      }
      return;
    }

    this.toggleContextMenuFromControl(menu.scope ?? 'cell', this.contextTriggerButton);
  }

  private toggleContextMenuFromControl(
    scope: 'table' | 'row' | 'column' | 'cell',
    focusTarget: HTMLButtonElement | null,
  ): void {
    const interaction = getS1000DTableInteractionState(this.view.state);
    if (getScopedTableMenuToggleAction(interaction.contextMenuOpen, interaction.menuScope ?? null, scope) === 'close') {
      this.closeContextMenu(Boolean(focusTarget));
      return;
    }

    this.openContextMenuFromControl(scope, focusTarget);
  }

  private openContextMenuFromControl(
    scope: 'table' | 'row' | 'column' | 'cell',
    focusTarget: HTMLButtonElement | null,
  ): void {
    const anchor = getTableMenuAnchorForElement(focusTarget);
    if (!anchor) {
      return;
    }

    this.menuAdapter.prepareOpen();
    openS1000DTableContextMenu(this.view, {
      scope,
      anchor,
    });
    this.view.focus();
  }

  private activateExtendButton(axis: 'row' | 'column'): void {
    const target = this.extendTarget;
    if (!target) {
      return;
    }

    const context = getRenderedS1000DTableContext(this.view, target.tablePos, {
      preferredTgroupIndex: target.tgroupIndex,
    });
    if (!context?.activeTgroup) {
      return;
    }

    const baseIndex = axis === 'row'
      ? getExtendRowIndex(context.activeTgroup, context.activeTgroupIndex)
      : Math.max(0, target.geometry.columns.length - 1);
    const selectionTransaction = this.createAxisSelectionTransaction(context, axis, baseIndex);
    if (!selectionTransaction) {
      return;
    }

    this.view.dispatch(selectionTransaction.scrollIntoView());
    this.view.focus();

    const applied = (
      axis === 'row'
        ? addS1000DRowAfter({ tablePos: target.tablePos })
        : addS1000DColumnAfter({ tablePos: target.tablePos })
    )(this.view.state, this.view.dispatch);
    if (!applied) {
      return;
    }

    const nextContext = getRenderedS1000DTableContext(this.view, target.tablePos, {
      preferredTgroupIndex: target.tgroupIndex,
    });
    const nextSelection = nextContext
      ? this.createAxisSelectionTransaction(
          nextContext,
          axis,
          axis === 'row' ? baseIndex + 1 : target.geometry.columns.length,
        )
      : null;
    if (nextSelection) {
      this.view.dispatch(nextSelection.scrollIntoView());
      this.view.focus();
    }
  }

  private handleCellHandleMouseDown(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.openCellHandleMenu();
  }

  private handleCellHandleClick(event: MouseEvent): void {
    if (event.detail !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.openCellHandleMenu();
  }

  private openCellHandleMenu(): void {
    const context = this.getActiveContext();
    if (!context?.activeTgroup) {
      return;
    }

    const selectionInfo = getS1000DSelectionInfo(this.view.state, { tablePos: context.tablePos })
      ?? getS1000DSelectionInfo(this.view.state);
    if (!selectionInfo && !isWholeS1000DTableSelection(this.view.state, { tablePos: context.tablePos })) {
      return;
    }

    this.menuAdapter.prepareOpen();
    const anchor = getTableMenuAnchorForElement(this.cellHandle);
    if (!anchor) {
      return;
    }
    openS1000DTableContextMenu(this.view, {
      scope: 'cell',
      anchor,
    });
    this.view.focus();
  }

  private handleMouseMove(event: MouseEvent): void {
    if (this.activeCellDrag || this.pendingCellDrag || this.axisDrag) {
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

    const hoveredResizeHandle = eventElement?.closest('[data-testid="s1000d-resize-handle"]') as HTMLButtonElement | null;
    if (hoveredResizeHandle) {
      this.handleAxisHover(hoveredResizeHandle, 'column');
      return;
    }

    const hoveredTableHandle = eventElement?.closest('[data-testid="s1000d-table-handle"]') as HTMLButtonElement | null;
    if (hoveredTableHandle) {
      this.handleTableHover(hoveredTableHandle);
      return;
    }

    const hoveredCellHandle = eventElement?.closest('[data-testid="s1000d-cell-handle"]') as HTMLButtonElement | null;
    if (hoveredCellHandle) {
      return;
    }

    const domContext = findS1000DTableAtDOM(this.view, eventElement ?? event.target);
    const activeContext = this.getActiveContext();
    const hovered = domContext ?? (
      activeContext && hitTestRenderedTablePoint(activeContext, event.clientX, event.clientY)
        ? activeContext
        : undefined
    );
    if (!hovered) {
      this.clearHoverState();
      return;
    }

    const geometry = measureS1000DRenderedTableGeometry(hovered.dom, hovered.wrapper, hovered.activeTgroupIndex);
    const rowIndex = getHoveredRowIndex(geometry, event.clientY);
    const columnIndex = getHoveredColumnIndex(geometry, event.clientX);
    this.syncHoverState(
      hovered,
      {
        kind: 'cell',
        tablePos: hovered.tablePos,
        rowIndex,
        columnIndex,
      },
      'cell',
    );
  }

  private handleMouseLeave(event: MouseEvent): void {
    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Element && relatedTarget.closest(OVERLAY_SELECTOR)) {
      return;
    }

    const interaction = getS1000DTableInteractionState(this.view.state);
    if (!interaction.hovered && !interaction.hoveredControl) {
      return;
    }

    this.clearHoverState();
  }

  private handleMouseDown(event: MouseEvent): void {
    if (event.button !== 0 || this.resizeController.isActive) {
      this.finishCellDrag();
      return;
    }

    const target = getPointerElement(this.root.ownerDocument, event) ?? (event.target instanceof Element ? event.target : event.target instanceof Node ? event.target.parentElement : null);
    if (!target || target.closest(OVERLAY_SELECTOR) || !target.closest('td, th')) {
      this.finishCellDrag();
      return;
    }

    const dragContext = getS1000DCellDragContext(this.view, target, event.clientX, event.clientY);
    if (!dragContext) {
      this.finishCellDrag();
      return;
    }

    this.suppressNativeSelection();
    this.root.ownerDocument.getSelection()?.removeAllRanges();
    event.preventDefault();
    event.stopPropagation();
    this.view.focus();

    this.pendingCellDrag = {
      tablePos: dragContext.tablePos,
      anchorEntryPos: dragContext.entryPos,
      rowIndex: dragContext.rowIndex,
      columnIndex: dragContext.columnIndex,
      startX: event.clientX,
      startY: event.clientY,
    };
    this.startCellDragListeners();
  }

  private handleDocumentMouseMove(event: MouseEvent): void {
    if (!this.activeCellDrag && !this.pendingCellDrag) {
      return;
    }

    if ((event.buttons & 1) === 0) {
      this.finishCellDrag();
      return;
    }

    if (this.pendingCellDrag && !this.activeCellDrag) {
      const movedX = Math.abs(event.clientX - this.pendingCellDrag.startX);
      const movedY = Math.abs(event.clientY - this.pendingCellDrag.startY);
      if (Math.max(movedX, movedY) < DRAG_SELECTION_THRESHOLD) {
        return;
      }

      this.activeCellDrag = {
        tablePos: this.pendingCellDrag.tablePos,
        anchorEntryPos: this.pendingCellDrag.anchorEntryPos,
        headEntryPos: this.pendingCellDrag.anchorEntryPos,
      };
    }

    if (!this.activeCellDrag) {
      return;
    }

    const dragContext = getS1000DCellDragContext(
      this.view,
      getPointerElement(this.root.ownerDocument, event),
      event.clientX,
      event.clientY,
    );
    if (!dragContext || dragContext.tablePos !== this.activeCellDrag.tablePos) {
      return;
    }

    if (dragContext.entryPos === this.activeCellDrag.headEntryPos) {
      return;
    }

    const hoveredContext = getRenderedS1000DTableContext(this.view, dragContext.tablePos);
    if (hoveredContext) {
      this.syncHoverState(
        hoveredContext,
        {
          kind: 'cell',
          tablePos: dragContext.tablePos,
          rowIndex: dragContext.rowIndex,
          columnIndex: dragContext.columnIndex,
        },
        'cell',
      );
    }

    this.activeCellDrag.headEntryPos = dragContext.entryPos;
    if (this.activeCellDrag.anchorEntryPos === this.activeCellDrag.headEntryPos) {
      return;
    }

    this.suppressNativeSelection();
    this.root.ownerDocument.getSelection()?.removeAllRanges();
    event.preventDefault();
    event.stopPropagation();
    this.view.dispatch(
      this.view.state.tr.setSelection(
        S1000DCellSelection.create(
          this.view.state.doc,
          this.activeCellDrag.anchorEntryPos,
          this.activeCellDrag.headEntryPos,
        ),
      ),
    );
    this.render();
  }

  private finishCellDrag(event?: MouseEvent): void {
    if (this.activeCellDrag && event) {
      const dragContext = getS1000DCellDragContext(
        this.view,
        getPointerElement(this.root.ownerDocument, event),
        event.clientX,
        event.clientY,
      );
      if (dragContext && dragContext.tablePos === this.activeCellDrag.tablePos) {
        this.activeCellDrag.headEntryPos = dragContext.entryPos;
      }
    }

    if (
      this.pendingCellDrag
      && !this.activeCellDrag
    ) {
      const cursorSelection = TextSelection.near(
        this.view.state.doc.resolve(this.pendingCellDrag.anchorEntryPos + 1),
      );
      this.view.dispatch(this.view.state.tr.setSelection(cursorSelection).scrollIntoView());
      this.view.focus();
      event?.preventDefault();
      event?.stopPropagation();
    }

    if (
      this.activeCellDrag
      && this.activeCellDrag.anchorEntryPos !== this.activeCellDrag.headEntryPos
    ) {
      this.suppressNextClick = true;
      this.root.ownerDocument.getSelection()?.removeAllRanges();
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
      event?.stopPropagation();
    }

    this.pendingCellDrag = null;
    this.activeCellDrag = null;
    this.stopCellDragListeners();
    this.restoreNativeSelectionSuppression();
    this.render();
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
    const interaction = getS1000DTableInteractionState(this.view.state);
    if (!interaction.hovered && !interaction.hoveredControl) {
      return;
    }

    this.syncInteractionMeta({
      hovered: null,
      hoveredControl: null,
      hoveredTgroupIndex: null,
    });
  }

  private createAxisSelectionTransaction(
    context: S1000DTableDOMContext,
    axis: 'row' | 'column',
    axisIndex: number,
  ): Transaction | null {
    if (!context.activeTgroup) {
      return null;
    }

    const grid = createS1000DTableAdapter().createGrid(context.activeTgroup, context.activeTgroupIndex);
    const entry = findAxisAnchorEntry(grid, axis, axisIndex);
    const entryPos = entry ? findS1000DEntryPosition(context, entry) : undefined;
    if (typeof entryPos !== 'number') {
      return null;
    }

    const selection = axis === 'row'
      ? S1000DCellSelection.rowSelection(this.view.state.doc.resolve(entryPos + 1))
      : S1000DCellSelection.colSelection(this.view.state.doc.resolve(entryPos + 1));

    return this.view.state.tr.setSelection(selection).setMeta(s1000dTableInteractionPluginKey, {
      selectedAxis: {
        kind: axis,
        index: axisIndex,
        tablePos: context.tablePos,
        tgroupIndex: context.activeTgroupIndex,
      },
      selectedAxisExplicit: true,
    });
  }

  private simulateAxisReorder(
    axis: 'row' | 'column',
    tablePos: number,
    tgroupIndex: number,
    fromIndex: number,
    toIndex: number,
    apply: boolean,
  ): boolean {
    const context = getRenderedS1000DTableContext(this.view, tablePos, {
      preferredTgroupIndex: tgroupIndex,
    });
    const selectionTransaction = context ? this.createAxisSelectionTransaction(context, axis, fromIndex) : null;
    if (!selectionTransaction) {
      return false;
    }

    let simulatedState = this.view.state.apply(selectionTransaction);
    if (apply) {
      this.view.dispatch(selectionTransaction.scrollIntoView());
      this.view.focus();
    }

    let currentIndex = fromIndex;
    while (currentIndex !== toIndex) {
      const step = currentIndex < toIndex ? 1 : -1;
      const command =
        axis === 'row'
          ? step > 0
            ? moveS1000DRowDown({ tablePos })
            : moveS1000DRowUp({ tablePos })
          : step > 0
            ? moveS1000DColumnRight({ tablePos })
            : moveS1000DColumnLeft({ tablePos });
      let applied = false;
      const commandState = apply ? this.view.state : simulatedState;
      const dispatch = (transaction: Transaction) => {
        applied = true;
        if (apply) {
          this.view.dispatch(transaction);
        } else {
          simulatedState = simulatedState.apply(transaction);
        }
      };
      if (!command(commandState, dispatch) || !applied) {
        return false;
      }
      currentIndex += step;
    }

    if (!apply) {
      return true;
    }

    const nextContext = getRenderedS1000DTableContext(this.view, tablePos, {
      preferredTgroupIndex: tgroupIndex,
    });
    const finalSelection = nextContext ? this.createAxisSelectionTransaction(nextContext, axis, toIndex) : null;
    if (finalSelection) {
      this.view.dispatch(finalSelection.scrollIntoView());
      this.view.focus();
    }

    return true;
  }

  private isAxisHandleVisible(
    interaction: ReturnType<typeof getS1000DTableInteractionState>,
    axis: 'row' | 'column',
    tablePos: number,
    index: number,
    tgroupIndex: number,
  ): boolean {
    if (this.axisDrag?.hasDragged && this.axisDrag.tablePos === tablePos) {
      return this.axisDrag.axis === axis
        && this.axisDrag.index === index
        && this.axisDrag.tgroupIndex === tgroupIndex;
    }

    if (interaction.resizing?.tablePos === tablePos || interaction.tableSelected) {
      return false;
    }

    const selected = isAxisHandleSelected(interaction, axis, tablePos, index, tgroupIndex);
    if (interaction.contextMenuOpen && !selected) {
      return false;
    }

    const hoveredAxisIndex =
      interaction.hovered?.tablePos === tablePos
        ? axis === 'row'
          ? interaction.hovered.rowIndex
          : interaction.hovered.columnIndex
        : null;

    if (hoveredAxisIndex !== null) {
      return isAxisHandleHovered(interaction, axis, tablePos, index);
    }

    return isAxisHandleHovered(interaction, axis, tablePos, index) || selected;
  }

  private shouldHideExtendButtons(
    interaction: ReturnType<typeof getS1000DTableInteractionState>,
  ): boolean {
    return interaction.contextMenuOpen || Boolean(interaction.resizing || this.axisDrag?.hasDragged);
  }

  private handleClickCapture(event: MouseEvent): void {
    if (!this.suppressNextClick) {
      return;
    }

    this.suppressNextClick = false;
    event.preventDefault();
    event.stopPropagation();
  }

  private suppressNativeSelection(): void {
    if (this.previousUserSelect !== null || this.previousWebkitUserSelect !== null) {
      this.root.ownerDocument.getSelection()?.removeAllRanges();
      return;
    }

    const { style } = this.view.dom;
    this.previousUserSelect = style.userSelect;
    this.previousWebkitUserSelect = style.webkitUserSelect;
    style.userSelect = 'none';
    style.webkitUserSelect = 'none';
    this.root.ownerDocument.getSelection()?.removeAllRanges();
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

  private getActiveContext(
    interaction = getS1000DTableInteractionState(this.view.state),
  ): S1000DTableDOMContext | undefined {
    const tablePos = interaction.activeTable?.tablePos;
    if (typeof tablePos !== 'number') {
      return undefined;
    }

    const preferredTgroupIndex = interaction.hovered?.tablePos === tablePos
      ? interaction.hoveredTgroupIndex
      : null;
    return getRenderedS1000DTableContext(this.view, tablePos, { preferredTgroupIndex });
  }

  private getContextFromDataset(element: HTMLElement): S1000DTableDOMContext | undefined {
    const tablePos = Number(element.dataset.tablePos);
    const preferredTgroupIndex = Number(element.dataset.tgroupIndex);
    if (!Number.isInteger(tablePos)) {
      return undefined;
    }

    return getRenderedS1000DTableContext(this.view, tablePos, {
      preferredTgroupIndex: Number.isInteger(preferredTgroupIndex) ? preferredTgroupIndex : null,
    });
  }

  private syncHoverState(
    context: S1000DTableDOMContext,
    hovered: S1000DTableHoverState,
    hoveredControl: S1000DTableHoverControlKind,
  ): void {
    const interaction = getS1000DTableInteractionState(this.view.state);
    if (
      interaction.hovered?.tablePos === hovered.tablePos
      && interaction.hovered.kind === hovered.kind
      && interaction.hovered.rowIndex === hovered.rowIndex
      && interaction.hovered.columnIndex === hovered.columnIndex
      && interaction.hoveredControl === hoveredControl
    ) {
      return;
    }

    this.syncInteractionMeta({
      hovered,
      hoveredTable: {
        tablePos: context.tablePos,
        table: context.table,
      },
      hoveredControl,
      hoveredTgroupIndex: context.activeTgroupIndex,
    });
  }

  private syncInteractionGeometry(
    context: S1000DTableDOMContext,
    geometry: TableGeometry,
  ): void {
    const interaction = getS1000DTableInteractionState(this.view.state);
    if (
      interaction.activeTable?.tablePos === context.tablePos
      && isSameGeometry(interaction.geometry, geometry)
    ) {
      return;
    }

    const meta: S1000DTableInteractionMeta = {
      geometry,
    };
    if (interaction.hovered) {
      meta.hoveredTable = {
        tablePos: context.tablePos,
        table: context.table,
      };
    }

    this.syncInteractionMeta(meta);
  }

  private syncInteractionMeta(meta: S1000DTableInteractionMeta): void {
    const filteredMeta = Object.fromEntries(
      Object.entries(meta).filter(([, value]) => value !== undefined),
    );
    if (Object.keys(filteredMeta).length === 0) {
      return;
    }

    setS1000DTableInteractionMeta(this.view, filteredMeta);
  }

  private detach(): void {
    this.root.hidden = true;
    this.root.classList.remove('html-table-overlay--dragging');
    this.root.classList.remove('html-table-overlay--resizing');
    this.lastRenderState = null;
    this.extendTarget = null;
    this.tableHandle.hidden = true;
    this.contextTriggerButton.hidden = true;
    this.addRowButton.hidden = true;
    this.addColumnButton.hidden = true;
    this.dropIndicator.hidden = true;
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
