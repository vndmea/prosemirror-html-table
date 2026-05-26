<script setup lang="ts">
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { EditorContent, useEditor } from '@tiptap/vue-3';
import { computed, onBeforeUnmount } from 'vue';
import { HtmlTableExtensions } from 'tiptap-html-table';

const editor = useEditor({
  extensions: [
    Document,
    Paragraph,
    Text,
    ...HtmlTableExtensions,
  ],
  content: `
    <p>Use the toolbar to edit the full HTML table structure.</p>
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

const htmlOutput = computed(() => editor.value?.getHTML() ?? '');

function run(command: () => boolean): void {
  command();
  editor.value?.commands.focus();
}

onBeforeUnmount(() => {
  editor.value?.destroy();
});
</script>

<template>
  <main class="demo-shell">
    <section class="hero">
      <p class="eyebrow">prosemirror-html-table</p>
      <h1>Vue 3 + Tiptap v3 full HTML table demo</h1>
      <p>
        This demo uses <code>tiptap-html-table</code> to edit a table with
        <code>caption</code>, <code>colgroup</code>, <code>thead</code>,
        <code>tbody</code>, and <code>tfoot</code>. Drag column edges to resize,
        use <code>Tab</code>/<code>Shift+Tab</code> to move, and use
        <code>Shift+Arrow</code> to extend cell selection.
      </p>
    </section>

    <section class="toolbar" aria-label="Table commands">
      <button type="button" @click="run(() => editor?.commands.insertHtmlTable({ rows: 3, cols: 3, withHeaderRow: true, withCaption: true, captionText: 'New table' }) ?? false)">
        Insert table
      </button>
      <button type="button" @click="run(() => editor?.commands.addHtmlTableRowBefore() ?? false)">
        Row before
      </button>
      <button type="button" @click="run(() => editor?.commands.addHtmlTableRowAfter() ?? false)">
        Row after
      </button>
      <button type="button" @click="run(() => editor?.commands.deleteHtmlTableRow() ?? false)">
        Delete row
      </button>
      <button type="button" @click="run(() => editor?.commands.addHtmlTableColumnBefore() ?? false)">
        Column before
      </button>
      <button type="button" @click="run(() => editor?.commands.addHtmlTableColumnAfter() ?? false)">
        Column after
      </button>
      <button type="button" @click="run(() => editor?.commands.deleteHtmlTableColumn() ?? false)">
        Delete column
      </button>
      <button type="button" @click="run(() => editor?.commands.mergeHtmlTableCells() ?? false)">
        Merge cells
      </button>
      <button type="button" @click="run(() => editor?.commands.splitHtmlTableCell() ?? false)">
        Split cell
      </button>
      <button type="button" @click="run(() => editor?.commands.mergeOrSplitHtmlTableCells() ?? false)">
        Merge or split
      </button>
      <button type="button" @click="run(() => editor?.commands.setHtmlTableCellAttribute('colspan', 2) ?? false)">
        Set colspan=2
      </button>
      <button type="button" @click="run(() => editor?.commands.toggleHtmlTableHeaderCell() ?? false)">
        Toggle header cell
      </button>
      <button type="button" @click="run(() => editor?.commands.toggleHtmlTableHeaderRow() ?? false)">
        Toggle header row
      </button>
      <button type="button" @click="run(() => editor?.commands.toggleHtmlTableHeaderColumn() ?? false)">
        Toggle header column
      </button>
      <button type="button" @click="run(() => editor?.commands.goToPreviousHtmlTableCell({ cycle: true }) ?? false)">
        Previous cell
      </button>
      <button type="button" @click="run(() => editor?.commands.goToNextHtmlTableCell({ cycle: true }) ?? false)">
        Next cell
      </button>
      <button type="button" @click="run(() => editor?.commands.selectHtmlTableCell() ?? false)">
        Select cell
      </button>
      <button type="button" @click="run(() => editor?.commands.selectHtmlTableRow() ?? false)">
        Select row
      </button>
      <button type="button" @click="run(() => editor?.commands.selectHtmlTableColumn() ?? false)">
        Select column
      </button>
      <button type="button" @click="run(() => editor?.commands.fixHtmlTables() ?? false)">
        Fix tables
      </button>
      <button type="button" class="danger" @click="run(() => editor?.commands.deleteHtmlTable() ?? false)">
        Delete table
      </button>
    </section>

    <section class="content-grid">
      <div class="panel editor-panel">
        <h2>Editor</h2>
        <EditorContent v-if="editor" :editor="editor" />
      </div>

      <div class="panel output-panel">
        <h2>HTML output</h2>
        <pre><code>{{ htmlOutput }}</code></pre>
      </div>
    </section>
  </main>
</template>
