<script setup lang="ts">
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { EditorContent, useEditor } from '@tiptap/vue-3';
import { onBeforeUnmount } from 'vue';
import { HtmlTableExtensions } from 'tiptap-html-table';

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
});

type ToolbarButton = {
  label: string;
  title: string;
  action: () => boolean;
  danger?: boolean;
};

function run(command: () => boolean): void {
  command();
  editor.value?.commands.focus();
}

const toolbarButtons: ToolbarButton[] = [
  {
    label: 'Insert table',
    title: 'Insert table',
    action: () => editor.value?.commands.insertHtmlTable({
      rows: 3,
      cols: 3,
      withHeaderRow: true,
      withCaption: true,
      captionText: 'New table',
    }) ?? false,
  },
  {
    label: 'Row before',
    title: 'Insert row before',
    action: () => editor.value?.commands.addHtmlTableRowBefore() ?? false,
  },
  {
    label: 'Row after',
    title: 'Insert row after',
    action: () => editor.value?.commands.addHtmlTableRowAfter() ?? false,
  },
  {
    label: 'Del row',
    title: 'Delete row',
    action: () => editor.value?.commands.deleteHtmlTableRow() ?? false,
  },
  {
    label: 'Column before',
    title: 'Insert column before',
    action: () => editor.value?.commands.addHtmlTableColumnBefore() ?? false,
  },
  {
    label: 'Column after',
    title: 'Insert column after',
    action: () => editor.value?.commands.addHtmlTableColumnAfter() ?? false,
  },
  {
    label: 'Delete column',
    title: 'Delete column',
    action: () => editor.value?.commands.deleteHtmlTableColumn() ?? false,
  },
  {
    label: 'Set caption',
    title: 'Set table caption',
    action: () => editor.value?.commands.setHtmlTableCaption('Updated table caption') ?? false,
  },
  {
    label: 'Remove caption',
    title: 'Remove table caption',
    action: () => editor.value?.commands.removeHtmlTableCaption() ?? false,
  },
  {
    label: 'Set colgroup',
    title: 'Set colgroup widths',
    action: () => editor.value?.commands.setHtmlTableColgroup([180, 260, 220]) ?? false,
  },
  {
    label: 'Remove colgroup',
    title: 'Remove colgroup',
    action: () => editor.value?.commands.removeHtmlTableColgroup() ?? false,
  },
  {
    label: 'Merge cells',
    title: 'Merge cells',
    action: () => editor.value?.commands.mergeHtmlTableCells() ?? false,
  },
  {
    label: 'Split cell',
    title: 'Split cell',
    action: () => editor.value?.commands.splitHtmlTableCell() ?? false,
  },
  {
    label: 'Merge or split',
    title: 'Merge or split cells',
    action: () => editor.value?.commands.mergeOrSplitHtmlTableCells() ?? false,
  },
  {
    label: 'Set colspan=2',
    title: 'Set colspan to 2',
    action: () => editor.value?.commands.setHtmlTableCellAttribute('colspan', 2) ?? false,
  },
  {
    label: 'Toggle header cell',
    title: 'Toggle header cell',
    action: () => editor.value?.commands.toggleHtmlTableHeaderCell() ?? false,
  },
  {
    label: 'Toggle header row',
    title: 'Toggle header row',
    action: () => editor.value?.commands.toggleHtmlTableHeaderRow() ?? false,
  },
  {
    label: 'Toggle header column',
    title: 'Toggle header column',
    action: () => editor.value?.commands.toggleHtmlTableHeaderColumn() ?? false,
  },
  {
    label: 'Add thead',
    title: 'Add head section',
    action: () => editor.value?.commands.addHtmlTableHeadSection() ?? false,
  },
  {
    label: 'Remove thead',
    title: 'Remove head section',
    action: () => editor.value?.commands.removeHtmlTableHeadSection() ?? false,
  },
  {
    label: 'Add tfoot',
    title: 'Add foot section',
    action: () => editor.value?.commands.addHtmlTableFootSection() ?? false,
  },
  {
    label: 'Remove tfoot',
    title: 'Remove foot section',
    action: () => editor.value?.commands.removeHtmlTableFootSection() ?? false,
  },
  {
    label: 'Row -> thead',
    title: 'Move row to head',
    action: () => editor.value?.commands.moveHtmlTableRowToHead() ?? false,
  },
  {
    label: 'Row -> tbody',
    title: 'Move row to body',
    action: () => editor.value?.commands.moveHtmlTableRowToBody() ?? false,
  },
  {
    label: 'Row -> tfoot',
    title: 'Move row to foot',
    action: () => editor.value?.commands.moveHtmlTableRowToFoot() ?? false,
  },
  {
    label: 'Previous cell',
    title: 'Go to previous cell',
    action: () => editor.value?.commands.goToPreviousHtmlTableCell({ cycle: true }) ?? false,
  },
  {
    label: 'Next cell',
    title: 'Go to next cell',
    action: () => editor.value?.commands.goToNextHtmlTableCell({ cycle: true }) ?? false,
  },
  {
    label: 'Select cell',
    title: 'Select cell',
    action: () => editor.value?.commands.selectHtmlTableCell() ?? false,
  },
  {
    label: 'Select row',
    title: 'Select row',
    action: () => editor.value?.commands.selectHtmlTableRow() ?? false,
  },
  {
    label: 'Select column',
    title: 'Select column',
    action: () => editor.value?.commands.selectHtmlTableColumn() ?? false,
  },
  {
    label: 'Fix tables',
    title: 'Normalize tables',
    action: () => editor.value?.commands.fixHtmlTables() ?? false,
  },
  {
    label: 'Delete table',
    title: 'Delete table',
    action: () => editor.value?.commands.deleteHtmlTable() ?? false,
    danger: true,
  },
];

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
        <code>Shift+Arrow</code> to extend cell selection. Use the toolbar to edit
        captions, colgroups, and explicit head/body/foot sections in addition to
        the logical table grid.
      </p>
    </section>

    <section class="html-table-example__toolbar" aria-label="Table commands">
      <button
        v-for="button in toolbarButtons"
        :key="button.title"
        type="button"
        :class="{ danger: button.danger }"
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
