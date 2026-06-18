<script setup lang="ts">
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { redo, undo } from '@tiptap/pm/history';
import { NodeSelection, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { EditorContent, useEditor } from '@tiptap/vue-3';
import { computed, onBeforeUnmount, ref, watchEffect } from 'vue';
import {
  applyTableClipboardToSelection,
  clearClipboardSelectedCells,
  isCellSelection,
  parseHtmlTableClipboard,
  parsePlainTextTableClipboard,
  serializeCellSelectionToHtmlTable,
  serializeCellSelectionToText,
} from 'prosemirror-html-table';
import {
  createHtmlTableExtensions,
  type HtmlTableContextAction,
  type HtmlTableContextActionResolver,
} from 'tiptap-html-table';

import { TiptapHistoryExtension } from '../../shared/tiptap-history';

const toolbarRevision = ref(0);
const clipboardOutput = ref({ html: '', text: '' });

const sampleTsv = 'Copied task\tCopied status\nFollow-up\tQueued';
const sampleSingleCellText = 'Updated value';

type ClipboardOutput = {
  html: string;
  text: string;
};

type DemoSnapshot = {
  canRedo: boolean;
  canUndo: boolean;
  clipboard: ClipboardOutput;
  html: string;
};

type DemoApi = {
  clearSelection: () => boolean;
  copySelection: () => ClipboardOutput;
  getClipboard: () => ClipboardOutput;
  getSnapshot: () => DemoSnapshot;
  pasteHtml: (html?: string) => boolean;
  pasteSingleCell: (text?: string) => boolean;
  pasteTsv: (text?: string) => boolean;
  runCommand: (name: string) => boolean;
  selectCell: (rowIndex: number, columnIndex: number, section?: 'thead' | 'tbody' | 'tfoot') => boolean;
};

declare global {
  interface Window {
    __HTML_TABLE_DEMO__?: DemoApi;
  }
}

function setClipboard(nextClipboard: ClipboardOutput): ClipboardOutput {
  clipboardOutput.value = nextClipboard;
  return nextClipboard;
}

function copySelectionFromState(state: EditorState): ClipboardOutput {
  return setClipboard({
    html: serializeCellSelectionToHtmlTable(state) ?? '',
    text: serializeCellSelectionToText(state) ?? '',
  });
}

function pasteHtmlIntoState(
  state: EditorState,
  html: string,
  dispatch?: (tr: Transaction) => void,
): boolean {
  const clipboard = parseHtmlTableClipboard(html, state.schema);
  if (!clipboard) {
    return false;
  }

  return applyTableClipboardToSelection(state, dispatch, clipboard);
}

function pasteTextIntoState(
  state: EditorState,
  text: string,
  dispatch?: (tr: Transaction) => void,
): boolean {
  const clipboard = parsePlainTextTableClipboard(text, state.schema);
  if (!clipboard) {
    return false;
  }

  return applyTableClipboardToSelection(state, dispatch, clipboard);
}

const resolveContextActions: HtmlTableContextActionResolver = ({ scope, state }): HtmlTableContextAction[] => {
  if (scope !== 'cell') {
    return [];
  }

  return [
    {
      id: 'copySelection',
      label: 'Copy selection',
      scope,
      enabled: isCellSelection(state.selection),
      group: 'external',
      run: (nextState) => {
        copySelectionFromState(nextState);
        return true;
      },
    },
    {
      id: 'pasteCopiedHtml',
      label: 'Paste copied HTML',
      scope,
      enabled: clipboardOutput.value.html.length > 0,
      group: 'external',
      run: (nextState, dispatch) => {
        if (!clipboardOutput.value.html) {
          return false;
        }

        const applied = pasteHtmlIntoState(nextState, clipboardOutput.value.html, dispatch);
        if (applied) {
          editor.value?.commands.focus();
        }
        return applied;
      },
    },
  ];
};

const editor = useEditor({
  extensions: [
    Document,
    Paragraph,
    Text,
    TiptapHistoryExtension,
    ...createHtmlTableExtensions({
      table: {
        contextActionResolver: resolveContextActions,
      },
    }),
  ],
  content: `
    <table>
      <caption>Maintenance checklist</caption>
      <colgroup>
        <col width="180" />
        <col width="260" />
      </colgroup>
      <thead>
        <tr>
          <th><p>Task</p></th>
          <th><p>Status</p></th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><p>Open panel</p></td>
          <td><p>Done</p></td>
        </tr>
        <tr>
          <td><p>Inspect connector</p></td>
          <td><p>Pending</p></td>
        </tr>
      </tbody>
      <tfoot>
        <tr>
          <td><p>Total</p></td>
          <td><p>2 tasks</p></td>
        </tr>
      </tfoot>
    </table>
  `,
  onTransaction: () => {
    toolbarRevision.value += 1;
  },
});

type ToolbarButton = {
  label: string;
  title: string;
  action: () => boolean;
  disabled: boolean;
  danger?: boolean;
};

function run(command: () => boolean): void {
  command();
  editor.value?.commands.focus();
}

function pasteHtml(html?: string): boolean {
  const currentEditor = editor.value;
  const nextHtml = html ?? clipboardOutput.value.html;
  if (!currentEditor || !nextHtml) {
    return false;
  }

  const applied = pasteHtmlIntoState(currentEditor.state, nextHtml, currentEditor.view.dispatch);
  if (applied) {
    currentEditor.commands.focus();
  }
  return applied;
}

function pasteTsv(text = sampleTsv): boolean {
  const currentEditor = editor.value;
  if (!currentEditor) {
    return false;
  }

  const applied = pasteTextIntoState(currentEditor.state, text, currentEditor.view.dispatch);
  if (applied) {
    currentEditor.commands.focus();
  }
  return applied;
}

function pasteSingleCell(text = sampleSingleCellText): boolean {
  return pasteTsv(text);
}

function clearSelection(): boolean {
  const currentEditor = editor.value;
  if (!currentEditor) {
    return false;
  }

  const cleared = clearClipboardSelectedCells(currentEditor.state, currentEditor.view.dispatch);
  if (cleared) {
    currentEditor.commands.focus();
  }
  return cleared;
}

function canRunHistory(command: typeof undo | typeof redo): boolean {
  const currentEditor = editor.value;
  return Boolean(currentEditor && command(currentEditor.state));
}

function runHistory(command: typeof undo | typeof redo): boolean {
  const currentEditor = editor.value;
  if (!currentEditor) {
    return false;
  }

  const applied = command(currentEditor.state, currentEditor.view.dispatch);
  if (applied) {
    currentEditor.commands.focus();
  }
  return applied;
}

function selectCell(
  rowIndex: number,
  columnIndex: number,
  section: 'thead' | 'tbody' | 'tfoot' = 'tbody',
): boolean {
  const currentEditor = editor.value;
  if (!currentEditor) {
    return false;
  }

  const table = currentEditor.view.dom.querySelector('table');
  const cell = table
    ?.querySelector(section)
    ?.querySelectorAll('tr')
    ?.item(rowIndex)
    ?.querySelectorAll('td,th')
    ?.item(columnIndex) as HTMLElement | null;
  if (!cell) {
    return false;
  }

  const contentTarget = cell.querySelector('p,div,span') ?? cell;
  const pos = currentEditor.view.posAtDOM(contentTarget, 0);
  const tr = currentEditor.state.tr.setSelection(TextSelection.near(currentEditor.state.doc.resolve(pos)));
  currentEditor.view.dispatch(tr);
  currentEditor.commands.focus();
  return true;
}

function getActiveTable(state: EditorState): ProseMirrorNode | null {
  if (state.selection instanceof NodeSelection && state.selection.node.type.name === 'htmlTable') {
    return state.selection.node;
  }

  for (let depth = state.selection.$from.depth; depth >= 0; depth -= 1) {
    const node = state.selection.$from.node(depth);
    if (node.type.name === 'htmlTable') {
      return node;
    }
  }

  return null;
}

function hasTableChild(table: ProseMirrorNode | null, typeName: string): boolean {
  if (!table) {
    return false;
  }

  for (let index = 0; index < table.childCount; index += 1) {
    if (table.child(index).type.name === typeName) {
      return true;
    }
  }

  return false;
}

const toolbarButtons = computed<ToolbarButton[]>(() => {
  toolbarRevision.value;

  const currentEditor = editor.value;
  const table = currentEditor ? getActiveTable(currentEditor.state) : null;
  const hasCaption = hasTableChild(table, 'htmlTableCaption');
  const hasColgroup = hasTableChild(table, 'htmlTableColgroup');
  const hasHead = hasTableChild(table, 'htmlTableHead');
  const hasFoot = hasTableChild(table, 'htmlTableFoot');

  return [
    {
      label: 'Undo',
      title: 'Undo last change',
      action: () => runHistory(undo),
      disabled: !canRunHistory(undo),
    },
    {
      label: 'Redo',
      title: 'Redo last change',
      action: () => runHistory(redo),
      disabled: !canRunHistory(redo),
    },
    {
      label: 'Insert table',
      title: 'Insert table',
      action: () => currentEditor?.commands.insertHtmlTable({
        rows: 3,
        cols: 3,
        withHeaderRow: true,
        withCaption: true,
        captionText: 'New table',
      }) ?? false,
      disabled: !(currentEditor?.can().insertHtmlTable({
        rows: 3,
        cols: 3,
        withHeaderRow: true,
        withCaption: true,
        captionText: 'New table',
      }) ?? false),
    },
    {
      label: 'Set caption',
      title: 'Set table caption',
      action: () => currentEditor?.commands.setHtmlTableCaption('Updated table caption') ?? false,
      disabled: hasCaption || !(currentEditor?.can().setHtmlTableCaption('Updated table caption') ?? false),
    },
    {
      label: 'Remove caption',
      title: 'Remove table caption',
      action: () => currentEditor?.commands.removeHtmlTableCaption() ?? false,
      disabled: !hasCaption || !(currentEditor?.can().removeHtmlTableCaption() ?? false),
    },
    {
      label: 'Set colgroup',
      title: 'Set colgroup widths',
      action: () => currentEditor?.commands.setHtmlTableColgroup([180, 260, 220]) ?? false,
      disabled: hasColgroup || !(currentEditor?.can().setHtmlTableColgroup([180, 260, 220]) ?? false),
    },
    {
      label: 'Remove colgroup',
      title: 'Remove colgroup',
      action: () => currentEditor?.commands.removeHtmlTableColgroup() ?? false,
      disabled: !hasColgroup || !(currentEditor?.can().removeHtmlTableColgroup() ?? false),
    },
    {
      label: 'Add header section',
      title: 'Add header section',
      action: () => currentEditor?.commands.addHtmlTableHeadSection() ?? false,
      disabled: hasHead || !(currentEditor?.can().addHtmlTableHeadSection() ?? false),
    },
    {
      label: 'Move header to body',
      title: 'Move header section to body',
      action: () => currentEditor?.commands.removeHtmlTableHeadSection() ?? false,
      disabled: !hasHead || !(currentEditor?.can().removeHtmlTableHeadSection() ?? false),
    },
    {
      label: 'Add footer section',
      title: 'Add footer section',
      action: () => currentEditor?.commands.addHtmlTableFootSection() ?? false,
      disabled: hasFoot || !(currentEditor?.can().addHtmlTableFootSection() ?? false),
    },
    {
      label: 'Move footer to body',
      title: 'Move footer section to body',
      action: () => currentEditor?.commands.removeHtmlTableFootSection() ?? false,
      disabled: !hasFoot || !(currentEditor?.can().removeHtmlTableFootSection() ?? false),
    },
    {
      label: 'Fix tables',
      title: 'Normalize tables',
      action: () => currentEditor?.commands.fixHtmlTables() ?? false,
      disabled: !(currentEditor?.can().fixHtmlTables() ?? false),
    },
    {
      label: 'Delete table',
      title: 'Delete table',
      action: () => currentEditor?.commands.deleteHtmlTable() ?? false,
      disabled: !(currentEditor?.can().deleteHtmlTable() ?? false),
      danger: true,
    },
  ];
});

watchEffect((onCleanup) => {
  const currentEditor = editor.value;
  if (typeof window === 'undefined' || !currentEditor) {
    return;
  }

  const api: DemoApi = {
    clearSelection,
    copySelection: () => copySelectionFromState(currentEditor.state),
    getClipboard: () => clipboardOutput.value,
    getSnapshot: () => ({
      canRedo: canRunHistory(redo),
      canUndo: canRunHistory(undo),
      clipboard: clipboardOutput.value,
      html: currentEditor.getHTML(),
    }),
    pasteHtml,
    pasteSingleCell,
    pasteTsv,
    runCommand: (name) => {
      if (name === 'undo') {
        return runHistory(undo);
      }
      if (name === 'redo') {
        return runHistory(redo);
      }

      const commands = currentEditor.commands as unknown as Record<string, (() => boolean) | undefined>;
      return commands[name]?.() ?? false;
    },
    selectCell,
  };

  window.__HTML_TABLE_DEMO__ = api;
  onCleanup(() => {
    if (window.__HTML_TABLE_DEMO__ === api) {
      delete window.__HTML_TABLE_DEMO__;
    }
  });
});

onBeforeUnmount(() => {
  editor.value?.destroy();
});
</script>

<template>
  <main class="html-table-example html-table-example--shell">
    <section class="html-table-example__hero">
      <h1>Vue 3 + Tiptap v3 full HTML table demo</h1>
      <p>
        This demo uses <code>tiptap-html-table</code> to edit a table with
        <code>caption</code>, <code>colgroup</code>, <code>thead</code>,
        <code>tbody</code>, and <code>tfoot</code>. Drag column edges to resize,
        click the row and column handles to select full axes, use
        <code>Tab</code>/<code>Shift+Tab</code> to move, and use
        <code>Shift+Arrow</code> to extend cell selection. Use the selection menus
        for row, column, and cell actions, and keep the toolbar for table setup,
        explicit caption/colgroup toggles, section structure changes, table
        cleanup, and other table-level commands that stay outside the selection
        menus.
      </p>
    </section>

    <section class="html-table-example__toolbar" aria-label="Table commands">
      <button
        v-for="button in toolbarButtons"
        :key="button.title"
        type="button"
        :class="{ danger: button.danger }"
        :disabled="button.disabled"
        :title="button.title"
        @click="run(button.action)"
      >
        {{ button.label }}
      </button>
    </section>

    <section class="html-table-example__content-grid">
      <div class="html-table-example__panel html-table-example__editor-panel">
        <div data-testid="pmht-editor">
          <EditorContent v-if="editor" :editor="editor" />
        </div>
      </div>
    </section>
  </main>
</template>
