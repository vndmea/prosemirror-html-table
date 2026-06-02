import type { EditorState } from '@tiptap/pm/state';
import type { HtmlTableCommandOptions } from 'prosemirror-html-table';

import {
  getHtmlTableContextActionGroups,
  getHtmlTableContextActions,
  getPrimaryHtmlTableContextAction,
  runHtmlTableContextAction,
  type HtmlTableContextAction,
  type HtmlTableContextActionId,
  type HtmlTableContextActionGroup,
} from './html-table-actions.js';
import type { HtmlTableInteractionState } from './html-table-interaction.js';
import {
  getHtmlTableSelectionAnchor,
  getHtmlTableSelectionScope,
  type HtmlTableSelectionAnchor,
  type HtmlTableSelectionScope,
} from './html-table-overlay-geometry.js';
import { getTableSelectionInfo } from './table-utils.js';

export interface HtmlTableContextMenuState {
  visible: boolean;
  open: boolean;
  scope: HtmlTableSelectionScope | null;
  anchor: HtmlTableSelectionAnchor | null;
  actions: HtmlTableContextAction[];
  groups: HtmlTableContextActionGroup[];
  primaryAction: HtmlTableContextAction | null;
}

export interface HtmlTableContextTriggerButtonState {
  visible: boolean;
  expanded: boolean;
  scope: HtmlTableSelectionScope | null;
  anchor: HtmlTableSelectionAnchor | null;
  label: string | null;
  title: string | null;
  primaryAction: HtmlTableContextAction | null;
  groups: HtmlTableContextActionGroup[];
}

export function getHtmlTableContextMenuState(
  state: EditorState,
  interaction: HtmlTableInteractionState,
  options: HtmlTableCommandOptions = {},
): HtmlTableContextMenuState {
  const tablePos = interaction.activeTable?.tablePos ?? null;
  const geometry = interaction.geometry;
  const selectionInfo = getTableSelectionInfo(state.doc, state.selection);
  const scope = tablePos !== null ? getHtmlTableSelectionScope(interaction, tablePos, selectionInfo) : null;
  const actions = getHtmlTableContextActions(state, interaction, options);
  const groups = getHtmlTableContextActionGroups(actions);
  const primaryAction = getPrimaryHtmlTableContextAction(actions);
  const anchor =
    tablePos !== null && geometry
      ? getHtmlTableSelectionAnchor(
          interaction,
          tablePos,
          geometry,
          geometry.tableRect.left,
          geometry.tableRect.top,
          selectionInfo,
        )
      : null;

  return {
    visible: Boolean(scope && anchor && actions.length > 0),
    open: Boolean(interaction.contextMenuOpen && scope && anchor && actions.length > 0),
    scope,
    anchor,
    actions,
    groups,
    primaryAction,
  };
}

export function getHtmlTableContextTriggerButtonState(
  state: EditorState,
  interaction: HtmlTableInteractionState,
  options: HtmlTableCommandOptions = {},
): HtmlTableContextTriggerButtonState {
  const menu = getHtmlTableContextMenuState(state, interaction, options);
  const hasInteractionAnchor =
    interaction.contextTrigger.visible &&
    interaction.contextTrigger.left !== null &&
    interaction.contextTrigger.top !== null;
  const anchor = hasInteractionAnchor
    ? {
        left: interaction.contextTrigger.left!,
        top: interaction.contextTrigger.top!,
      }
    : menu.anchor;
  const label = menu.scope ? TRIGGER_LABELS[menu.scope] : null;
  const title =
    label && menu.primaryAction
      ? `${label}: ${menu.primaryAction.label}`
      : label;

  return {
    visible: Boolean(menu.visible && hasInteractionAnchor && anchor),
    expanded: Boolean(menu.open && hasInteractionAnchor && anchor),
    scope: menu.scope,
    anchor,
    label,
    title,
    primaryAction: menu.primaryAction,
    groups: menu.groups,
  };
}

export function findHtmlTableContextMenuAction(
  menu: HtmlTableContextMenuState,
  actionId: HtmlTableContextActionId,
): HtmlTableContextAction | null {
  return menu.actions.find((action) => action.id === actionId) ?? null;
}

export function runHtmlTableContextMenuAction(
  state: EditorState,
  interaction: HtmlTableInteractionState,
  actionId: HtmlTableContextActionId,
  dispatch?: Parameters<typeof runHtmlTableContextAction>[2],
  options: HtmlTableCommandOptions = {},
): boolean {
  const menu = getHtmlTableContextMenuState(state, interaction, options);
  if (!menu.visible) {
    return false;
  }

  const action = findHtmlTableContextMenuAction(menu, actionId);
  if (!action?.enabled) {
    return false;
  }

  return runHtmlTableContextAction(state, action, dispatch, options, interaction);
}

const TRIGGER_LABELS: Record<HtmlTableSelectionScope, string> = {
  table: 'Table actions',
  row: 'Row actions',
  column: 'Column actions',
  cell: 'Cell actions',
};
