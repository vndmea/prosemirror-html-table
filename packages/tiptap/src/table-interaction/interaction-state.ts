import type { TableGeometry } from './dom-geometry.js';

export type TableHoverKind = 'table' | 'cell';
export type TableSelectedAxisKind = 'row' | 'column';

export interface TableReference<TTable = unknown> {
  tablePos: number;
  table: TTable;
}

export interface TableHoverState {
  kind: TableHoverKind;
  tablePos: number;
  rowIndex: number | null;
  columnIndex: number | null;
}

export interface TableSelectedAxisState {
  kind: TableSelectedAxisKind | null;
  index: number | null;
  tablePos: number | null;
}

export interface TableResizeState {
  tablePos: number;
  columnIndex: number;
}

export interface TableContextTriggerState {
  visible: boolean;
  left: number | null;
  top: number | null;
}

export interface TableInteractionState<TTable = unknown, TGeometry = TableGeometry> {
  activeTable: TableReference<TTable> | null;
  tableSelected: boolean;
  hovered: TableHoverState | null;
  selectedAxis: TableSelectedAxisState;
  selectedAxisExplicit?: boolean;
  contextTrigger: TableContextTriggerState;
  contextMenuOpen: boolean;
  geometry: TGeometry | null;
  resizing: TableResizeState | null;
}

export interface TableInteractionMeta<TTable = unknown, TGeometry = TableGeometry> {
  hovered?: TableHoverState | null;
  hoveredTable?: TableReference<TTable> | null;
  geometry?: TGeometry | null;
  resizing?: TableResizeState | null;
  selectedAxis?: TableSelectedAxisState | null;
  selectedAxisExplicit?: boolean | null;
  contextMenuOpen?: boolean | null;
}

export type TableInteractionGeometry = Pick<TableGeometry, 'tableRect' | 'visibleTableRect' | 'columns' | 'rows'>;

export interface BuildTableInteractionStateOptions<TState, TSelection, TTable = unknown, TGeometry extends TableInteractionGeometry = TableGeometry> {
  state: TState;
  selection: TSelection;
  previous?: TableInteractionState<TTable, TGeometry> | undefined;
  meta?: TableInteractionMeta<TTable, TGeometry> | undefined;
  selectionChanged?: boolean | undefined;
  getSelectionTableReference: (selection: TSelection) => TableReference<TTable> | null;
  isTableNodeSelection: (selection: TSelection) => boolean;
  getSelectedAxisState: (
    selection: TSelection,
    tableReference: TableReference<TTable>,
  ) => TableSelectedAxisState;
  deriveContextTriggerState?: (
    activeTable: TableReference<TTable> | null,
    tableSelected: boolean,
    selectedAxis: TableSelectedAxisState,
    geometry: TGeometry | null,
  ) => TableContextTriggerState;
  canOpenContextMenu?: (context: {
    state: TState;
    selection: TSelection;
    activeTable: TableReference<TTable> | null;
    tableSelected: boolean;
    selectedAxis: TableSelectedAxisState;
    contextTrigger: TableContextTriggerState;
    geometry: TGeometry | null;
  }) => boolean;
}

export const defaultTableSelectedAxisState: TableSelectedAxisState = {
  kind: null,
  index: null,
  tablePos: null,
};

export function createDefaultTableInteractionState<TTable = unknown, TGeometry = TableGeometry>(): TableInteractionState<TTable, TGeometry> {
  return {
    activeTable: null,
    tableSelected: false,
    hovered: null,
    selectedAxis: defaultTableSelectedAxisState,
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
}

export function buildTableInteractionState<TState, TSelection, TTable = unknown, TGeometry extends TableInteractionGeometry = TableGeometry>(
  options: BuildTableInteractionStateOptions<TState, TSelection, TTable, TGeometry>,
): TableInteractionState<TTable, TGeometry> {
  const {
    state,
    selection,
    previous,
    meta = {},
    selectionChanged = false,
    getSelectionTableReference,
    isTableNodeSelection,
    getSelectedAxisState,
    deriveContextTriggerState = deriveTableContextTriggerState,
    canOpenContextMenu,
  } = options;
  const selectionTable = getSelectionTableReference(selection);
  const activeTable = selectionTable ?? meta.hoveredTable ?? null;
  const tableSelected = isTableNodeSelection(selection);
  const derivedSelectedAxis = selectionTable ? getSelectedAxisState(selection, selectionTable) : defaultTableSelectedAxisState;
  const selectedAxis =
    meta.selectedAxis !== undefined
      ? meta.selectedAxis ?? defaultTableSelectedAxisState
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
    selectedAxisExplicit ? selectedAxis : defaultTableSelectedAxisState,
    geometry,
  );
  const allowContextMenu = canOpenContextMenu
    ? canOpenContextMenu({
      state,
      selection,
      activeTable,
      tableSelected,
      selectedAxis,
      contextTrigger,
      geometry,
    })
    : contextTrigger.visible;
  const contextMenuOpen =
    meta.contextMenuOpen !== undefined
      ? Boolean(meta.contextMenuOpen) && allowContextMenu
      : allowContextMenu && !selectionChanged
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

export function deriveTableContextTriggerState<TTable = unknown, TGeometry extends TableInteractionGeometry = TableGeometry>(
  activeTable: TableReference<TTable> | null,
  tableSelected: boolean,
  selectedAxis: TableSelectedAxisState,
  geometry: TGeometry | null,
): TableContextTriggerState {
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
