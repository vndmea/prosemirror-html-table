import { NodeSelection, TextSelection, type Command, type EditorState } from '@tiptap/pm/state';
import {
  addColumnAfter,
  addColumnBefore,
  addFootSection,
  addHeadSection,
  addRowAfter,
  addRowBefore,
  clearColumnContent,
  clearRowContent,
  clearSelectedCells,
  deleteColumn,
  deleteRow,
  deleteTable,
  duplicateColumn,
  duplicateRow,
  mergeOrSplit,
  moveColumnLeft,
  moveColumnRight,
  moveRowDown,
  moveRowToBody,
  moveRowToFoot,
  moveRowToHead,
  moveRowUp,
  removeColgroup,
  removeFootSection,
  removeHeadSection,
  setColgroup,
  sortBodyRowsByColumn,
  toggleHeaderCell,
  type HtmlTableCommandOptions,
} from 'prosemirror-html-table';

import type { HtmlTableInteractionState } from './html-table-interaction.js';
import {
  getHtmlTableSelectionScope,
  type HtmlTableSelectionScope,
} from './html-table-handles.js';
import { getTableSelectionInfo } from './table-utils.js';

export type HtmlTableContextActionId =
  | 'deleteTable'
  | 'toggleColgroup'
  | 'toggleHeadSection'
  | 'toggleFootSection'
  | 'addRowBefore'
  | 'addRowAfter'
  | 'deleteRow'
  | 'moveRowUp'
  | 'moveRowDown'
  | 'duplicateRow'
  | 'clearRowContent'
  | 'moveRowToHead'
  | 'moveRowToBody'
  | 'moveRowToFoot'
  | 'addColumnBefore'
  | 'addColumnAfter'
  | 'deleteColumn'
  | 'moveColumnLeft'
  | 'moveColumnRight'
  | 'duplicateColumn'
  | 'clearColumnContent'
  | 'sortBodyRowsAsc'
  | 'sortBodyRowsDesc'
  | 'clearSelectedCells'
  | 'mergeOrSplitCells'
  | 'toggleHeaderCell';

export interface HtmlTableContextAction {
  id: HtmlTableContextActionId;
  label: string;
  scope: HtmlTableSelectionScope;
  enabled: boolean;
  active?: boolean;
  destructive?: boolean;
}

export type HtmlTableContextActionGroupId =
  | 'table'
  | 'insert'
  | 'structure'
  | 'reorder'
  | 'section'
  | 'content'
  | 'danger';

export interface HtmlTableContextActionGroup {
  id: HtmlTableContextActionGroupId;
  label: string;
  actions: HtmlTableContextAction[];
}

export function getHtmlTableContextActions(
  state: EditorState,
  interaction: HtmlTableInteractionState,
  options: HtmlTableCommandOptions = {},
): HtmlTableContextAction[] {
  const table = interaction.activeTable?.table;
  const tablePos = interaction.activeTable?.tablePos ?? null;
  const selectionInfo = getTableSelectionInfo(state.doc, state.selection);
  const scope = tablePos !== null ? getHtmlTableSelectionScope(interaction, tablePos, selectionInfo) : null;

  if (!table || tablePos === null || !scope) {
    return [];
  }

  if (scope === 'table') {
    const hasColgroup = hasChild(table, 'htmlTableColgroup');
    const hasHead = hasChild(table, 'htmlTableHead');
    const hasFoot = hasChild(table, 'htmlTableFoot');

    return [
      createAction('deleteTable', scope, resolveTableScopeCommand('deleteTable', false, options), state, { destructive: true }),
      createAction(
        'toggleColgroup',
        scope,
        resolveTableScopeCommand('toggleColgroup', hasColgroup, options),
        state,
        { active: hasColgroup },
      ),
      createAction(
        'toggleHeadSection',
        scope,
        resolveTableScopeCommand('toggleHeadSection', hasHead, options),
        state,
        { active: hasHead },
      ),
      createAction(
        'toggleFootSection',
        scope,
        resolveTableScopeCommand('toggleFootSection', hasFoot, options),
        state,
        { active: hasFoot },
      ),
    ];
  }

  if (scope === 'row') {
    return [
      createAction('addRowBefore', scope, addRowBefore(options), state),
      createAction('addRowAfter', scope, addRowAfter(options), state),
      createAction('deleteRow', scope, deleteRow(options), state, { destructive: true }),
      createAction('moveRowUp', scope, moveRowUp(options), state),
      createAction('moveRowDown', scope, moveRowDown(options), state),
      createAction('duplicateRow', scope, duplicateRow(options), state),
      createAction('clearRowContent', scope, clearRowContent(options), state),
      createAction('moveRowToHead', scope, moveRowToHead(options), state),
      createAction('moveRowToBody', scope, moveRowToBody(options), state),
      createAction('moveRowToFoot', scope, moveRowToFoot(options), state),
    ];
  }

  if (scope === 'column') {
    return [
      createAction('addColumnBefore', scope, addColumnBefore(options), state),
      createAction('addColumnAfter', scope, addColumnAfter(options), state),
      createAction('deleteColumn', scope, deleteColumn(options), state, { destructive: true }),
      createAction('moveColumnLeft', scope, moveColumnLeft(options), state),
      createAction('moveColumnRight', scope, moveColumnRight(options), state),
      createAction('duplicateColumn', scope, duplicateColumn(options), state),
      createAction('clearColumnContent', scope, clearColumnContent(options), state),
      createAction('sortBodyRowsAsc', scope, sortBodyRowsByColumn({ direction: 'asc', ...options }), state),
      createAction('sortBodyRowsDesc', scope, sortBodyRowsByColumn({ direction: 'desc', ...options }), state),
    ];
  }

  return [
    createAction('clearSelectedCells', scope, clearSelectedCells(options), state),
    createAction('mergeOrSplitCells', scope, mergeOrSplit(options), state),
    createAction('toggleHeaderCell', scope, toggleHeaderCell(options), state),
  ];
}

export function getHtmlTableContextActionCommand(
  action: HtmlTableContextAction,
  options: HtmlTableCommandOptions = {},
): Command {
  switch (action.id) {
    case 'deleteTable':
      return resolveTableScopeCommand(action.id, false, options);
    case 'toggleColgroup':
      return resolveTableScopeCommand(action.id, Boolean(action.active), options);
    case 'toggleHeadSection':
      return resolveTableScopeCommand(action.id, Boolean(action.active), options);
    case 'toggleFootSection':
      return resolveTableScopeCommand(action.id, Boolean(action.active), options);
    case 'addRowBefore':
      return addRowBefore(options);
    case 'addRowAfter':
      return addRowAfter(options);
    case 'deleteRow':
      return deleteRow(options);
    case 'moveRowUp':
      return moveRowUp(options);
    case 'moveRowDown':
      return moveRowDown(options);
    case 'duplicateRow':
      return duplicateRow(options);
    case 'clearRowContent':
      return clearRowContent(options);
    case 'moveRowToHead':
      return moveRowToHead(options);
    case 'moveRowToBody':
      return moveRowToBody(options);
    case 'moveRowToFoot':
      return moveRowToFoot(options);
    case 'addColumnBefore':
      return addColumnBefore(options);
    case 'addColumnAfter':
      return addColumnAfter(options);
    case 'deleteColumn':
      return deleteColumn(options);
    case 'moveColumnLeft':
      return moveColumnLeft(options);
    case 'moveColumnRight':
      return moveColumnRight(options);
    case 'duplicateColumn':
      return duplicateColumn(options);
    case 'clearColumnContent':
      return clearColumnContent(options);
    case 'sortBodyRowsAsc':
      return sortBodyRowsByColumn({ direction: 'asc', ...options });
    case 'sortBodyRowsDesc':
      return sortBodyRowsByColumn({ direction: 'desc', ...options });
    case 'clearSelectedCells':
      return clearSelectedCells(options);
    case 'mergeOrSplitCells':
      return mergeOrSplit(options);
    case 'toggleHeaderCell':
      return toggleHeaderCell(options);
  }
}

export function getHtmlTableContextActionGroups(
  actions: HtmlTableContextAction[],
): HtmlTableContextActionGroup[] {
  const grouped = new Map<HtmlTableContextActionGroupId, HtmlTableContextAction[]>();

  for (const action of actions) {
    const groupId = ACTION_GROUPS[action.id];
    const groupActions = grouped.get(groupId) ?? [];
    groupActions.push(action);
    grouped.set(groupId, groupActions);
  }

  return ACTION_GROUP_ORDER
    .map((id) => {
      const groupActions = grouped.get(id);
      if (!groupActions?.length) {
        return null;
      }

      return {
        id,
        label: ACTION_GROUP_LABELS[id],
        actions: groupActions,
      } satisfies HtmlTableContextActionGroup;
    })
    .filter((group): group is HtmlTableContextActionGroup => group !== null);
}

export function getPrimaryHtmlTableContextAction(
  actions: HtmlTableContextAction[],
): HtmlTableContextAction | null {
  for (const id of PRIMARY_ACTION_ORDER) {
    const action = actions.find((item) => item.id === id && item.enabled);
    if (action) {
      return action;
    }
  }

  return actions.find((action) => action.enabled) ?? null;
}

function resolveTableScopeCommand(
  id: Extract<HtmlTableContextActionId, 'deleteTable' | 'toggleColgroup' | 'toggleHeadSection' | 'toggleFootSection'>,
  active: boolean,
  options: HtmlTableCommandOptions,
): Command {
  const baseCommand =
    id === 'deleteTable'
      ? deleteTable(options)
      : id === 'toggleColgroup'
        ? active ? removeColgroup(options) : setColgroup(undefined, options)
        : id === 'toggleHeadSection'
          ? active ? removeHeadSection(options) : addHeadSection(options)
          : active ? removeFootSection(options) : addFootSection(options);

  return (state, dispatch) => {
    const directApplied = baseCommand(state, dispatch);
    if (directApplied || !(state.selection instanceof NodeSelection) || state.selection.node.type.name !== 'htmlTable') {
      return directApplied;
    }

    const firstCellPos = findFirstTableCellPos(state.selection.node, state.selection.from);
    if (firstCellPos === undefined) {
      return false;
    }

    const selectionState = state.apply(
      state.tr.setSelection(TextSelection.near(state.doc.resolve(firstCellPos + 1))),
    );

    return baseCommand(selectionState, dispatch);
  };
}

function createAction(
  id: HtmlTableContextActionId,
  scope: HtmlTableSelectionScope,
  command: Command,
  state: EditorState,
  meta: Pick<HtmlTableContextAction, 'active' | 'destructive'> = {},
): HtmlTableContextAction {
  return {
    id,
    label: ACTION_LABELS[id],
    scope,
    enabled: command(state),
    ...meta,
  };
}

function hasChild(table: NonNullable<HtmlTableInteractionState['activeTable']>['table'], typeName: string): boolean {
  for (let index = 0; index < table.childCount; index += 1) {
    if (table.child(index).type.name === typeName) {
      return true;
    }
  }

  return false;
}

function findFirstTableCellPos(table: NonNullable<HtmlTableInteractionState['activeTable']>['table'], tablePos: number): number | undefined {
  let found: number | undefined;

  table.descendants((node, pos) => {
    if (node.type.name === 'htmlTableCell' || node.type.name === 'htmlTableHeaderCell') {
      found = tablePos + 1 + pos;
      return false;
    }

    return true;
  });

  return found;
}

const ACTION_LABELS: Record<HtmlTableContextActionId, string> = {
  deleteTable: 'Delete table',
  toggleColgroup: 'Toggle colgroup',
  toggleHeadSection: 'Toggle header section',
  toggleFootSection: 'Toggle footer section',
  addRowBefore: 'Add row before',
  addRowAfter: 'Add row after',
  deleteRow: 'Delete row',
  moveRowUp: 'Move row up',
  moveRowDown: 'Move row down',
  duplicateRow: 'Duplicate row',
  clearRowContent: 'Clear row',
  moveRowToHead: 'Move row to header',
  moveRowToBody: 'Move row to body',
  moveRowToFoot: 'Move row to footer',
  addColumnBefore: 'Add column before',
  addColumnAfter: 'Add column after',
  deleteColumn: 'Delete column',
  moveColumnLeft: 'Move column left',
  moveColumnRight: 'Move column right',
  duplicateColumn: 'Duplicate column',
  clearColumnContent: 'Clear column',
  sortBodyRowsAsc: 'Sort ascending',
  sortBodyRowsDesc: 'Sort descending',
  clearSelectedCells: 'Clear selected cells',
  mergeOrSplitCells: 'Merge or split cells',
  toggleHeaderCell: 'Toggle header cell',
};

const ACTION_GROUPS: Record<HtmlTableContextActionId, HtmlTableContextActionGroupId> = {
  deleteTable: 'danger',
  toggleColgroup: 'table',
  toggleHeadSection: 'table',
  toggleFootSection: 'table',
  addRowBefore: 'insert',
  addRowAfter: 'insert',
  deleteRow: 'danger',
  moveRowUp: 'reorder',
  moveRowDown: 'reorder',
  duplicateRow: 'structure',
  clearRowContent: 'content',
  moveRowToHead: 'section',
  moveRowToBody: 'section',
  moveRowToFoot: 'section',
  addColumnBefore: 'insert',
  addColumnAfter: 'insert',
  deleteColumn: 'danger',
  moveColumnLeft: 'reorder',
  moveColumnRight: 'reorder',
  duplicateColumn: 'structure',
  clearColumnContent: 'content',
  sortBodyRowsAsc: 'structure',
  sortBodyRowsDesc: 'structure',
  clearSelectedCells: 'content',
  mergeOrSplitCells: 'structure',
  toggleHeaderCell: 'structure',
};

const ACTION_GROUP_ORDER: HtmlTableContextActionGroupId[] = [
  'table',
  'insert',
  'structure',
  'reorder',
  'section',
  'content',
  'danger',
];

const ACTION_GROUP_LABELS: Record<HtmlTableContextActionGroupId, string> = {
  table: 'Table',
  insert: 'Insert',
  structure: 'Structure',
  reorder: 'Reorder',
  section: 'Section',
  content: 'Content',
  danger: 'Danger',
};

const PRIMARY_ACTION_ORDER: HtmlTableContextActionId[] = [
  'toggleHeadSection',
  'addRowAfter',
  'addColumnAfter',
  'mergeOrSplitCells',
  'toggleColgroup',
  'toggleFootSection',
  'duplicateRow',
  'duplicateColumn',
  'clearSelectedCells',
];
