import { NodeSelection, Plugin, type EditorState } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import {
  applyTableClipboardToSelection,
  clearSelectedCells,
  deleteTable,
  isCellSelection,
  isWholeTableSelection,
  parseHtmlTableClipboard,
  parsePlainTextTableClipboard,
  serializeCellSelectionToHtmlTable,
  serializeCellSelectionToText,
} from 'prosemirror-html-table';

import type { HtmlTableTiptapOptions } from './options.js';

export function createHtmlTableEditingPlugin(options: HtmlTableTiptapOptions): Plugin {
  return new Plugin({
    props: {
      handleDOMEvents: {
        copy(view, event) {
          return handleClipboardCopy(view, event as ClipboardEvent, options);
        },
        cut(view, event) {
          return handleClipboardCut(view, event as ClipboardEvent, options);
        },
        paste(view, event) {
          return handleClipboardPaste(view, event as ClipboardEvent, options);
        },
      },
      handleKeyDown(view, event) {
        return handleDeleteKey(view, event, options);
      },
    },
  });
}

function handleClipboardCopy(view: EditorView, event: ClipboardEvent, options: HtmlTableTiptapOptions): boolean {
  if (!options.enableCellRangeClipboard || !event.clipboardData) return false;
  if (!isClipboardSelection(view.state)) return false;

  const html = serializeCellSelectionToHtmlTable(view.state);
  const text = serializeCellSelectionToText(view.state);
  if (!html && !text) return false;

  if (html) event.clipboardData.setData('text/html', html);
  if (text) event.clipboardData.setData('text/plain', text);
  event.preventDefault();
  return true;
}

function handleClipboardCut(view: EditorView, event: ClipboardEvent, options: HtmlTableTiptapOptions): boolean {
  if (!handleClipboardCopy(view, event, options)) return false;

  if (view.state.selection instanceof NodeSelection && view.state.selection.node.type.name === 'htmlTable') {
    return deleteTable()(view.state, view.dispatch);
  }

  return clearSelectedCells()(view.state, view.dispatch);
}

function handleClipboardPaste(view: EditorView, event: ClipboardEvent, options: HtmlTableTiptapOptions): boolean {
  if (!options.enableCellRangeClipboard || !event.clipboardData) return false;
  if (!isTablePasteTarget(view.state)) return false;

  const html = event.clipboardData.getData('text/html');
  const text = event.clipboardData.getData('text/plain');
  const clipboard =
    parseHtmlTableClipboard(html, view.state.schema)
    ?? parsePlainTextTableClipboard(text, view.state.schema);
  if (!clipboard) return false;

  const applied = applyTableClipboardToSelection(view.state, view.dispatch, clipboard, {
    expandTableOnPaste: options.expandTableOnPaste,
  });
  if (!applied) return false;

  event.preventDefault();
  return true;
}

function handleDeleteKey(view: EditorView, event: KeyboardEvent, options: HtmlTableTiptapOptions): boolean {
  if (!options.clearCellsOnDelete) return false;
  if (event.key !== 'Backspace' && event.key !== 'Delete') return false;
  if (!isCellSelection(view.state.selection)) return false;
  if (isWholeTableSelection(view.state)) return false;

  const cleared = clearSelectedCells()(view.state, view.dispatch);
  if (cleared) event.preventDefault();
  return cleared;
}

function isClipboardSelection(state: EditorState): boolean {
  return isCellSelection(state.selection)
    || (state.selection instanceof NodeSelection && state.selection.node.type.name === 'htmlTable');
}

function isTablePasteTarget(state: EditorState): boolean {
  if (state.selection instanceof NodeSelection) {
    return state.selection.node.type.name === 'htmlTable';
  }

  if (isCellSelection(state.selection)) return true;
  const $from = state.selection.$from;
  for (let depth = $from.depth; depth >= 0; depth -= 1) {
    if ($from.node(depth).type.name === 'htmlTable') return true;
  }
  return false;
}
