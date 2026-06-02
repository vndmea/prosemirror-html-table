import { PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

import type { HtmlTableTiptapOptions } from './options.js';
import {
  getHtmlTableContextMenuState,
  getHtmlTableContextTriggerButtonState,
} from './html-table-context-menu.js';
import {
  getHtmlTableInteractionState,
  type HtmlTableInteractionState,
} from './html-table-interaction.js';
import { HtmlTableCellSelectionController } from './html-table-cell-selection-controller.js';
import { HtmlTableExtendController } from './html-table-extend-controller.js';
import { HtmlTableHandleController } from './html-table-handle-controller.js';
import {
  HtmlTableMenuController,
  type HtmlTableContextMenuAccessibleState,
  type HtmlTableContextMenuActionRenderState,
  type HtmlTableContextMenuGroupAccessibleState,
  type HtmlTableContextMenuHeaderState,
  type HtmlTableContextMenuRenderState,
  type HtmlTableContextTriggerRenderState,
  type HtmlTableOverlayHandleText,
  type HtmlTableCellContextTriggerRenderState,
} from './html-table-menu-controller.js';
import {
  getHtmlTableOverlayPositionState,
  type HtmlTableContextMenuPlacement,
  type HtmlTableContextMenuPosition,
  type HtmlTableSelectionAnchor,
  type HtmlTableSelectionScope,
} from './html-table-overlay-geometry.js';
import { getHtmlTableOverlayMount, HtmlTableOverlayHost } from './html-table-overlay-host.js';
import { HtmlTableResizeController } from './html-table-resize-controller.js';
import { getRenderedHtmlTableContext, measureHtmlTableGeometry } from './table-dom.js';
import { getTableSelectionInfo } from './table-utils.js';

const ROW_HANDLE_OFFSET = 10;
const COLUMN_HANDLE_OFFSET = 10;
const MIN_HANDLE_INSET = 8;
const EXTEND_BUTTON_OFFSET = 14;
const HANDLE_CROSS_AXIS_SIZE = 12;
const HANDLE_MAIN_AXIS_INSET = 8;
let htmlTableContextMenuIdCounter = 0;

export const htmlTableHandlePluginKey = new PluginKey('html-table-handle-overlay');

export type {
  HtmlTableCellContextTriggerRenderState,
  HtmlTableContextMenuAccessibleState,
  HtmlTableContextMenuActionRenderState,
  HtmlTableContextMenuGroupAccessibleState,
  HtmlTableContextMenuHeaderState,
  HtmlTableContextMenuPlacement,
  HtmlTableContextMenuPosition,
  HtmlTableContextMenuRenderState,
  HtmlTableContextTriggerRenderState,
  HtmlTableOverlayHandleText,
  HtmlTableSelectionAnchor,
  HtmlTableSelectionScope,
};

export class HtmlTableOverlayView {
  private view: EditorView;
  private readonly options: HtmlTableTiptapOptions;
  private readonly root: HTMLDivElement;
  private readonly overlayHost: HtmlTableOverlayHost;
  private readonly contextMenuId: string;
  private readonly contextMenu: HTMLDivElement;
  private readonly menuController: HtmlTableMenuController;
  private readonly handleController: HtmlTableHandleController;
  private readonly cellSelectionController: HtmlTableCellSelectionController;
  private readonly extendController: HtmlTableExtendController;
  private readonly resizeController: HtmlTableResizeController;
  private renderedTablePos: number | null = null;
  private renderedGeometry: ReturnType<typeof measureHtmlTableGeometry> | null = null;
  private suppressNextDocumentClick = false;
  private readonly onDocumentMouseUpCapture = (event: MouseEvent) => this.handleDocumentMouseUpCapture(event);
  private readonly onDocumentClickCapture = (event: MouseEvent) => this.handleDocumentClickCapture(event);
  private readonly onDocumentMouseDown = (event: MouseEvent) => this.handleDocumentMouseDown(event);
  private readonly onDocumentKeyDown = (event: KeyboardEvent) => this.handleDocumentKeyDown(event);

  constructor(view: EditorView, options: HtmlTableTiptapOptions) {
    this.view = view;
    this.options = options;
    this.root = view.dom.ownerDocument.createElement('div');
    this.root.className = 'html-table-overlay';
    this.root.dataset.htmlTableOverlay = 'true';
    this.root.dataset.testid = 'pmht-overlay';
    this.root.setAttribute('role', 'presentation');
    this.root.hidden = true;
    this.contextMenuId = `html-table-overlay-menu-${htmlTableContextMenuIdCounter += 1}`;
    this.overlayHost = new HtmlTableOverlayHost(this.root);

    this.handleController = new HtmlTableHandleController({
      allowTableNodeSelection: options.allowTableNodeSelection,
      contextMenuId: this.contextMenuId,
      getView: () => this.view,
      handleCrossAxisSize: HANDLE_CROSS_AXIS_SIZE,
      handleMainAxisInset: HANDLE_MAIN_AXIS_INSET,
      minHandleInset: MIN_HANDLE_INSET,
      root: this.root,
      suppressPointerClick: () => this.suppressPointerClick(),
      toggleContextMenuFromControl: (interaction, focusTarget) => this.toggleContextMenuFromControl(interaction, focusTarget),
    });
    this.cellSelectionController = new HtmlTableCellSelectionController({
      contextMenuId: this.contextMenuId,
      getView: () => this.view,
      root: this.root,
      suppressPointerClick: () => this.suppressPointerClick(),
      toggleContextMenuFromControl: (interaction, focusTarget) => this.toggleContextMenuFromControl(interaction, focusTarget),
    });
    this.contextMenu = this.createContextMenu();
    this.menuController = new HtmlTableMenuController({
      getView: () => this.view,
      root: this.root,
      contextMenuId: this.contextMenuId,
      contextMenu: this.contextMenu,
      contextTriggerButton: this.handleController.contextTriggerButton,
      cellSelectionHandle: this.cellSelectionController.cellSelectionHandle,
      suppressPointerClick: () => this.suppressPointerClick(),
    });
    this.resizeController = new HtmlTableResizeController({
      getView: () => this.view,
      handleWidth: options.handleWidth,
      lastColumnResizable: options.lastColumnResizable,
      options: {
        cellMinWidth: options.cellMinWidth,
        resizable: options.resizable,
      },
      root: this.root,
    });
    this.extendController = new HtmlTableExtendController({
      extendButtonOffset: EXTEND_BUTTON_OFFSET,
      getView: () => this.view,
      root: this.root,
      suppressPointerClick: () => this.suppressPointerClick(),
    });

    this.root.append(this.contextMenu);
    this.root.ownerDocument.addEventListener('mousedown', this.onDocumentMouseDown);
    this.root.ownerDocument.addEventListener('mouseup', this.onDocumentMouseUpCapture, true);
    this.root.ownerDocument.addEventListener('click', this.onDocumentClickCapture, true);
    this.root.ownerDocument.addEventListener('keydown', this.onDocumentKeyDown);
    this.render();
  }

  update(view: EditorView): void {
    this.view = view;
    this.render();
  }

  destroy(): void {
    this.resizeController.destroy();
    this.menuController.destroy();
    this.root.ownerDocument.removeEventListener('mousedown', this.onDocumentMouseDown);
    this.root.ownerDocument.removeEventListener('mouseup', this.onDocumentMouseUpCapture, true);
    this.root.ownerDocument.removeEventListener('click', this.onDocumentClickCapture, true);
    this.root.ownerDocument.removeEventListener('keydown', this.onDocumentKeyDown);
    this.renderedTablePos = null;
    this.renderedGeometry = null;
    this.overlayHost.detach();
  }

  private render(): void {
    const interaction = getHtmlTableInteractionState(this.view.state);
    const activeTable = interaction.activeTable;
    const geometry = interaction.geometry;
    if (!activeTable || !geometry) {
      this.detach();
      return;
    }

    const context = getRenderedHtmlTableContext(this.view, activeTable.tablePos);
    if (!context) {
      this.detach();
      return;
    }

    this.renderedTablePos = activeTable.tablePos;
    this.renderedGeometry = geometry;

    const overlayMount = getHtmlTableOverlayMount(this.view);
    const overlayHost = this.overlayHost.attach(overlayMount);
    const hostRect = overlayHost.getBoundingClientRect();
    const overlayPositionState = getHtmlTableOverlayPositionState(
      geometry,
      hostRect,
      MIN_HANDLE_INSET,
      ROW_HANDLE_OFFSET,
      COLUMN_HANDLE_OFFSET,
    );
    const selectionInfo = getTableSelectionInfo(this.view.state.doc, this.view.state.selection);
    const contextTrigger = getHtmlTableContextTriggerButtonState(this.view.state, interaction);
    const contextMenu = getHtmlTableContextMenuState(this.view.state, interaction);

    this.handleController.render(
      interaction,
      contextMenu,
      contextTrigger,
      activeTable.tablePos,
      geometry,
      overlayPositionState,
      hostRect,
    );
    this.cellSelectionController.render(
      interaction,
      contextMenu,
      activeTable.tablePos,
      geometry,
      overlayPositionState.tableLeft,
      overlayPositionState.tableTop,
      selectionInfo,
    );
    this.resizeController.render(
      interaction,
      activeTable.tablePos,
      geometry,
      overlayPositionState.tableLeft,
      overlayPositionState.visibleTableTop,
      overlayPositionState.visibleTableHeight,
    );
    this.extendController.render(
      interaction,
      this.getExtendButtonTarget(interaction),
      overlayPositionState.visibleTableLeft,
      overlayPositionState.visibleTableTop,
      overlayPositionState.visibleTableWidth,
      overlayPositionState.visibleTableHeight,
    );
    this.menuController.sync(contextMenu, hostRect, MIN_HANDLE_INSET);

    this.root.hidden = false;
  }

  private createContextMenu(): HTMLDivElement {
    const menu = this.root.ownerDocument.createElement('div');
    menu.className = 'html-table-overlay__context-menu';
    menu.id = this.contextMenuId;
    menu.dataset.testid = 'pmht-context-menu';
    menu.hidden = true;
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-orientation', 'vertical');
    menu.addEventListener('mousedown', (event) => this.menuController.handleMenuMouseDown(event));
    menu.addEventListener('click', (event) => this.menuController.handleMenuClick(event));
    menu.addEventListener('keydown', (event) => this.menuController.handleMenuKeyDown(event));
    return menu;
  }

  private toggleContextMenuFromControl(
    interaction: HtmlTableInteractionState,
    focusTarget: HTMLButtonElement | null,
  ): void {
    this.menuController.toggleFromControl(interaction, focusTarget);
  }

  private handleDocumentMouseDown(event: MouseEvent): void {
    this.menuController.handleDocumentMouseDown(event);
  }

  private handleDocumentMouseUpCapture(event: MouseEvent): void {
    if (!this.suppressNextDocumentClick) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
  }

  private handleDocumentClickCapture(event: MouseEvent): void {
    if (!this.suppressNextDocumentClick) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.suppressNextDocumentClick = false;
  }

  private handleDocumentKeyDown(event: KeyboardEvent): void {
    this.menuController.handleDocumentKeyDown(event);
  }

  private suppressPointerClick(): void {
    this.suppressNextDocumentClick = true;
  }

  private getExtendButtonTarget(
    interaction: HtmlTableInteractionState,
  ): {
    tablePos: number;
    geometry: ReturnType<typeof measureHtmlTableGeometry>;
  } | null {
    if (interaction.activeTable && interaction.geometry) {
      return {
        tablePos: interaction.activeTable.tablePos,
        geometry: interaction.geometry,
      };
    }

    if (this.renderedTablePos !== null && this.renderedGeometry) {
      return {
        tablePos: this.renderedTablePos,
        geometry: this.renderedGeometry,
      };
    }

    return null;
  }

  private detach(): void {
    this.root.hidden = true;
    this.overlayHost.detach();
    this.renderedTablePos = null;
    this.renderedGeometry = null;
  }
}
