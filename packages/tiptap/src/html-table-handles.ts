import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

import { getHtmlTableInteractionState } from './html-table-interaction.js';
import { getRenderedHtmlTableContext } from './table-dom.js';
import {
  createColumnSelectionTransaction,
  createRowSelectionTransaction,
} from './table-utils.js';

const ROW_HANDLE_OFFSET = 10;
const COLUMN_HANDLE_OFFSET = 10;
const MIN_HANDLE_INSET = 8;

export const htmlTableHandlePluginKey = new PluginKey('html-table-handle-overlay');

export function createHtmlTableHandlePlugin(): Plugin {
  return new Plugin({
    key: htmlTableHandlePluginKey,
    view(view) {
      return new HtmlTableHandleOverlayView(view);
    },
  });
}

class HtmlTableHandleOverlayView {
  private view: EditorView;
  private readonly root: HTMLDivElement;
  private currentWrapper: HTMLElement | null = null;
  private rowHandles: HTMLButtonElement[] = [];
  private columnHandles: HTMLButtonElement[] = [];

  constructor(view: EditorView) {
    this.view = view;
    this.root = view.dom.ownerDocument.createElement('div');
    this.root.className = 'html-table-overlay';
    this.root.dataset.htmlTableOverlay = 'true';
    this.root.setAttribute('role', 'presentation');
    this.root.hidden = true;
    this.render();
  }

  update(view: EditorView): void {
    this.view = view;
    this.render();
  }

  destroy(): void {
    this.currentWrapper = null;
    this.root.remove();
    this.rowHandles = [];
    this.columnHandles = [];
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

    this.attach(context.wrapper);

    const wrapperRect = context.wrapper.getBoundingClientRect();
    const tableLeft = context.wrapper.scrollLeft + geometry.tableRect.left - wrapperRect.left;
    const tableTop = context.wrapper.scrollTop + geometry.tableRect.top - wrapperRect.top;
    const rowHandleLeft = Math.max(MIN_HANDLE_INSET, tableLeft - ROW_HANDLE_OFFSET);
    const columnHandleTop = Math.max(MIN_HANDLE_INSET, tableTop - COLUMN_HANDLE_OFFSET);

    this.syncHandleCount('row', geometry.rows.length);
    this.syncHandleCount('column', geometry.columns.length);

    for (const row of geometry.rows) {
      const handle = this.rowHandles[row.index];
      if (!handle) continue;

      handle.dataset.index = String(row.index);
      handle.setAttribute('aria-label', `Select row ${row.index + 1}`);
      handle.title = `Select row ${row.index + 1}`;
      handle.style.left = `${rowHandleLeft}px`;
      handle.style.top = `${tableTop + row.top + row.height / 2}px`;
      handle.classList.toggle(
        'is-hovered',
        interaction.hovered?.tablePos === activeTable.tablePos && interaction.hovered.rowIndex === row.index,
      );
      handle.classList.toggle(
        'is-selected',
        interaction.selectedAxis.kind === 'row' &&
          interaction.selectedAxis.index === row.index &&
          interaction.selectedAxis.tablePos === activeTable.tablePos,
      );
    }

    for (const column of geometry.columns) {
      const handle = this.columnHandles[column.index];
      if (!handle) continue;

      handle.dataset.index = String(column.index);
      handle.setAttribute('aria-label', `Select column ${column.index + 1}`);
      handle.title = `Select column ${column.index + 1}`;
      handle.style.left = `${tableLeft + column.left + column.width / 2}px`;
      handle.style.top = `${columnHandleTop}px`;
      handle.classList.toggle(
        'is-hovered',
        interaction.hovered?.tablePos === activeTable.tablePos && interaction.hovered.columnIndex === column.index,
      );
      handle.classList.toggle(
        'is-selected',
        interaction.selectedAxis.kind === 'column' &&
          interaction.selectedAxis.index === column.index &&
          interaction.selectedAxis.tablePos === activeTable.tablePos,
      );
    }

    this.root.hidden = false;
  }

  private syncHandleCount(axis: 'row' | 'column', count: number): void {
    const handles = axis === 'row' ? this.rowHandles : this.columnHandles;
    const parentClassName = axis === 'row' ? 'html-table-overlay__rows' : 'html-table-overlay__columns';
    let parent = this.root.querySelector(`.${parentClassName}`) as HTMLDivElement | null;

    if (!parent) {
      parent = this.root.ownerDocument.createElement('div');
      parent.className = parentClassName;
      this.root.append(parent);
    }

    while (handles.length < count) {
      const handle = this.createHandle(axis);
      handles.push(handle);
      parent.append(handle);
    }

    while (handles.length > count) {
      handles.pop()?.remove();
    }
  }

  private createHandle(axis: 'row' | 'column'): HTMLButtonElement {
    const handle = this.root.ownerDocument.createElement('button');
    handle.type = 'button';
    handle.className = `html-table-overlay__handle html-table-overlay__handle--${axis}`;
    handle.dataset.axis = axis;
    handle.tabIndex = -1;
    handle.addEventListener('mousedown', (event) => this.handleMouseDown(event));
    return handle;
  }

  private handleMouseDown(event: MouseEvent): void {
    const handle = event.currentTarget as HTMLButtonElement | null;
    const axis = handle?.dataset.axis;
    const index = Number(handle?.dataset.index);
    const interaction = getHtmlTableInteractionState(this.view.state);
    const activeTable = interaction.activeTable;
    if (!handle || !activeTable || (axis !== 'row' && axis !== 'column') || !Number.isInteger(index)) {
      return;
    }

    const table = this.view.state.doc.nodeAt(activeTable.tablePos);
    if (!table || table.type.name !== 'htmlTable') {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const transaction =
      axis === 'row'
        ? createRowSelectionTransaction(this.view.state, activeTable.tablePos, table, index)
        : createColumnSelectionTransaction(this.view.state, activeTable.tablePos, table, index);

    if (!transaction) return;

    this.view.focus();
    this.view.dispatch(transaction);
  }

  private attach(wrapper: HTMLElement): void {
    if (this.currentWrapper === wrapper && this.root.parentElement === wrapper) {
      return;
    }

    this.detach();
    wrapper.append(this.root);
    this.currentWrapper = wrapper;
  }

  private detach(): void {
    this.root.hidden = true;
    this.root.remove();
    this.currentWrapper = null;
  }
}
