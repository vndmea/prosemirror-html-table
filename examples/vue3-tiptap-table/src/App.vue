<script setup lang="ts">
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { NodeSelection, type EditorState } from '@tiptap/pm/state';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { EditorContent, useEditor } from '@tiptap/vue-3';
import { computed, onBeforeUnmount, ref } from 'vue';
import { HtmlTableExtensions } from 'tiptap-html-table';

const toolbarRevision = ref(0);

const editor = useEditor({
  extensions: [
    Document,
    Paragraph,
    Text,
    ...HtmlTableExtensions,
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
