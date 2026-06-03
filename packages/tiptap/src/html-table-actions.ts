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
  removeCaption,
  removeColgroup,
  removeFootSection,
  removeHeadSection,
  setCellBackgroundColor,
  setCaption,
  setCellTextAlign,
  setCellVerticalAlign,
  setColgroup,
  sortBodyRowsByColumn,
  toggleHeaderCell,
  toggleHeaderColumn,
  toggleHeaderRow,
  type HtmlTableCommandOptions,
} from 'prosemirror-html-table';

import { htmlTableInteractionPluginKey, type HtmlTableInteractionState } from './html-table-interaction.js';
import {
  getHtmlTableSelectionScope,
  type HtmlTableSelectionScope,
} from './html-table-handles.js';
import {
  createColumnSelectionTransaction,
  createRowSelectionTransaction,
  getTableSelectionInfo,
} from './table-utils.js';

export type HtmlTableContextActionId =
  | 'deleteTable'
  | 'toggleCaption'
  | 'toggleColgroup'
  | 'toggleHeadSection'
  | 'toggleFootSection'
  | 'addRowBefore'
  | 'addRowAfter'
  | 'deleteRow'
  | 'moveRowUp'
  | 'moveRowDown'
  | 'duplicateRow'
  | 'toggleHeaderRow'
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
  | 'toggleHeaderColumn'
  | 'clearColumnContent'
  | 'sortBodyRowsAsc'
  | 'sortBodyRowsDesc'
  | 'setCellTextAlignLeft'
  | 'setCellTextAlignCenter'
  | 'setCellTextAlignRight'
  | 'setCellBackgroundColorBlue'
  | 'setCellBackgroundColorGreen'
  | 'setCellBackgroundColorYellow'
  | 'clearCellBackgroundColor'
  | 'setCellVerticalAlignTop'
  | 'setCellVerticalAlignMiddle'
  | 'setCellVerticalAlignBottom'
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
  | 'format'
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

export type HtmlTableContextActionMenuItemRole = 'menuitem';

export interface HtmlTableContextActionMenuItemState {
  role: HtmlTableContextActionMenuItemRole;
  checked: boolean | null;
}

export interface HtmlTableContextActionShortcutState {
  ariaKeyshortcuts: string | null;
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
    const hasCaption = hasChild(table, 'htmlTableCaption');
    const hasColgroup = hasChild(table, 'htmlTableColgroup');
    const hasHead = hasChild(table, 'htmlTableHead');
    const hasFoot = hasChild(table, 'htmlTableFoot');

    return [
      createAction('deleteTable', scope, resolveTableScopeCommand('deleteTable', false, options), state, { destructive: true }),
      createAction(
        'toggleCaption',
        scope,
        resolveTableScopeCommand('toggleCaption', hasCaption, options),
        state,
        { active: hasCaption },
      ),
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
    const rowHeaderActive = areSelectedCellsHeader(selectionInfo);
    return [
      createAction('addRowBefore', scope, addRowBefore(options), state),
      createAction('addRowAfter', scope, addRowAfter(options), state),
      createAction('deleteRow', scope, deleteRow(options), state, { destructive: true }),
      createAction('moveRowUp', scope, moveRowUp(options), state),
      createAction('moveRowDown', scope, moveRowDown(options), state),
      createAction('duplicateRow', scope, duplicateRow(options), state),
      createAction(
        'toggleHeaderRow',
        scope,
        toggleHeaderRow(options),
        state,
        rowHeaderActive === undefined ? {} : { active: rowHeaderActive },
      ),
      createAction('clearRowContent', scope, clearRowContent(options), state),
      createAction('moveRowToHead', scope, moveRowToHead(options), state),
      createAction('moveRowToBody', scope, moveRowToBody(options), state),
      createAction('moveRowToFoot', scope, moveRowToFoot(options), state),
    ];
  }

  if (scope === 'column') {
    const columnHeaderActive = areSelectedCellsHeader(selectionInfo);
    return [
      createAction('addColumnBefore', scope, addColumnBefore(options), state),
      createAction('addColumnAfter', scope, addColumnAfter(options), state),
      createAction('deleteColumn', scope, deleteColumn(options), state, { destructive: true }),
      createAction('moveColumnLeft', scope, moveColumnLeft(options), state),
      createAction('moveColumnRight', scope, moveColumnRight(options), state),
      createAction('duplicateColumn', scope, duplicateColumn(options), state),
      createAction(
        'toggleHeaderColumn',
        scope,
        toggleHeaderColumn(options),
        state,
        columnHeaderActive === undefined ? {} : { active: columnHeaderActive },
      ),
      createAction('clearColumnContent', scope, clearColumnContent(options), state),
      createAction('sortBodyRowsAsc', scope, sortBodyRowsByColumn({ direction: 'asc', ...options }), state),
      createAction('sortBodyRowsDesc', scope, sortBodyRowsByColumn({ direction: 'desc', ...options }), state),
    ];
  }

  const textAlign = getCommonSelectedCellAttribute(state, selectionInfo, 'textAlign');
  const backgroundColor = getCommonSelectedCellAttribute(state, selectionInfo, 'backgroundColor');
  const verticalAlign = getCommonSelectedCellAttribute(state, selectionInfo, 'verticalAlign');
  const headerCellActive = areSelectedCellsHeader(selectionInfo);

  return [
    createAction('setCellTextAlignLeft', scope, setCellTextAlign('left', options), state, {
      active: textAlign === 'left',
    }),
    createAction('setCellTextAlignCenter', scope, setCellTextAlign('center', options), state, {
      active: textAlign === 'center',
    }),
    createAction('setCellTextAlignRight', scope, setCellTextAlign('right', options), state, {
      active: textAlign === 'right',
    }),
    createAction('setCellBackgroundColorBlue', scope, setCellBackgroundColor('#dbeafe', options), state, {
      active: backgroundColor === '#dbeafe',
    }),
    createAction('setCellBackgroundColorGreen', scope, setCellBackgroundColor('#dcfce7', options), state, {
      active: backgroundColor === '#dcfce7',
    }),
    createAction('setCellBackgroundColorYellow', scope, setCellBackgroundColor('#fef3c7', options), state, {
      active: backgroundColor === '#fef3c7',
    }),
    createAction('clearCellBackgroundColor', scope, setCellBackgroundColor(null, options), state, {
      active: backgroundColor === null,
    }),
    createAction('setCellVerticalAlignTop', scope, setCellVerticalAlign('top', options), state, {
      active: verticalAlign === 'top',
    }),
    createAction('setCellVerticalAlignMiddle', scope, setCellVerticalAlign('middle', options), state, {
      active: verticalAlign === 'middle',
    }),
    createAction('setCellVerticalAlignBottom', scope, setCellVerticalAlign('bottom', options), state, {
      active: verticalAlign === 'bottom',
    }),
    createAction('clearSelectedCells', scope, clearSelectedCells(options), state),
    createAction('mergeOrSplitCells', scope, mergeOrSplit(options), state),
    createAction(
      'toggleHeaderCell',
      scope,
      toggleHeaderCell(options),
      state,
      headerCellActive === undefined ? {} : { active: headerCellActive },
    ),
  ];
}

export function getHtmlTableContextActionCommand(
  action: HtmlTableContextAction,
  options: HtmlTableCommandOptions = {},
): Command {
  switch (action.id) {
    case 'deleteTable':
      return resolveTableScopeCommand(action.id, false, options);
    case 'toggleCaption':
      return resolveTableScopeCommand(action.id, Boolean(action.active), options);
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
    case 'toggleHeaderRow':
      return toggleHeaderRow(options);
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
    case 'toggleHeaderColumn':
      return toggleHeaderColumn(options);
    case 'clearColumnContent':
      return clearColumnContent(options);
    case 'sortBodyRowsAsc':
      return sortBodyRowsByColumn({ direction: 'asc', ...options });
    case 'sortBodyRowsDesc':
      return sortBodyRowsByColumn({ direction: 'desc', ...options });
    case 'setCellTextAlignLeft':
      return setCellTextAlign('left', options);
    case 'setCellTextAlignCenter':
      return setCellTextAlign('center', options);
    case 'setCellTextAlignRight':
      return setCellTextAlign('right', options);
    case 'setCellBackgroundColorBlue':
      return setCellBackgroundColor('#dbeafe', options);
    case 'setCellBackgroundColorGreen':
      return setCellBackgroundColor('#dcfce7', options);
    case 'setCellBackgroundColorYellow':
      return setCellBackgroundColor('#fef3c7', options);
    case 'clearCellBackgroundColor':
      return setCellBackgroundColor(null, options);
    case 'setCellVerticalAlignTop':
      return setCellVerticalAlign('top', options);
    case 'setCellVerticalAlignMiddle':
      return setCellVerticalAlign('middle', options);
    case 'setCellVerticalAlignBottom':
      return setCellVerticalAlign('bottom', options);
    case 'clearSelectedCells':
      return clearSelectedCells(options);
    case 'mergeOrSplitCells':
      return mergeOrSplit(options);
    case 'toggleHeaderCell':
      return toggleHeaderCell(options);
  }
}

export function runHtmlTableContextAction(
  state: EditorState,
  action: HtmlTableContextAction,
  dispatch?: Parameters<Command>[1],
  options: HtmlTableCommandOptions = {},
  interaction?: HtmlTableInteractionState,
): boolean {
  const command = getHtmlTableContextActionCommand(action, options);
  const commandState = createContextActionCommandState(state, action, interaction) ?? state;
  if (!dispatch) {
    return command(commandState);
  }

  return command(commandState, (transaction) => {
    dispatch(transaction.setMeta(htmlTableInteractionPluginKey, {
      contextMenuOpen: false,
    }));
  });
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

export function getHtmlTableContextActionMenuItemState(
  _: HtmlTableContextAction,
): HtmlTableContextActionMenuItemState {
  void _;
  return {
    role: 'menuitem',
    checked: null,
  };
}

export function getHtmlTableContextActionShortcutState(
  action: HtmlTableContextAction,
): HtmlTableContextActionShortcutState {
  return {
    ariaKeyshortcuts: ACTION_ARIA_KEYSHORTCUTS[action.id] ?? null,
  };
}

function resolveTableScopeCommand(
  id: Extract<HtmlTableContextActionId, 'deleteTable' | 'toggleCaption' | 'toggleColgroup' | 'toggleHeadSection' | 'toggleFootSection'>,
  active: boolean,
  options: HtmlTableCommandOptions,
): Command {
  const baseCommand =
    id === 'deleteTable'
      ? deleteTable(options)
      : id === 'toggleCaption'
        ? active ? removeCaption(options) : setCaption('', options)
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

function createContextActionCommandState(
  state: EditorState,
  action: HtmlTableContextAction,
  interaction?: HtmlTableInteractionState,
): EditorState | null {
  if (!interaction?.activeTable) {
    return null;
  }

  const table = interaction.activeTable.table;
  const tablePos = interaction.activeTable.tablePos;
  if (action.scope === 'row' && interaction.selectedAxis.kind === 'row' && interaction.selectedAxis.index !== null) {
    const transaction = createRowSelectionTransaction(state, tablePos, table, interaction.selectedAxis.index);
    return transaction ? state.apply(transaction) : null;
  }

  if (
    action.scope === 'column' &&
    interaction.selectedAxis.kind === 'column' &&
    interaction.selectedAxis.index !== null
  ) {
    const transaction = createColumnSelectionTransaction(state, tablePos, table, interaction.selectedAxis.index);
    return transaction ? state.apply(transaction) : null;
  }

  return null;
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
    label: getHtmlTableContextActionLabel(id, meta.active),
    scope,
    enabled: command(state),
    ...meta,
  };
}

function getHtmlTableContextActionLabel(
  id: HtmlTableContextActionId,
  active: boolean | undefined,
): string {
  if (id === 'toggleCaption') {
    return active ? 'Remove caption' : 'Add caption';
  }

  if (id === 'toggleColgroup') {
    return active ? 'Remove colgroup' : 'Add colgroup';
  }

  if (id === 'toggleHeadSection') {
    return active ? 'Remove header section' : 'Add header section';
  }

  if (id === 'toggleFootSection') {
    return active ? 'Remove footer section' : 'Add footer section';
  }

  if (id === 'toggleHeaderRow') {
    return active ? 'Unset header row' : 'Set header row';
  }

  if (id === 'toggleHeaderColumn') {
    return active ? 'Unset header column' : 'Set header column';
  }

  if (id === 'toggleHeaderCell') {
    return active ? 'Unset header cell' : 'Set header cell';
  }

  return ACTION_LABELS[id];
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

function getCommonSelectedCellAttribute(
  _state: EditorState,
  selectionInfo: ReturnType<typeof getTableSelectionInfo> | null,
  attribute: 'textAlign' | 'backgroundColor' | 'verticalAlign',
): string | null | undefined {
  if (!selectionInfo?.cells.length) {
    return undefined;
  }

  let commonValue: string | null | undefined;
  for (const cell of selectionInfo.cells) {
    const value = typeof cell.node.attrs[attribute] === 'string' && cell.node.attrs[attribute].length > 0
      ? cell.node.attrs[attribute]
      : null;
    if (commonValue === undefined) {
      commonValue = value;
      continue;
    }

    if (commonValue !== value) {
      return undefined;
    }
  }

  return commonValue;
}

function areSelectedCellsHeader(
  selectionInfo: ReturnType<typeof getTableSelectionInfo> | null,
): boolean | undefined {
  if (!selectionInfo?.cells.length) {
    return undefined;
  }

  return selectionInfo.cells.every((cell) => cell.node.type.name === 'htmlTableHeaderCell');
}

const ACTION_LABELS: Record<HtmlTableContextActionId, string> = {
  deleteTable: 'Delete table',
  toggleCaption: 'Toggle caption',
  toggleColgroup: 'Toggle colgroup',
  toggleHeadSection: 'Toggle header section',
  toggleFootSection: 'Toggle footer section',
  addRowBefore: 'Add row before',
  addRowAfter: 'Add row after',
  deleteRow: 'Delete row',
  moveRowUp: 'Move row up',
  moveRowDown: 'Move row down',
  duplicateRow: 'Duplicate row',
  toggleHeaderRow: 'Toggle header row',
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
  toggleHeaderColumn: 'Toggle header column',
  clearColumnContent: 'Clear column',
  sortBodyRowsAsc: 'Sort ascending',
  sortBodyRowsDesc: 'Sort descending',
  setCellTextAlignLeft: 'Align left',
  setCellTextAlignCenter: 'Align center',
  setCellTextAlignRight: 'Align right',
  setCellBackgroundColorBlue: 'Background blue',
  setCellBackgroundColorGreen: 'Background green',
  setCellBackgroundColorYellow: 'Background yellow',
  clearCellBackgroundColor: 'Clear background',
  setCellVerticalAlignTop: 'Align top',
  setCellVerticalAlignMiddle: 'Align middle',
  setCellVerticalAlignBottom: 'Align bottom',
  clearSelectedCells: 'Clear selected cells',
  mergeOrSplitCells: 'Merge or split cells',
  toggleHeaderCell: 'Toggle header cell',
};

const ACTION_GROUPS: Record<HtmlTableContextActionId, HtmlTableContextActionGroupId> = {
  deleteTable: 'danger',
  toggleCaption: 'table',
  toggleColgroup: 'table',
  toggleHeadSection: 'table',
  toggleFootSection: 'table',
  addRowBefore: 'insert',
  addRowAfter: 'insert',
  deleteRow: 'danger',
  moveRowUp: 'reorder',
  moveRowDown: 'reorder',
  duplicateRow: 'structure',
  toggleHeaderRow: 'structure',
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
  toggleHeaderColumn: 'structure',
  clearColumnContent: 'content',
  sortBodyRowsAsc: 'structure',
  sortBodyRowsDesc: 'structure',
  setCellTextAlignLeft: 'format',
  setCellTextAlignCenter: 'format',
  setCellTextAlignRight: 'format',
  setCellBackgroundColorBlue: 'format',
  setCellBackgroundColorGreen: 'format',
  setCellBackgroundColorYellow: 'format',
  clearCellBackgroundColor: 'format',
  setCellVerticalAlignTop: 'format',
  setCellVerticalAlignMiddle: 'format',
  setCellVerticalAlignBottom: 'format',
  clearSelectedCells: 'content',
  mergeOrSplitCells: 'structure',
  toggleHeaderCell: 'structure',
};

const ACTION_GROUP_ORDER: HtmlTableContextActionGroupId[] = [
  'table',
  'insert',
  'format',
  'structure',
  'reorder',
  'section',
  'content',
  'danger',
];

const ACTION_GROUP_LABELS: Record<HtmlTableContextActionGroupId, string> = {
  table: 'Table',
  insert: 'Insert',
  format: 'Format',
  structure: 'Structure',
  reorder: 'Reorder',
  section: 'Section',
  content: 'Content',
  danger: 'Danger',
};

const ACTION_ARIA_KEYSHORTCUTS: Partial<Record<HtmlTableContextActionId, string>> = {
  sortBodyRowsAsc: 'Alt+ArrowUp',
  sortBodyRowsDesc: 'Alt+ArrowDown',
  clearSelectedCells: 'Delete',
  mergeOrSplitCells: 'Enter',
  toggleHeaderRow: 'Shift+R',
  toggleHeaderColumn: 'Shift+C',
  toggleHeaderCell: 'Shift+H',
  setCellTextAlignLeft: 'Alt+Shift+L',
  setCellTextAlignCenter: 'Alt+Shift+C',
  setCellTextAlignRight: 'Alt+Shift+R',
  setCellVerticalAlignTop: 'Alt+Shift+T',
  setCellVerticalAlignMiddle: 'Alt+Shift+M',
  setCellVerticalAlignBottom: 'Alt+Shift+B',
};

const PRIMARY_ACTION_ORDER: HtmlTableContextActionId[] = [
  'toggleHeadSection',
  'toggleCaption',
  'addRowAfter',
  'addColumnAfter',
  'mergeOrSplitCells',
  'toggleColgroup',
  'toggleFootSection',
  'duplicateRow',
  'duplicateColumn',
  'clearSelectedCells',
];
