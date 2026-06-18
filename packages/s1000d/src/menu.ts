import type { EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

import {
  addS1000DColumnAfter,
  addS1000DColumnBefore,
  addS1000DRowAfter,
  addS1000DRowBefore,
  deleteS1000DColumn,
  deleteS1000DRow,
  duplicateS1000DColumn,
  duplicateS1000DRow,
  mergeOrSplitS1000DCell,
  mergeS1000DCells,
  moveS1000DColumnLeft,
  moveS1000DColumnRight,
  moveS1000DRowToBody,
  moveS1000DRowToFoot,
  moveS1000DRowToHead,
  moveS1000DRowDown,
  moveS1000DRowUp,
  setS1000DSelectedEntryAttrs,
  setS1000DSelectedEntryRawAttrs,
  splitS1000DCell,
} from './commands.js';
import { clearS1000DSelectedCells, getS1000DSelectionInfo } from './clipboard.js';
import {
  getS1000DTableInteractionState,
  type S1000DTableInteractionState,
  type S1000DTableMenuAnchor,
  type S1000DTableMenuScope,
} from './interaction.js';

export type S1000DContextMenuActionId = string;
export type S1000DContextMenuActionGroupId =
  | 'table'
  | 'insert'
  | 'structure'
  | 'reorder'
  | 'format'
  | 'content'
  | 'danger'
  | 'external';

export interface S1000DContextMenuAction {
  id: S1000DContextMenuActionId;
  label: string;
  enabled: boolean;
  group: S1000DContextMenuActionGroupId;
  destructive?: boolean;
  active?: boolean;
  run: (view: EditorView) => boolean | void;
}

export interface S1000DContextMenuActionGroup {
  id: S1000DContextMenuActionGroupId;
  label: string;
  actions: S1000DContextMenuAction[];
}

export interface S1000DContextMenuState {
  visible: boolean;
  open: boolean;
  scope: S1000DTableMenuScope | null;
  anchor: S1000DTableMenuAnchor | null;
  actions: S1000DContextMenuAction[];
  groups: S1000DContextMenuActionGroup[];
  primaryAction: S1000DContextMenuAction | null;
}

export interface S1000DContextTriggerButtonState {
  visible: boolean;
  expanded: boolean;
  scope: S1000DTableMenuScope | null;
  anchor: S1000DTableMenuAnchor | null;
  label: string | null;
  title: string | null;
  primaryAction: S1000DContextMenuAction | null;
  groups: S1000DContextMenuActionGroup[];
}

export interface S1000DContextMenuActionContext {
  state: EditorState;
  interaction: S1000DTableInteractionState;
  scope: S1000DTableMenuScope;
  selectionInfo: ReturnType<typeof getS1000DSelectionInfo> | undefined;
  view: EditorView | null;
}

export type S1000DContextMenuActionResolver = (
  context: S1000DContextMenuActionContext,
) => S1000DContextMenuAction[];

export interface S1000DContextMenuOptions {
  actionResolver?: S1000DContextMenuActionResolver | undefined;
  geometry?: S1000DTableInteractionState['geometry'] | undefined;
  view?: EditorView | null | undefined;
}

export function getS1000DContextMenuState(
  state: EditorState,
  interaction: S1000DTableInteractionState,
  options: S1000DContextMenuOptions = {},
): S1000DContextMenuState {
  const scope = getS1000DContextMenuScope(state, interaction);
  const selectionInfo = interaction.activeTable
    ? getS1000DSelectionInfo(state, { tablePos: interaction.activeTable.tablePos }) ?? getS1000DSelectionInfo(state)
    : getS1000DSelectionInfo(state);
  const anchor = getS1000DContextMenuAnchor(state, interaction, scope, selectionInfo, options.geometry);
  const builtInActions = scope ? getBuiltInContextMenuActions(scope, state, interaction, selectionInfo) : [];
  const extraActions = scope && options.actionResolver
    ? options.actionResolver({
      state,
      interaction,
      scope,
      selectionInfo,
      view: options.view ?? null,
    })
    : [];
  const actions = [...builtInActions, ...extraActions];
  const groups = groupContextMenuActions(actions);
  const primaryAction = actions.find((action) => action.enabled) ?? null;
  const visible = Boolean(scope && anchor && actions.length > 0);

  return {
    visible,
    open: Boolean(interaction.contextMenuOpen && visible),
    scope,
    anchor,
    actions,
    groups,
    primaryAction,
  };
}

export function getS1000DContextTriggerButtonState(
  state: EditorState,
  interaction: S1000DTableInteractionState,
  options: S1000DContextMenuOptions = {},
): S1000DContextTriggerButtonState {
  const menu = getS1000DContextMenuState(state, interaction, options);
  const interactionAnchor = (
    interaction.contextTrigger.visible
    && interaction.contextTrigger.left !== null
    && interaction.contextTrigger.top !== null
  )
    ? {
      left: interaction.contextTrigger.left,
      top: interaction.contextTrigger.top,
    }
    : null;
  const anchor = interactionAnchor ?? menu.anchor;
  const label = menu.scope ? TRIGGER_LABELS[menu.scope] : null;
  const title = label && menu.primaryAction ? `${label}: ${menu.primaryAction.label}` : label;

  return {
    visible: Boolean(menu.visible && anchor),
    expanded: Boolean(menu.open && anchor),
    scope: menu.scope,
    anchor,
    label,
    title,
    primaryAction: menu.primaryAction,
    groups: menu.groups,
  };
}

function getS1000DContextMenuScope(
  state: EditorState,
  interaction: S1000DTableInteractionState,
): S1000DTableMenuScope | null {
  if (!interaction.activeTable) {
    return null;
  }

  if (interaction.selectedAxis.kind === 'row') {
    return 'row';
  }

  if (interaction.selectedAxis.kind === 'column') {
    return 'column';
  }

  if (getS1000DSelectionInfo(state, { tablePos: interaction.activeTable.tablePos }) ?? getS1000DSelectionInfo(state)) {
    return 'cell';
  }

  return null;
}

function getS1000DContextMenuAnchor(
  _state: EditorState,
  interaction: S1000DTableInteractionState,
  scope: S1000DTableMenuScope | null,
  selectionInfo: ReturnType<typeof getS1000DSelectionInfo> | undefined,
  geometryOverride?: S1000DTableInteractionState['geometry'],
): S1000DTableMenuAnchor | null {
  if (!scope) {
    return null;
  }

  const geometry = geometryOverride ?? interaction.geometry;

  const selectedRowIndex = interaction.selectedAxis.index ?? (
    scope === 'row' && selectionInfo && selectionInfo.top === selectionInfo.bottom
      ? selectionInfo.top
      : null
  );
  if (geometry && scope === 'row' && selectedRowIndex !== null) {
    const row = geometry.rows[selectedRowIndex];
    if (!row) {
      return null;
    }
    const rowTop = geometry.tableRect.top + row.top;
    const rowBottom = rowTop + row.height;
    const visibleTop = Math.max(rowTop, geometry.visibleTableRect.top);
    const visibleBottom = Math.min(rowBottom, geometry.visibleTableRect.bottom);
    return {
      left: geometry.visibleTableRect.left,
      top: visibleTop + Math.max(0, visibleBottom - visibleTop) / 2,
    };
  }

  const selectedColumnIndex = interaction.selectedAxis.index ?? (
    scope === 'column' && selectionInfo && selectionInfo.left === selectionInfo.right
      ? selectionInfo.left
      : null
  );
  if (geometry && scope === 'column' && selectedColumnIndex !== null) {
    const column = geometry.columns[selectedColumnIndex];
    if (!column) {
      return null;
    }
    const columnLeft = geometry.tableRect.left + column.left;
    const columnRight = columnLeft + column.width;
    const visibleLeft = Math.max(columnLeft, geometry.visibleTableRect.left);
    const visibleRight = Math.min(columnRight, geometry.visibleTableRect.right);
    return {
      left: visibleLeft + Math.max(0, visibleRight - visibleLeft) / 2,
      top: geometry.visibleTableRect.top,
    };
  }

  if (geometry && scope === 'cell' && selectionInfo) {
    return {
      left: geometry.tableRect.left + ((geometry.columns[selectionInfo.right]?.left ?? 0) + (geometry.columns[selectionInfo.right]?.width ?? 0)),
      top: geometry.tableRect.top + (geometry.rows[selectionInfo.top]?.top ?? 0) + (((geometry.rows[selectionInfo.bottom]?.top ?? 0) + (geometry.rows[selectionInfo.bottom]?.height ?? 0) - (geometry.rows[selectionInfo.top]?.top ?? 0)) / 2),
    };
  }

  if (interaction.menuAnchor) {
    return interaction.menuAnchor;
  }

  if (
    interaction.contextTrigger.visible
    && interaction.contextTrigger.left !== null
    && interaction.contextTrigger.top !== null
  ) {
    return {
      left: interaction.contextTrigger.left,
      top: interaction.contextTrigger.top,
    };
  }

  return null;
}

function getBuiltInContextMenuActions(
  scope: S1000DTableMenuScope,
  state: EditorState,
  interaction: S1000DTableInteractionState,
  selectionInfo: ReturnType<typeof getS1000DSelectionInfo> | undefined,
): S1000DContextMenuAction[] {
  if (scope === 'table') {
    return [];
  }

  if (scope === 'row') {
    return [
      commandAction(state, 'add-row-before', 'Add row before', 'insert', addS1000DRowBefore()),
      commandAction(state, 'add-row-after', 'Add row after', 'insert', addS1000DRowAfter()),
      ...getBackgroundColorActions(state, 'row', selectionInfo),
      commandAction(state, 'move-row-up', 'Move row up', 'reorder', moveS1000DRowUp()),
      commandAction(state, 'move-row-down', 'Move row down', 'reorder', moveS1000DRowDown()),
      commandAction(state, 'duplicate-row', 'Duplicate row', 'reorder', duplicateS1000DRow()),
      commandAction(state, 'move-row-to-head', 'Move row to head', 'structure', moveS1000DRowToHead()),
      commandAction(state, 'move-row-to-body', 'Move row to body', 'structure', moveS1000DRowToBody()),
      commandAction(state, 'move-row-to-foot', 'Move row to foot', 'structure', moveS1000DRowToFoot()),
      createAction('clear-row-cells', 'Clear row contents', 'content', canClearSelection(state), (view) =>
        clearS1000DSelectedCells(view.state, view.dispatch),
      ),
      commandAction(state, 'delete-row', 'Delete row', 'danger', deleteS1000DRow(), { destructive: true }),
      ...getAlignmentActions(state, 'row', selectionInfo),
    ];
  }

  if (scope === 'column') {
    return [
      commandAction(state, 'add-column-before', 'Add column before', 'insert', addS1000DColumnBefore()),
      commandAction(state, 'add-column-after', 'Add column after', 'insert', addS1000DColumnAfter()),
      commandAction(state, 'move-column-left', 'Move column left', 'reorder', moveS1000DColumnLeft()),
      commandAction(state, 'move-column-right', 'Move column right', 'reorder', moveS1000DColumnRight()),
      ...getBackgroundColorActions(state, 'column', selectionInfo),
      createAction('clear-column-cells', 'Clear column contents', 'content', canClearSelection(state), (view) =>
        clearS1000DSelectedCells(view.state, view.dispatch),
      ),
      commandAction(state, 'duplicate-column', 'Duplicate column', 'reorder', duplicateS1000DColumn()),
      commandAction(state, 'delete-column', 'Delete column', 'danger', deleteS1000DColumn(), { destructive: true }),
      ...getAlignmentActions(state, 'column', selectionInfo),
    ];
  }

  return [
    ...getBackgroundColorActions(state, 'cell', selectionInfo),
    commandAction(state, 'merge-cells', 'Merge cells', 'structure', mergeS1000DCells()),
    commandAction(state, 'split-cell', 'Split cell', 'structure', splitS1000DCell()),
    commandAction(state, 'merge-or-split-cell', 'Merge or split', 'structure', mergeOrSplitS1000DCell()),
    createAction('clear-selection', 'Clear selected cells', 'danger', canClearSelection(state), (view) =>
      clearS1000DSelectedCells(view.state, view.dispatch),
      { destructive: true },
    ),
    ...getAlignmentActions(state, 'cell', selectionInfo),
  ];
}

function getAlignmentActions(
  state: EditorState,
  _scope: S1000DTableMenuScope,
  selectionInfo: ReturnType<typeof getS1000DSelectionInfo> | undefined,
): S1000DContextMenuAction[] {
  const align = getCommonSelectedAttribute(selectionInfo, 'align');
  const valign = getCommonSelectedAttribute(selectionInfo, 'valign');

  return [
    commandAction(state, 'set-align-left', 'Align left', 'format', setS1000DSelectedEntryAttrs({ align: 'left' }), {
      active: align === 'left',
    }),
    commandAction(state, 'set-align-center', 'Align center', 'format', setS1000DSelectedEntryAttrs({ align: 'center' }), {
      active: align === 'center',
    }),
    commandAction(state, 'set-align-right', 'Align right', 'format', setS1000DSelectedEntryAttrs({ align: 'right' }), {
      active: align === 'right',
    }),
    commandAction(state, 'set-valign-top', 'Align top', 'format', setS1000DSelectedEntryAttrs({ valign: 'top' }), {
      active: valign === 'top',
    }),
    commandAction(state, 'set-valign-middle', 'Align middle', 'format', setS1000DSelectedEntryAttrs({ valign: 'middle' }), {
      active: valign === 'middle',
    }),
    commandAction(state, 'set-valign-bottom', 'Align bottom', 'format', setS1000DSelectedEntryAttrs({ valign: 'bottom' }), {
      active: valign === 'bottom',
    }),
  ];
}

function getBackgroundColorActions(
  state: EditorState,
  _scope: S1000DTableMenuScope,
  selectionInfo: ReturnType<typeof getS1000DSelectionInfo> | undefined,
): S1000DContextMenuAction[] {
  const backgroundColor = getCommonSelectedRawAttribute(selectionInfo, 'bgcolor');

  return [
    commandAction(state, 'set-background-blue', 'Background blue', 'format', setS1000DSelectedEntryRawAttrs({ bgcolor: '#dbeafe' }), {
      active: backgroundColor === '#dbeafe',
    }),
    commandAction(state, 'set-background-green', 'Background green', 'format', setS1000DSelectedEntryRawAttrs({ bgcolor: '#dcfce7' }), {
      active: backgroundColor === '#dcfce7',
    }),
    commandAction(state, 'set-background-yellow', 'Background yellow', 'format', setS1000DSelectedEntryRawAttrs({ bgcolor: '#fef3c7' }), {
      active: backgroundColor === '#fef3c7',
    }),
    commandAction(state, 'clear-background', 'Clear background', 'format', setS1000DSelectedEntryRawAttrs({ bgcolor: null }), {
      active: backgroundColor == null,
    }),
  ];
}

function getCommonSelectedAttribute(
  selectionInfo: ReturnType<typeof getS1000DSelectionInfo> | undefined,
  name: 'align' | 'valign',
) {
  if (!selectionInfo || selectionInfo.entries.length === 0) {
    return undefined;
  }

  const value = selectionInfo.entries[0]?.node.attrs[name];
  return selectionInfo.entries.every((entry) => entry.node.attrs[name] === value) ? value : undefined;
}

function getCommonSelectedRawAttribute(
  selectionInfo: ReturnType<typeof getS1000DSelectionInfo> | undefined,
  name: string,
): string | null | undefined {
  if (!selectionInfo || selectionInfo.entries.length === 0) {
    return undefined;
  }

  const value = readEntryRawAttribute(selectionInfo.entries[0]?.node.attrs.rawAttrs, name);
  return selectionInfo.entries.every((entry) => readEntryRawAttribute(entry.node.attrs.rawAttrs, name) === value)
    ? value
    : undefined;
}

function readEntryRawAttribute(rawAttrs: unknown, name: string): string | null {
  if (!rawAttrs || typeof rawAttrs !== 'object' || Array.isArray(rawAttrs)) {
    return null;
  }

  const value = (rawAttrs as Record<string, unknown>)[name];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function canClearSelection(state: EditorState) {
  return Boolean(getS1000DSelectionInfo(state));
}

function commandAction(
  state: EditorState,
  id: string,
  label: string,
  group: S1000DContextMenuActionGroupId,
  command: (state: EditorState, dispatch?: EditorView['dispatch']) => boolean,
  overrides: Partial<Omit<S1000DContextMenuAction, 'id' | 'label' | 'group'>> = {},
): S1000DContextMenuAction {
  return createAction(
    id,
    label,
    group,
    overrides.enabled ?? command(state, undefined),
    (view) => command(view.state, view.dispatch),
    overrides,
  );
}

function createAction(
  id: string,
  label: string,
  group: S1000DContextMenuActionGroupId,
  enabled: boolean,
  run: (view: EditorView) => boolean | void,
  options: Partial<Pick<S1000DContextMenuAction, 'destructive' | 'active'>> = {},
): S1000DContextMenuAction {
  return {
    id,
    label,
    group,
    enabled,
    run,
    ...options,
  };
}

function groupContextMenuActions(actions: S1000DContextMenuAction[]): S1000DContextMenuActionGroup[] {
  const grouped = new Map<S1000DContextMenuActionGroupId, S1000DContextMenuAction[]>();
  for (const action of actions) {
    const existing = grouped.get(action.group) ?? [];
    existing.push(action);
    grouped.set(action.group, existing);
  }

  return GROUP_ORDER
    .map((groupId) => {
      const groupActions = grouped.get(groupId) ?? [];
      return groupActions.length > 0
        ? {
          id: groupId,
          label: GROUP_LABELS[groupId],
          actions: groupActions,
        }
        : null;
    })
    .filter((group): group is S1000DContextMenuActionGroup => group !== null);
}

const GROUP_ORDER: S1000DContextMenuActionGroupId[] = [
  'table',
  'insert',
  'structure',
  'reorder',
  'format',
  'content',
  'danger',
  'external',
];

const GROUP_LABELS: Record<S1000DContextMenuActionGroupId, string> = {
  table: 'Table',
  insert: 'Insert',
  structure: 'Structure',
  reorder: 'Reorder',
  format: 'Format',
  content: 'Content',
  danger: 'Danger',
  external: 'More',
};

const TRIGGER_LABELS: Record<S1000DTableMenuScope, string> = {
  table: 'Table actions',
  row: 'Row actions',
  column: 'Column actions',
  cell: 'Cell actions',
};
