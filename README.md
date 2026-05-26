# prosemirror-html-table

A ProseMirror-first table engine for full HTML table structures.

This project is designed for editors that need to preserve and manipulate richer HTML table semantics than the default ProseMirror/Tiptap table model, including:

- `caption`
- `colgroup`
- `col`
- `thead`
- `tbody`
- `tfoot`
- `tr`
- `th`
- `td`

## Packages

```txt
packages/core    ProseMirror schema helpers, table model types, grid utilities, and commands
packages/tiptap  Tiptap v3 node extensions and command wrappers built on top of the core package
```

## Example

A Vue 3 + Tiptap v3 demo is available in `examples/vue3-tiptap-table`.

```bash
npm install
npm run dev --workspace vue3-tiptap-table-demo
```

The demo includes a full HTML table with `caption`, `colgroup`, `thead`, `tbody`, and `tfoot`, plus toolbar buttons for row/column editing, header toggles, cell navigation, and table selection commands.

## Install

```bash
npm install prosemirror-html-table
```

For Tiptap projects:

```bash
npm install tiptap-html-table prosemirror-html-table
```

## Current capabilities

### Full HTML table structure

The schema foundation supports the full structural shape of HTML tables:

```txt
htmlTable
  ├── htmlTableCaption?
  ├── htmlTableColgroup?
  │   └── htmlTableCol+
  ├── htmlTableHead?
  │   └── htmlTableRow+
  ├── htmlTableBody+
  │   └── htmlTableRow+
  └── htmlTableFoot?
      └── htmlTableRow+
```

Rows contain `htmlTableHeaderCell` and `htmlTableCell` nodes, which render as `th` and `td`.

### Section-aware grid model

`createHtmlTableGrid` maps `thead`, `tbody`, and `tfoot` rows into one logical grid. It tracks row index, column index, section name, `rowspan`, `colspan`, and whether a slot is the anchor of a spanning cell.

```ts
import { createHtmlTableGrid } from 'prosemirror-html-table';

const grid = createHtmlTableGrid(tableNode);
```

### Core commands

The core package currently exposes these table commands:

```ts
import {
  addColumnAfter,
  addColumnBefore,
  addRowAfter,
  addRowBefore,
  deleteColumn,
  deleteRow,
  deleteTable,
  fixTables,
  goToNextCell,
  goToPreviousCell,
  insertHtmlTable,
  mergeCells,
  mergeOrSplit,
  selectCell,
  selectColumn,
  selectRow,
  selectTable,
  setCellAttribute,
  splitCell,
  toggleHeaderCell,
  toggleHeaderColumn,
  toggleHeaderRow,
} from 'prosemirror-html-table';
```

Supported command set:

```txt
insertHtmlTable
addRowBefore
addRowAfter
deleteRow
addColumnBefore
addColumnAfter
deleteColumn
deleteTable
mergeCells
splitCell
mergeOrSplit
fixTables
setCellAttribute
toggleHeaderCell
toggleHeaderRow
toggleHeaderColumn
goToNextCell
goToPreviousCell
selectCell
selectRow
selectColumn
selectTable
```

These commands use the section-aware grid internally. They now cover dedicated cell selection, rectangular merge, merged-cell splitting, and full-table normalization through `fixTables`.

Header commands convert between `htmlTableHeaderCell` and `htmlTableCell` while preserving cell attributes, content, and marks.

Selection commands use a dedicated `CellSelection` for cell, row, and column ranges, while whole-table selection still uses `NodeSelection`.

### Tiptap interaction layer

The Tiptap package now includes:

```txt
- custom table node view with optional wrapper
- column resize handles
- persisted colgroup / colwidth state
- selected-cell decorations
- Tab / Shift-Tab navigation
- Shift-Arrow cell-range expansion
```

Available options:

```ts
{
  HTMLAttributes: {},
  resizable: true,
  renderWrapper: true,
  handleWidth: 6,
  cellMinWidth: 120,
  lastColumnResizable: true,
  allowTableNodeSelection: true,
}
```

### Tiptap usage

```ts
import { Editor } from '@tiptap/core';
import { HtmlTableExtensions } from 'tiptap-html-table';

const editor = new Editor({
  extensions: [
    // Add your document, paragraph, text, and other base extensions here.
    ...HtmlTableExtensions,
  ],
});

editor.commands.insertHtmlTable({
  rows: 3,
  cols: 3,
  withHeaderRow: true,
  withCaption: true,
  captionText: 'Demo table',
});

editor.commands.addHtmlTableRowAfter();
editor.commands.addHtmlTableColumnAfter();
editor.commands.deleteHtmlTableRow();
editor.commands.deleteHtmlTableColumn();
editor.commands.setHtmlTableCellAttribute('colspan', 2);
editor.commands.toggleHtmlTableHeaderCell();
editor.commands.toggleHtmlTableHeaderRow();
editor.commands.toggleHtmlTableHeaderColumn();
editor.commands.goToNextHtmlTableCell();
editor.commands.goToPreviousHtmlTableCell();
editor.commands.selectHtmlTableCell();
editor.commands.selectHtmlTableRow();
editor.commands.selectHtmlTableColumn();
editor.commands.selectHtmlTable();
editor.commands.mergeHtmlTableCells();
editor.commands.splitHtmlTableCell();
editor.commands.mergeOrSplitHtmlTableCells();
editor.commands.fixHtmlTables();
editor.commands.deleteHtmlTable();
```

`goToNextHtmlTableCell` and `goToPreviousHtmlTableCell` support optional cycling:

```ts
editor.commands.goToNextHtmlTableCell({ cycle: true });
```

## Roadmap

The next major areas are:

```txt
1. optional UI components for row and column controls
2. richer keyboard shortcuts and copy/paste behavior
3. copy/paste cell ranges
4. row and column move / duplicate controls
```

## Development

```bash
npm install
npm run lint
npm run typecheck
npm test
npm run build
```

Run the Vue demo:

```bash
npm run dev --workspace vue3-tiptap-table-demo
```

## License

MIT
