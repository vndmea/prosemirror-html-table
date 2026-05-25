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
  insertHtmlTable,
  setCellAttribute,
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
setCellAttribute
toggleHeaderCell
toggleHeaderRow
toggleHeaderColumn
```

These commands are the first editing layer. They are designed for regular table editing and use the section-aware grid internally. Complex spanning behavior is still conservative: deleting a column can shrink a covering `colspan`, while advanced merge/split and full normalization will be implemented separately.

Header commands convert between `htmlTableHeaderCell` and `htmlTableCell` while preserving cell attributes, content, and marks.

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
editor.commands.deleteHtmlTable();
```

## Roadmap

The next major areas are:

```txt
1. CellSelection and keyboard cell navigation
2. mergeCells / splitCell / mergeOrSplit
3. table normalization / fixTables
4. column resizing
5. optional UI components for row and column controls
```

## Development

```bash
npm install
npm run lint
npm run typecheck
npm test
npm run build
```

## License

MIT
