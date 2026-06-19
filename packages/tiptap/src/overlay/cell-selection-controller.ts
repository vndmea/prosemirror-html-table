import type { EditorView } from '@tiptap/pm/view';

import type { HtmlTableContextMenuState } from '../context-menu/state.js';
import { getHtmlTableContextMenuState } from '../context-menu/state.js';
import { getHtmlTableInteractionState, type HtmlTableInteractionState } from '../interaction/plugin.js';
import {
  getHtmlTableCellContextTriggerRenderState,
  getHtmlTableContextMenuAriaControls,
  isHtmlTableKeyboardClick,
} from './menu-controller.js';
import {
  getHtmlTableSelectionAnchor,
  getHtmlTableSelectionScope,
  getHtmlTableVisibleSelectionRect,
} from './geometry.js';
import type { HtmlTableTiptapOptions } from '../options.js';
import { measureHtmlTableGeometry } from '../table-dom.js';
import { getTableSelectionInfo } from '../table-utils.js';

export function isHtmlTableCellHandleVisible(
  interaction: HtmlTableInteractionState,
  tablePos: number,
  selectionInfo: ReturnType<typeof getTableSelectionInfo> | null,
  renderVisible: boolean,
): boolean {
  if (!renderVisible) {
    return false;
  }

  if (interaction.tableSelected || interaction.resizing?.tablePos === tablePos) {
    return false;
  }

  if (!selectionInfo || selectionInfo.tablePos !== tablePos) {
    return false;
  }

  return !(Boolean(interaction.selectedAxisExplicit) && interaction.selectedAxis.kind);
}

export interface HtmlTableCellSelectionControllerOptions {
  contextMenuId: string;
  getView: () => EditorView;
  root: HTMLDivElement;
  suppressPointerClick: () => void;
  tableOptions?: Pick<HtmlTableTiptapOptions, 'contextActionResolver'>;
  toggleContextMenuFromControl: (
    interaction: HtmlTableInteractionState,
    focusTarget: HTMLButtonElement | null,
  ) => void;
}

export class HtmlTableCellSelectionController {
  readonly cellSelectionHandle: HTMLButtonElement;

  private readonly root: HTMLDivElement;
  private readonly contextMenuId: string;
  private readonly getView: () => EditorView;
  private readonly suppressPointerClick: () => void;
  private readonly tableOptions: Pick<HtmlTableTiptapOptions, 'contextActionResolver'>;
  private readonly toggleContextMenuFromControl: HtmlTableCellSelectionControllerOptions['toggleContextMenuFromControl'];
  private readonly rowSelectionOverlay: HTMLDivElement;
  private readonly columnSelectionOverlay: HTMLDivElement;
  private readonly cellSelectionFill: HTMLDivElement;
  private readonly cellSelectionOutline: HTMLDivElement;

  constructor(options: HtmlTableCellSelectionControllerOptions) {
    this.root = options.root;
    this.contextMenuId = options.contextMenuId;
    this.getView = options.getView;
    this.suppressPointerClick = options.suppressPointerClick;
    this.tableOptions = options.tableOptions ?? { contextActionResolver: null };
    this.toggleContextMenuFromControl = options.toggleContextMenuFromControl;

    this.rowSelectionOverlay = this.root.ownerDocument.createElement('div');
    this.rowSelectionOverlay.className = 'html-table-overlay__selection-band html-table-overlay__selection-band--row';
    this.rowSelectionOverlay.dataset.testid = 'pmht-selection-band-row';
    this.columnSelectionOverlay = this.root.ownerDocument.createElement('div');
    this.columnSelectionOverlay.className =
      'html-table-overlay__selection-band html-table-overlay__selection-band--column';
    this.columnSelectionOverlay.dataset.testid = 'pmht-selection-band-column';
    this.cellSelectionFill = this.root.ownerDocument.createElement('div');
    this.cellSelectionFill.className = 'html-table-overlay__cell-selection-fill';
    this.cellSelectionFill.hidden = true;
    this.cellSelectionOutline = this.root.ownerDocument.createElement('div');
    this.cellSelectionOutline.className = 'html-table-overlay__cell-selection-outline';
    this.cellSelectionOutline.hidden = true;
    this.cellSelectionHandle = this.root.ownerDocument.createElement('button');
    this.cellSelectionHandle.type = 'button';
    this.cellSelectionHandle.className = 'html-table-overlay__cell-selection-handle';
    this.cellSelectionHandle.dataset.testid = 'pmht-cell-handle';
    this.cellSelectionHandle.tabIndex = -1;
    this.cellSelectionHandle.hidden = true;
    this.cellSelectionHandle.setAttribute('aria-label', 'Table cells option');
    this.cellSelectionHandle.title = 'Table cells option';
    this.cellSelectionHandle.addEventListener('mousedown', (event) => this.handleCellSelectionHandleMouseDown(event));
    this.cellSelectionHandle.addEventListener('click', (event) => this.handleCellSelectionHandleClick(event));

    this.root.append(
      this.rowSelectionOverlay,
      this.columnSelectionOverlay,
      this.cellSelectionFill,
      this.cellSelectionOutline,
    );
    this.cellSelectionOutline.append(this.cellSelectionHandle);
  }

  render(
    interaction: HtmlTableInteractionState,
    menu: HtmlTableContextMenuState,
    tablePos: number,
    geometry: ReturnType<typeof measureHtmlTableGeometry>,
    tableLeft: number,
    tableTop: number,
    selectionInfo: ReturnType<typeof getTableSelectionInfo> | null,
  ): void {
    this.syncSelectionContextState(interaction, tablePos, geometry, tableLeft, tableTop, selectionInfo);
    this.syncSelectionOverlay(interaction, tablePos, geometry, tableLeft, tableTop);
    this.syncCellSelectionHandle(menu, tablePos, geometry, tableLeft, tableTop, selectionInfo);
  }

  private get view(): EditorView {
    return this.getView();
  }

  private syncSelectionContextState(
    interaction: HtmlTableInteractionState,
    tablePos: number,
    geometry: ReturnType<typeof measureHtmlTableGeometry>,
    tableLeft: number,
    tableTop: number,
    selectionInfo: ReturnType<typeof getTableSelectionInfo> | null,
  ): void {
    const scope = getHtmlTableSelectionScope(interaction, tablePos, selectionInfo);
    const anchor = getHtmlTableSelectionAnchor(interaction, tablePos, geometry, tableLeft, tableTop, selectionInfo);

    this.root.dataset.selectionScope = scope ?? 'none';

    if (!anchor) {
      this.root.style.removeProperty('--pmht-selection-anchor-left');
      this.root.style.removeProperty('--pmht-selection-anchor-top');
      return;
    }

    this.root.style.setProperty('--pmht-selection-anchor-left', `${anchor.left}px`);
    this.root.style.setProperty('--pmht-selection-anchor-top', `${anchor.top}px`);
  }

  private syncSelectionOverlay(
    interaction: HtmlTableInteractionState,
    tablePos: number,
    geometry: ReturnType<typeof measureHtmlTableGeometry>,
    tableLeft: number,
    tableTop: number,
  ): void {
    if (interaction.tableSelected) {
      this.rowSelectionOverlay.hidden = true;
      this.columnSelectionOverlay.hidden = true;
      return;
    }

    const selectedAxis =
      Boolean(interaction.selectedAxisExplicit) && interaction.selectedAxis.tablePos === tablePos
        ? interaction.selectedAxis
        : null;
    const selectedRow =
      selectedAxis?.kind === 'row' && selectedAxis.index !== null ? geometry.rows[selectedAxis.index] : null;
    const selectedColumn =
      selectedAxis?.kind === 'column' && selectedAxis.index !== null ? geometry.columns[selectedAxis.index] : null;

    if (selectedRow) {
      const rect = getHtmlTableVisibleSelectionRect(
        geometry,
        tableLeft,
        tableTop,
        0,
        Math.max(0, geometry.columns.length - 1),
        selectedRow.index,
        selectedRow.index,
      );
      if (!rect) {
        this.rowSelectionOverlay.hidden = true;
      } else {
        this.rowSelectionOverlay.hidden = false;
        this.rowSelectionOverlay.style.left = `${rect.left}px`;
        this.rowSelectionOverlay.style.top = `${rect.top}px`;
        this.rowSelectionOverlay.style.width = `${rect.width}px`;
        this.rowSelectionOverlay.style.height = `${rect.height}px`;
      }
    } else {
      this.rowSelectionOverlay.hidden = true;
    }

    if (selectedColumn) {
      const rect = getHtmlTableVisibleSelectionRect(
        geometry,
        tableLeft,
        tableTop,
        selectedColumn.index,
        selectedColumn.index,
        0,
        Math.max(0, geometry.rows.length - 1),
      );
      if (!rect) {
        this.columnSelectionOverlay.hidden = true;
      } else {
        this.columnSelectionOverlay.hidden = false;
        this.columnSelectionOverlay.style.left = `${rect.left}px`;
        this.columnSelectionOverlay.style.top = `${rect.top}px`;
        this.columnSelectionOverlay.style.width = `${rect.width}px`;
        this.columnSelectionOverlay.style.height = `${rect.height}px`;
      }
    } else {
      this.columnSelectionOverlay.hidden = true;
    }
  }

  private syncCellSelectionHandle(
    menu: HtmlTableContextMenuState,
    tablePos: number,
    geometry: ReturnType<typeof measureHtmlTableGeometry>,
    tableLeft: number,
    tableTop: number,
    selectionInfo: ReturnType<typeof getTableSelectionInfo> | null,
  ): void {
    const interaction = getHtmlTableInteractionState(this.view.state);
    const renderState = getHtmlTableCellContextTriggerRenderState(menu);
    const controls = getHtmlTableContextMenuAriaControls(this.contextMenuId, renderState.expanded);
    if (!selectionInfo || selectionInfo.tablePos !== tablePos) {
      this.cellSelectionFill.hidden = true;
      this.cellSelectionOutline.hidden = true;
      this.cellSelectionHandle.hidden = true;
      this.cellSelectionHandle.tabIndex = -1;
      return;
    }

    const rect = getHtmlTableVisibleSelectionRect(
      geometry,
      tableLeft,
      tableTop,
      selectionInfo.left,
      selectionInfo.right,
      selectionInfo.top,
      selectionInfo.bottom,
    );
    if (!rect) {
      this.cellSelectionFill.hidden = true;
      this.cellSelectionOutline.hidden = true;
      this.cellSelectionHandle.hidden = true;
      this.cellSelectionHandle.tabIndex = -1;
      return;
    }

    const visible = isHtmlTableCellHandleVisible(interaction, tablePos, selectionInfo, renderState.visible);
    this.cellSelectionFill.hidden = false;
    this.cellSelectionFill.style.left = `${rect.left}px`;
    this.cellSelectionFill.style.top = `${rect.top}px`;
    this.cellSelectionFill.style.width = `${rect.width}px`;
    this.cellSelectionFill.style.height = `${rect.height}px`;
    this.cellSelectionOutline.hidden = false;
    this.cellSelectionOutline.style.left = `${rect.left}px`;
    this.cellSelectionOutline.style.top = `${rect.top}px`;
    this.cellSelectionOutline.style.width = `${rect.width}px`;
    this.cellSelectionOutline.style.height = `${rect.height}px`;
    this.cellSelectionHandle.hidden = !visible;
    this.cellSelectionHandle.tabIndex = visible ? 0 : -1;
    this.cellSelectionHandle.dataset.primaryAction = renderState.primaryActionId ?? '';
    this.cellSelectionHandle.setAttribute('aria-haspopup', 'menu');
    this.cellSelectionHandle.setAttribute('aria-expanded', renderState.expanded ? 'true' : 'false');
    if (controls) {
      this.cellSelectionHandle.setAttribute('aria-controls', controls);
    } else {
      this.cellSelectionHandle.removeAttribute('aria-controls');
    }
    this.cellSelectionHandle.setAttribute('aria-label', renderState.label ?? 'Table cells option');
    this.cellSelectionHandle.title = renderState.title ?? renderState.label ?? 'Table cells option';
    this.cellSelectionHandle.classList.toggle('is-menu-open', renderState.expanded);
  }

  private handleCellSelectionHandleMouseDown(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.suppressPointerClick();
    this.toggleCellSelectionMenu();
  }

  private handleCellSelectionHandleClick(event: MouseEvent): void {
    if (!isHtmlTableKeyboardClick(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.toggleCellSelectionMenu();
  }

  private toggleCellSelectionMenu(): void {
    const interaction = getHtmlTableInteractionState(this.view.state);
    if (interaction.resizing?.tablePos === interaction.activeTable?.tablePos) {
      this.view.focus();
      return;
    }

    const menu = getHtmlTableContextMenuState(this.view.state, interaction, this.tableOptions);
    const renderState = getHtmlTableCellContextTriggerRenderState(menu);
    if (!renderState.visible) {
      this.view.focus();
      return;
    }

    this.toggleContextMenuFromControl(interaction, this.cellSelectionHandle);
  }
}
