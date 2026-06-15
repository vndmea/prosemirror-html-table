import { NodeSelection, TextSelection, type EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

import {
  addS1000DColumnAfter,
  addS1000DColumnBefore,
  addS1000DRowAfter,
  addS1000DRowBefore,
  deleteS1000DColumn,
  deleteS1000DRow,
  findS1000DTableContext,
  mergeOrSplitS1000DCell,
  mergeS1000DCells,
  moveS1000DColumnLeft,
  moveS1000DColumnRight,
  moveS1000DRowDown,
  moveS1000DRowUp,
  splitS1000DCell,
} from './commands.js';
import { clearS1000DSelectedCells, getS1000DSelectionInfo, isWholeS1000DTableSelection } from './clipboard.js';
import type { S1000DActiveTableContext } from './context.js';
import { replaceS1000DEntries, replaceS1000DTable } from './mutation.js';
import { s1000dTableNodeNames } from './names.js';
import { findS1000DEntryPosition } from './position.js';
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
  const anchor = getS1000DContextMenuAnchor(state, interaction, scope, selectionInfo);
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

  if (
    state.selection instanceof NodeSelection
    && state.selection.node.type.name === s1000dTableNodeNames.table
  ) {
    return 'table';
  }

  if (isWholeS1000DTableSelection(state, { tablePos: interaction.activeTable.tablePos })) {
    return 'table';
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
): S1000DTableMenuAnchor | null {
  if (!scope) {
    return null;
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

  if (!interaction.geometry) {
    return null;
  }

  if (scope === 'table') {
    return {
      left: interaction.geometry.visibleTableRect.left,
      top: interaction.geometry.visibleTableRect.top,
    };
  }

  if (scope === 'row' && interaction.selectedAxis.index !== null) {
    const row = interaction.geometry.rows[interaction.selectedAxis.index];
    if (!row) {
      return null;
    }
    return {
      left: interaction.geometry.visibleTableRect.left,
      top: interaction.geometry.tableRect.top + row.top + (row.height / 2),
    };
  }

  if (scope === 'column' && interaction.selectedAxis.index !== null) {
    const column = interaction.geometry.columns[interaction.selectedAxis.index];
    if (!column) {
      return null;
    }
    return {
      left: interaction.geometry.tableRect.left + column.left + (column.width / 2),
      top: interaction.geometry.visibleTableRect.top,
    };
  }

  if (scope === 'cell' && selectionInfo) {
    return {
      left: interaction.geometry.tableRect.left + ((interaction.geometry.columns[selectionInfo.right]?.left ?? 0) + (interaction.geometry.columns[selectionInfo.right]?.width ?? 0)),
      top: interaction.geometry.tableRect.top + (interaction.geometry.rows[selectionInfo.top]?.top ?? 0) + (((interaction.geometry.rows[selectionInfo.bottom]?.top ?? 0) + (interaction.geometry.rows[selectionInfo.bottom]?.height ?? 0) - (interaction.geometry.rows[selectionInfo.top]?.top ?? 0)) / 2),
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
    return [
      createAction('select-table', 'Select table', 'table', true, (view) => {
        const activeTable = getS1000DTableInteractionState(view.state).activeTable;
        if (!activeTable) return false;
        view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, activeTable.tablePos)).scrollIntoView());
        view.focus();
        return true;
      }),
      createAction('delete-table', 'Delete table', 'danger', true, (view) => {
        const interactionState = getS1000DTableInteractionState(view.state);
        const activeTable = interactionState.activeTable;
        if (!activeTable) return false;
        const paragraph = view.state.schema.nodes.paragraph?.createAndFill();
        const tr = paragraph && view.state.doc.childCount === 1
          ? view.state.tr.replaceWith(activeTable.tablePos, activeTable.tablePos + activeTable.table.nodeSize, paragraph)
          : view.state.tr.delete(activeTable.tablePos, activeTable.tablePos + activeTable.table.nodeSize);
        view.dispatch(tr.scrollIntoView());
        view.focus();
        return true;
      }, { destructive: true }),
    ];
  }

  if (scope === 'row') {
    return [
      commandAction(state, 'add-row-before', 'Add row before', 'insert', addS1000DRowBefore()),
      commandAction(state, 'add-row-after', 'Add row after', 'insert', addS1000DRowAfter()),
      commandAction(state, 'move-row-up', 'Move row up', 'reorder', moveS1000DRowUp()),
      commandAction(state, 'move-row-down', 'Move row down', 'reorder', moveS1000DRowDown()),
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
      createAction('clear-column-cells', 'Clear column contents', 'content', canClearSelection(state), (view) =>
        clearS1000DSelectedCells(view.state, view.dispatch),
      ),
      commandAction(state, 'delete-column', 'Delete column', 'danger', deleteS1000DColumn(), { destructive: true }),
      ...getAlignmentActions(state, 'column', selectionInfo),
    ];
  }

  return [
    createAction('select-cell', 'Select current cell', 'structure', true, (view) => {
      const tableContext = findS1000DTableContext(view.state);
      if (!tableContext?.activeTgroup) return false;
      const info = getS1000DSelectionInfo(view.state, { tablePos: tableContext.tablePos }) ?? getS1000DSelectionInfo(view.state);
      const entryPos = info?.anchorEntry ? findS1000DEntryPosition(tableContext, info.anchorEntry) : null;
      if (typeof entryPos !== 'number') return false;
      view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(entryPos + 1))).scrollIntoView());
      view.focus();
      return true;
    }),
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
  scope: S1000DTableMenuScope,
  selectionInfo: ReturnType<typeof getS1000DSelectionInfo> | undefined,
): S1000DContextMenuAction[] {
  const align = getCommonSelectedAttribute(selectionInfo, 'align');
  const valign = getCommonSelectedAttribute(selectionInfo, 'valign');

  return [
    createAction('set-align-left', 'Align left', 'format', scope === 'cell' || scope === 'row' || scope === 'column', (view) =>
      updateSelectedEntriesAttributes(view, { align: 'left' }),
      { active: align === 'left' },
    ),
    createAction('set-align-center', 'Align center', 'format', scope === 'cell' || scope === 'row' || scope === 'column', (view) =>
      updateSelectedEntriesAttributes(view, { align: 'center' }),
      { active: align === 'center' },
    ),
    createAction('set-align-right', 'Align right', 'format', scope === 'cell' || scope === 'row' || scope === 'column', (view) =>
      updateSelectedEntriesAttributes(view, { align: 'right' }),
      { active: align === 'right' },
    ),
    createAction('set-valign-top', 'Align top', 'format', scope === 'cell' || scope === 'row' || scope === 'column', (view) =>
      updateSelectedEntriesAttributes(view, { valign: 'top' }),
      { active: valign === 'top' },
    ),
    createAction('set-valign-middle', 'Align middle', 'format', scope === 'cell' || scope === 'row' || scope === 'column', (view) =>
      updateSelectedEntriesAttributes(view, { valign: 'middle' }),
      { active: valign === 'middle' },
    ),
    createAction('set-valign-bottom', 'Align bottom', 'format', scope === 'cell' || scope === 'row' || scope === 'column', (view) =>
      updateSelectedEntriesAttributes(view, { valign: 'bottom' }),
      { active: valign === 'bottom' },
    ),
  ];
}

function updateSelectedEntriesAttributes(
  view: EditorView,
  attrs: Record<string, unknown>,
): boolean {
  const context = findS1000DTableContext(view.state);
  if (!context?.activeTgroup) {
    return false;
  }
  const activeContext = context as S1000DActiveTableContext;

  const selectionInfo = getS1000DSelectionInfo(view.state, { tablePos: context.tablePos }) ?? getS1000DSelectionInfo(view.state);
  if (!selectionInfo) {
    return false;
  }

  const replacements = new Map(
    selectionInfo.entries.map((entry) => [
      entry,
      entry.node.type.create({
        ...entry.node.attrs,
        ...attrs,
      }, entry.node.content, entry.node.marks),
    ]),
  );
  const nextTable = replaceS1000DEntries(activeContext, replacements);
  return replaceS1000DTable(view.state, view.dispatch, activeContext, nextTable);
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
