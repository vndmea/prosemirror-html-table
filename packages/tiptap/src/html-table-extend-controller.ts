import type { Transaction } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import {
  addColumnAfter as addCoreColumnAfter,
  addRowAfter as addCoreRowAfter,
  createHtmlTableGrid,
} from 'prosemirror-html-table';

import { getHtmlTableInteractionState, htmlTableInteractionPluginKey, type HtmlTableInteractionState } from './html-table-interaction.js';
import { isHtmlTableKeyboardClick } from './html-table-menu-controller.js';
import { measureHtmlTableGeometry } from './table-dom.js';
import {
  createColumnSelectionTransaction,
  createRowSelectionTransaction,
} from './table-utils.js';

export function shouldHideHtmlTableExtendButtons(
  interaction: HtmlTableInteractionState,
): boolean {
  return interaction.contextMenuOpen || Boolean(interaction.resizing);
}

export interface HtmlTableExtendControllerOptions {
  extendButtonOffset: number;
  getView: () => EditorView;
  root: HTMLDivElement;
  suppressPointerClick: () => void;
}

export class HtmlTableExtendController {
  private readonly getView: () => EditorView;
  private readonly suppressPointerClick: () => void;
  private readonly extendButtonOffset: number;
  private renderTarget: {
    tablePos: number;
    geometry: ReturnType<typeof measureHtmlTableGeometry>;
  } | null = null;
  private readonly addRowButton: HTMLButtonElement;
  private readonly addColumnButton: HTMLButtonElement;

  constructor(options: HtmlTableExtendControllerOptions) {
    this.getView = options.getView;
    this.suppressPointerClick = options.suppressPointerClick;
    this.extendButtonOffset = options.extendButtonOffset;
    this.addRowButton = this.createExtendButton(options.root, 'row');
    this.addColumnButton = this.createExtendButton(options.root, 'column');
    options.root.append(this.addRowButton, this.addColumnButton);
  }

  render(
    interaction: HtmlTableInteractionState,
    target: {
      tablePos: number;
      geometry: ReturnType<typeof measureHtmlTableGeometry>;
    } | null,
    visibleTableLeft: number,
    visibleTableTop: number,
    visibleTableWidth: number,
    visibleTableHeight: number,
  ): void {
    this.renderTarget = target;
    const hidden = shouldHideHtmlTableExtendButtons(interaction);

    this.addRowButton.hidden = hidden;
    this.addRowButton.tabIndex = hidden ? -1 : 0;
    this.addRowButton.style.left = `${visibleTableLeft + visibleTableWidth / 2}px`;
    this.addRowButton.style.top = `${visibleTableTop + visibleTableHeight + this.extendButtonOffset}px`;
    this.addRowButton.style.width = `${visibleTableWidth}px`;
    this.addRowButton.style.height = `12px`;

    this.addColumnButton.hidden = hidden;
    this.addColumnButton.tabIndex = hidden ? -1 : 0;
    this.addColumnButton.style.left = `${visibleTableLeft + visibleTableWidth + this.extendButtonOffset}px`;
    this.addColumnButton.style.top = `${visibleTableTop + visibleTableHeight / 2}px`;
    this.addColumnButton.style.width = `12px`;
    this.addColumnButton.style.height = `${visibleTableHeight}px`;
  }

  private get view(): EditorView {
    return this.getView();
  }

  private createExtendButton(root: HTMLDivElement, axis: 'row' | 'column'): HTMLButtonElement {
    const button = root.ownerDocument.createElement('button');
    button.type = 'button';
    button.className = `html-table-overlay__extend-button html-table-overlay__extend-button--${axis}`;
    button.dataset.axis = axis;
    button.dataset.testid = axis === 'row' ? 'pmht-extend-row' : 'pmht-extend-column';
    button.tabIndex = -1;
    button.textContent = '+';
    button.setAttribute('aria-label', axis === 'row' ? 'Add row after' : 'Add column after');
    button.title = axis === 'row' ? 'Add row after' : 'Add column after';
    button.addEventListener('mousedown', (event) => this.handleExtendButtonMouseDown(event));
    button.addEventListener('click', (event) => this.handleExtendButtonClick(event));
    return button;
  }

  private handleExtendButtonMouseDown(event: MouseEvent): void {
    const button = event.currentTarget as HTMLButtonElement | null;
    const axis = button?.dataset.axis;
    const extendTarget = this.renderTarget;
    if (
      !button ||
      !extendTarget ||
      (axis !== 'row' && axis !== 'column') ||
      getHtmlTableInteractionState(this.view.state).resizing?.tablePos === extendTarget.tablePos
    ) {
      return;
    }

    const table = this.view.state.doc.nodeAt(extendTarget.tablePos);
    if (!table || table.type.name !== 'htmlTable') {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.suppressPointerClick();
    this.activateExtendButton(axis, extendTarget.tablePos, extendTarget.geometry, table);
  }

  private handleExtendButtonClick(event: MouseEvent): void {
    if (!isHtmlTableKeyboardClick(event)) {
      return;
    }

    const button = event.currentTarget as HTMLButtonElement | null;
    const axis = button?.dataset.axis;
    const extendTarget = this.renderTarget;
    if (
      !button ||
      !extendTarget ||
      (axis !== 'row' && axis !== 'column') ||
      getHtmlTableInteractionState(this.view.state).resizing?.tablePos === extendTarget.tablePos
    ) {
      return;
    }

    const table = this.view.state.doc.nodeAt(extendTarget.tablePos);
    if (!table || table.type.name !== 'htmlTable') {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.activateExtendButton(axis, extendTarget.tablePos, extendTarget.geometry, table);
  }

  private activateExtendButton(
    axis: 'row' | 'column',
    tablePos: number,
    geometry: ReturnType<typeof measureHtmlTableGeometry>,
    table: NonNullable<ReturnType<EditorView['state']['doc']['nodeAt']>>,
  ): void {
    const targetRowIndex = this.getExtendRowIndex(table);
    const selectionTransaction =
      axis === 'row'
        ? createRowSelectionTransaction(this.view.state, tablePos, table, targetRowIndex)
        : createColumnSelectionTransaction(
            this.view.state,
            tablePos,
            table,
            Math.max(0, geometry.columns.length - 1),
          )?.setMeta(htmlTableInteractionPluginKey, {
            selectedAxis: {
              kind: 'column',
              index: Math.max(0, geometry.columns.length - 1),
              tablePos,
            },
            selectedAxisExplicit: true,
          });
    if (!selectionTransaction) return;

    const commandState = this.view.state.apply(selectionTransaction);
    let commandTransaction: Transaction | undefined;
    const command =
      axis === 'row'
        ? addCoreRowAfter()
        : addCoreColumnAfter();

    const applied = command(commandState, (transaction) => {
      commandTransaction = transaction;
    });
    if (!applied || !commandTransaction) return;

    const finalizedTransaction = this.applyExtendButtonSelection(
      axis,
      tablePos,
      geometry,
      targetRowIndex,
      commandState,
      commandTransaction,
    );

    this.view.focus();
    this.view.dispatch(finalizedTransaction);
  }

  private applyExtendButtonSelection(
    axis: 'row' | 'column',
    tablePos: number,
    geometry: ReturnType<typeof measureHtmlTableGeometry>,
    targetRowIndex: number,
    commandState: EditorView['state'],
    commandTransaction: Transaction,
  ): Transaction {
    const nextState = commandState.apply(commandTransaction);
    const nextTable = nextState.doc.nodeAt(tablePos);
    if (!nextTable || nextTable.type.name !== 'htmlTable') {
      return commandTransaction;
    }

    const nextIndex = axis === 'row' ? targetRowIndex + 1 : Math.max(0, geometry.columns.length);
    const selectionTransaction =
      axis === 'row'
        ? createRowSelectionTransaction(nextState, tablePos, nextTable, nextIndex)
        : createColumnSelectionTransaction(nextState, tablePos, nextTable, nextIndex);
    if (!selectionTransaction) {
      return commandTransaction;
    }

    commandTransaction.setSelection(selectionTransaction.selection);
    commandTransaction.setMeta(htmlTableInteractionPluginKey, {
      selectedAxis: {
        kind: axis,
        index: nextIndex,
        tablePos,
      },
      selectedAxisExplicit: true,
    });
    return commandTransaction;
  }

  private getExtendRowIndex(table: NonNullable<ReturnType<EditorView['state']['doc']['nodeAt']>>): number {
    const grid = createHtmlTableGrid(table);
    const lastBodyRow = [...grid.rows].reverse().find((row) => row.section === 'body');
    return lastBodyRow?.rowIndex ?? Math.max(0, grid.height - 1);
  }
}
