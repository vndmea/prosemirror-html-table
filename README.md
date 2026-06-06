# prosemirror-html-table

English | [简体中文](https://github.com/vndmea/prosemirror-html-table/blob/main/README.zh-CN.md)

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

## Playground

A Vue 3 + Tiptap v3 playground is available in `examples/vue3-tiptap-table`.

Online:

[Playground](https://vndmea.github.io/prosemirror-html-table/)

Local:

```bash
npm install
npm run dev --workspace vue3-tiptap-table-demo
```

The playground includes a full HTML table with `caption`, `colgroup`, `thead`, `tbody`, and `tfoot`, plus row/column handles, nested context menus, resize and extend controls, selection overlays, and a compact toolbar for table-level commands.

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

### TableMap-style adapter

`HtmlTableMap` adds a section-aware compatibility layer on top of `createHtmlTableGrid`. It keeps table-relative positions, exposes `width`, `height`, `map`, and `cellPositions`, and mirrors the official `TableMap` helpers for `findCell`, `rectBetween`, `cellsInRect`, `positionAt`, and `nextCell`.

```ts
import { HtmlTableMap } from 'prosemirror-html-table';

const tableMap = HtmlTableMap.get(tableNode);
const firstCellRect = tableMap.findCell(tableMap.map[0]!);
```

### Core commands

The core package exposes a section-aware command set:

```txt
Structure:   insertHtmlTable, fixTables, deleteTable
Rows:        addRowBefore, addRowAfter, addRowToHead, addRowToBody, addRowToFoot,
             deleteRow, duplicateRow, moveRowUp, moveRowDown,
             moveRowToHead, moveRowToBody, moveRowToFoot
Columns:     addColumnBefore, addColumnAfter, deleteColumn, duplicateColumn,
             moveColumnLeft, moveColumnRight
Sections:    addHeadSection, removeHeadSection, addFootSection, removeFootSection
HTML parts:  setCaption, removeCaption, setColgroup, removeColgroup
Cells:       mergeCells, splitCell, mergeOrSplit, clearSelectedCells,
             clearRowContent, clearColumnContent
Formatting:  setCellAttribute, setCellTextAlign, setCellBackgroundColor,
             setCellVerticalAlign, toggleHeaderCell, toggleHeaderRow,
             toggleHeaderColumn
Selection:   selectCell, selectRow, selectColumn, selectTable,
             goToNextCell, goToPreviousCell
Data:        sortBodyRowsByColumn
```

These commands use the section-aware grid internally. They cover dedicated cell selection, rectangular merge, merged-cell splitting, row/column move and duplication, section operations, and full-table normalization through `fixTables`.

Header commands convert between `htmlTableHeaderCell` and `htmlTableCell` while preserving cell attributes, content, and marks.

Selection commands use a dedicated `CellSelection` for cell, row, and column ranges, while whole-table selection still uses `NodeSelection`.

### Tiptap interaction layer

The Tiptap package now includes:

```txt
- custom table node view with optional wrapper
- row and column handles with explicit selection state
- nested context menus for cell, row, and column actions
- row and column extend controls
- column resize handles with drag preview
- persisted colgroup / colwidth state
- cell, row, column, and table selection visuals
- native text selection inside cells
- Tab / Shift-Tab navigation
- Shift-Arrow cell-range expansion
```

Available options:

```ts
{
  HTMLAttributes: {},
  resizable: true,
  renderWrapper: true,
  handleWidth: 1,
  cellMinWidth: 120,
  lastColumnResizable: true,
  allowTableNodeSelection: true,
  View: null,
  wrapperClassName: 'html-table-node__wrapper',
  selectedCellClassName: 'html-table-cell--selected',
  selectedTableClassName: 'html-table-node--selected',
}
```

### Tiptap usage

```ts
import { Editor } from '@tiptap/core';
import { HtmlTableExtensions } from 'tiptap-html-table';
import 'tiptap-html-table/styles.css';

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
editor.commands.duplicateHtmlTableRow();
editor.commands.duplicateHtmlTableColumn();
editor.commands.moveHtmlTableRowDown();
editor.commands.moveHtmlTableColumnRight();
editor.commands.sortHtmlTableBodyRowsByColumn({ direction: 'asc' });
editor.commands.setHtmlTableCellAttribute('colspan', 2);
editor.commands.setHtmlTableCellTextAlign('center');
editor.commands.setHtmlTableCellBackgroundColor('#dbeafe');
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
editor.commands.fixHtmlTables();
editor.commands.deleteHtmlTable();
```

`goToNextHtmlTableCell` and `goToPreviousHtmlTableCell` support optional cycling:

```ts
editor.commands.goToNextHtmlTableCell({ cycle: true });
```

## Differences from `prosemirror-tables`

This project is not a drop-in replacement for `prosemirror-tables`.

- It preserves full HTML table sections and elements, while the default `prosemirror-tables` model uses a simpler table tree.
- `HtmlTableMap` now provides a section-aware `TableMap`-style adapter, but full `prosemirror-tables` command and plugin compatibility is still incomplete.
- The current `CellSelection` and Tiptap interaction plugins cover the project's editing UI, but do not yet provide every API and plugin behavior from the official `CellSelection` and `tableEditing()`.
- Cell-range clipboard behavior, an official-style editing plugin, incremental table repair, and compatibility adapters remain planned work.
- `setCellAttribute` currently updates the current cell; use the dedicated text-align, background-color, and vertical-align commands for selection-aware bulk formatting.
- `Shift-Arrow` range expansion currently treats section boundaries as hard boundaries.

## Roadmap

The next major areas are:

```txt
1. expand CellSelection APIs and support custom node names throughout selection mapping
2. add a core editing plugin with cell-range clipboard and delete behavior
3. split table repair into an incremental transaction API plus command wrapper
4. expand compatibility adapters beyond `HtmlTableMap`
5. harden malformed HTML / Excel / Word import and large-table performance
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
