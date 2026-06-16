import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { NodeSelection, Plugin, PluginKey, type EditorState, type Selection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

import {
  buildTableInteractionState,
  createDefaultTableInteractionState,
  defaultTableSelectedAxisState,
  deriveTableContextTriggerState,
  type TableContextTriggerState,
  type TableGeometry,
  type TableHoverKind,
  type TableHoverState,
  type TableInteractionMeta,
  type TableInteractionState,
  type TableReference,
  type TableResizeState,
  type TableSelectedAxisKind,
  type TableSelectedAxisState,
} from 'tiptap-html-table/table-interaction';

import { getS1000DSelectionInfo, isWholeS1000DTableSelection } from './clipboard.js';
import { findS1000DTableAroundSelection } from './context.js';
import { s1000dTableNodeNames } from './names.js';
import { isS1000DCellSelection } from './selection.js';

export type S1000DTableHoverKind = TableHoverKind;
export type S1000DTableSelectedAxisKind = TableSelectedAxisKind;
export type S1000DTableReference = TableReference<ProseMirrorNode>;
export type S1000DTableHoverState = TableHoverState;
export interface S1000DTableSelectedAxisState extends TableSelectedAxisState {
  tgroupIndex: number | null;
}
export type S1000DTableResizeState = TableResizeState;
export type S1000DTableContextTriggerState = TableContextTriggerState;
export type S1000DTableMenuScope = 'table' | 'row' | 'column' | 'cell';
export type S1000DTableHoverControlKind = 'table-handle' | 'row-handle' | 'column-handle' | 'cell' | null;

export interface S1000DTableMenuAnchor {
  left: number;
  top: number;
}

export interface S1000DTableInteractionState extends TableInteractionState<ProseMirrorNode, TableGeometry> {
  selectedAxis: S1000DTableSelectedAxisState;
  hoveredControl: S1000DTableHoverControlKind;
  hoveredTgroupIndex: number | null;
  menuScope: S1000DTableMenuScope | null;
  menuAnchor: S1000DTableMenuAnchor | null;
}

export interface S1000DTableInteractionMeta extends TableInteractionMeta<ProseMirrorNode, TableGeometry> {
  selectedAxis?: S1000DTableSelectedAxisState | null;
  hoveredControl?: S1000DTableHoverControlKind | undefined;
  hoveredTgroupIndex?: number | null | undefined;
  menuScope?: S1000DTableMenuScope | null | undefined;
  menuAnchor?: S1000DTableMenuAnchor | null | undefined;
}

const defaultInteractionState: S1000DTableInteractionState = {
  ...createDefaultTableInteractionState<ProseMirrorNode, TableGeometry>(),
  selectedAxis: {
    ...defaultTableSelectedAxisState,
    tgroupIndex: null,
  },
  hoveredControl: null,
  hoveredTgroupIndex: null,
  menuScope: null,
  menuAnchor: null,
};

export const s1000dTableInteractionPluginKey = new PluginKey<S1000DTableInteractionState>('s1000d-table-interaction');

export function createS1000DTableInteractionPlugin(): Plugin<S1000DTableInteractionState> {
  return new Plugin<S1000DTableInteractionState>({
    key: s1000dTableInteractionPluginKey,
    state: {
      init(_config, state) {
        return buildS1000DTableInteractionState(state, undefined);
      },
      apply(transaction, pluginState, _oldState, newState) {
        const meta = transaction.getMeta(s1000dTableInteractionPluginKey) as S1000DTableInteractionMeta | undefined;
        return buildS1000DTableInteractionState(newState, pluginState, meta, transaction.selectionSet);
      },
    },
  });
}

export function getS1000DTableInteractionState(state: EditorState): S1000DTableInteractionState {
  return s1000dTableInteractionPluginKey.getState(state) ?? defaultInteractionState;
}

export function findSelectedS1000DTable(selection: Selection): S1000DTableReference | null {
  return getSelectionTableReference(selection);
}

export function getS1000DTableContextTriggerState(
  activeTable: S1000DTableReference | null,
  tableSelected: boolean,
  selectedAxis: TableSelectedAxisState,
  geometry: TableGeometry | null,
): S1000DTableContextTriggerState {
  return deriveTableContextTriggerState(activeTable, tableSelected, selectedAxis, geometry);
}

export function setS1000DTableInteractionMeta(
  view: EditorView,
  meta: S1000DTableInteractionMeta,
): void {
  view.dispatch(view.state.tr.setMeta(s1000dTableInteractionPluginKey, meta));
}

export function openS1000DTableContextMenu(
  view: EditorView,
  options: {
    scope: S1000DTableMenuScope;
    anchor: S1000DTableMenuAnchor;
  },
): void {
  setS1000DTableInteractionMeta(view, {
    contextMenuOpen: true,
    menuScope: options.scope,
    menuAnchor: options.anchor,
  });
}

export function closeS1000DTableContextMenu(view: EditorView): void {
  setS1000DTableInteractionMeta(view, {
    contextMenuOpen: false,
    menuScope: null,
    menuAnchor: null,
  });
}

function buildS1000DTableInteractionState(
  state: EditorState,
  previous: S1000DTableInteractionState | undefined,
  meta: S1000DTableInteractionMeta = {},
  selectionChanged = false,
): S1000DTableInteractionState {
  const nextMenuScope =
    meta.menuScope !== undefined
      ? meta.menuScope
      : selectionChanged
        ? null
        : previous?.menuScope ?? null;
  const nextMenuAnchor =
    meta.menuAnchor !== undefined
      ? meta.menuAnchor
      : selectionChanged
        ? null
        : previous?.menuAnchor ?? null;

  const shared = buildTableInteractionState({
    state,
    selection: state.selection,
    previous,
    meta,
    selectionChanged,
    getSelectionTableReference,
    isTableNodeSelection,
    getSelectedAxisState: (selection, tableReference) => getSelectedAxisState(state, selection, tableReference),
    deriveContextTriggerState: getS1000DTableContextTriggerState,
    canOpenContextMenu: ({ contextTrigger, activeTable }) =>
      contextTrigger.visible || (
        nextMenuScope !== null
        && nextMenuAnchor !== null
        && hasSelectionMenuContext(state, activeTable?.tablePos ?? null)
      ),
  });

  const nextHoveredControl =
    meta.hoveredControl !== undefined
      ? meta.hoveredControl
      : selectionChanged
        ? null
        : previous?.hoveredControl ?? null;
  const nextHoveredTgroupIndex =
    meta.hoveredTgroupIndex !== undefined
      ? meta.hoveredTgroupIndex
      : selectionChanged
        ? null
        : previous?.hoveredTgroupIndex ?? null;

  return {
    ...shared,
    selectedAxis: {
      ...shared.selectedAxis,
      tgroupIndex:
        meta.selectedAxis?.tgroupIndex
        ?? (shared.selectedAxis as S1000DTableSelectedAxisState).tgroupIndex
        ?? previous?.selectedAxis.tgroupIndex
        ?? null,
    },
    hoveredControl: shared.hovered ? nextHoveredControl : null,
    hoveredTgroupIndex: shared.hovered ? nextHoveredTgroupIndex : null,
    menuScope: shared.contextMenuOpen ? nextMenuScope : null,
    menuAnchor: shared.contextMenuOpen ? nextMenuAnchor : null,
  };
}

function getSelectionTableReference(selection: Selection): S1000DTableReference | null {
  const located = findS1000DTableAroundSelection(selection);
  return located ? { tablePos: located.tablePos, table: located.table } : null;
}

function isTableNodeSelection(selection: Selection): selection is NodeSelection {
  return selection instanceof NodeSelection && selection.node.type.name === s1000dTableNodeNames.table;
}

function getSelectedAxisState(
  state: EditorState,
  selection: Selection,
  tableReference: S1000DTableReference,
): S1000DTableSelectedAxisState {
  if (!isS1000DCellSelection(selection)) {
    return {
      ...defaultTableSelectedAxisState,
      tgroupIndex: null,
    };
  }

  const selectionInfo = getS1000DSelectionInfo(state, { tablePos: tableReference.tablePos });
  if (!selectionInfo) {
    return {
      ...defaultTableSelectedAxisState,
      tgroupIndex: null,
    };
  }

  if (selection.isRowSelection() && selectionInfo.top === selectionInfo.bottom) {
    return {
      kind: 'row',
      index: selectionInfo.top,
      tablePos: tableReference.tablePos,
      tgroupIndex: selectionInfo.activeTgroupIndex,
    };
  }

  if (selection.isColSelection() && selectionInfo.left === selectionInfo.right) {
    return {
      kind: 'column',
      index: selectionInfo.left,
      tablePos: tableReference.tablePos,
      tgroupIndex: selectionInfo.activeTgroupIndex,
    };
  }

  return {
    ...defaultTableSelectedAxisState,
    tgroupIndex: null,
  };
}

function hasSelectionMenuContext(state: EditorState, tablePos: number | null): boolean {
  if (isTableNodeSelection(state.selection)) {
    return true;
  }

  const options = typeof tablePos === 'number' ? { tablePos } : {};
  return Boolean(
    getS1000DSelectionInfo(state, options)
    || isWholeS1000DTableSelection(state, options),
  );
}
