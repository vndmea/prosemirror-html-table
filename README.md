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

`HtmlTableMap` adds a section-aware compatibility layer on top of `createHtmlTableGrid`. It keeps table-relative positions, exposes `width`, `height`, `map`, and `cellPositions`, and mirrors the official `TableMap` helpers for `findCell`, `colCount`, `rectBetween`, `cellsInRect`, `positionAt`, and `nextCell`.

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
             moveColumnLeft, moveColumnRight, setColumnWidth,
             fitTableToWidth, distributeColumns
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

Cross-section behavior is explicit:

| Operation | Section policy |
| --- | --- |
| Selection, copy, cut, paste | Can span `thead`, `tbody`, and `tfoot`; slices preserve section wrappers. |
| `Shift-Arrow` selection | Stops at section boundaries by default; set `constrainShiftArrowToSection: false` to allow expansion. |
| `mergeCells` / `mergeOrSplit` merge path | Requires one rectangular section; cross-section selections return `false`. |
| `splitCell` | Splits only the current merged cell inside its own section. |
| `addRowBefore` / `addRowAfter`, `deleteRow`, `moveRowUp` / `moveRowDown`, `duplicateRow` | Operate within the active section. |
| `moveRowToIndex` | Same-section by default; set `allowCrossSectionMove: true` for explicit cross-section moves. |
| `moveRowToHead` / `moveRowToBody` / `moveRowToFoot` | Explicit cross-section conversion commands; blocked for rows entangled by rowspan. |
| Column add/delete/move/duplicate | Apply across all sections because columns are one logical table axis. |
| `sortBodyRowsByColumn` | Sorts only the active `tbody` section and returns `false` when merged cells make row order ambiguous. |

The core package also exports `tableEditing()` for pure ProseMirror usage and `officialCompat` helpers for migration-oriented code:

```ts
import { officialCompat, tableEditing } from 'prosemirror-html-table';
```

Pure ProseMirror users should install `tableEditing()` directly. Tiptap users should use `HtmlTableExtensions`; its editing plugin delegates the core selection, clipboard, keyboard, and repair behavior to `tableEditing()` while mapping Tiptap options such as `enableCellRangeClipboard`, `clearCellsOnDelete`, and `deleteTableOnAllCellsSelected`.

Header commands convert between `htmlTableHeaderCell` and `htmlTableCell` while preserving cell attributes, content, and marks.

Selection commands use a dedicated `CellSelection` for cell, row, and column ranges, while whole-table selection still uses `NodeSelection`.

### Official compatibility layer

`officialCompat` is a migration-oriented adapter for code that expects familiar `prosemirror-tables` helper names. It follows the project's full HTML table schema, so it is compatible at the API boundary but not a structural drop-in replacement for the official simple row model.

| Official API | This package | Status | Notes |
| --- | --- | --- | --- |
| `tableEditing()` | `tableEditing()` | Supported | Core ProseMirror plugin for cell selection, clipboard, keyboard behavior, and table repair. |
| `CellSelection` | `CellSelection` | Supported | Includes `content()`, `forEachCell()`, `rowSelection()`, and `colSelection()`; JSON uses `anchorCellPos` / `headCellPos`. |
| `TableMap` | `HtmlTableMap` | Supported adapter | Section-aware map with `findCell`, `colCount`, `nextCell`, `rectBetween`, `cellsInRect`, `positionAt`, and `get`. |
| `findTable()` | `officialCompat.findTable()` | Supported adapter | Returns the closest `htmlTable` node with table position metadata. |
| `findCellPos()` | `officialCompat.findCellPos()` | Supported adapter | Resolves a document position to the nearest table cell position when possible. |
| `findCellRange()` | `officialCompat.findCellRange()` | Supported adapter | Returns anchor/head cell positions only when both cells are in the same table. |
| `setCellAttr()` | `officialCompat.setCellAttr()` | Supported alias | Uses `setCellAttribute`; returns `false` when the current cell already has the requested value. |
| `splitCellWithType()` | `officialCompat.splitCellWithType()` | Supported adapter | Splits one merged cell and calls `getCellType` for each created cell. |
| `toggleHeader()` | `officialCompat.toggleHeader()` | Supported alias | Routes `row`, `column`, or `cell` to the matching section-aware command. |
| Official `tableNodes()` schema | `createHtmlTableNodeSpecs()` | Different by design | This project preserves `caption`, `colgroup`, `thead`, `tbody`, and `tfoot`. |

Pure ProseMirror setup:

```ts
import {
  createHtmlTableNodeSpecs,
  officialCompat,
  tableEditing,
} from 'prosemirror-html-table';

const tableNodes = createHtmlTableNodeSpecs();
const plugins = [
  tableEditing(),
];
const setVisited = officialCompat.setCellAttr('data-example', 'visited');
```

### Tiptap interaction layer

The Tiptap package now includes:

```txt
- custom table node view with optional wrapper
- tableEditing() option bridge for core editing behavior
- row and column handles with explicit selection state
- nested context menus for cell, row, and column actions
- row and column extend controls
- column resize handles with drag preview
- table width fitting and even column distribution from the table menu
- persisted colgroup / colwidth state
- cell, row, column, and table selection visuals
- native text selection inside cells
- Tab / Shift-Tab navigation
- Shift-Arrow cell-range expansion
- cell-range copy / cut / paste with HTML table + TSV clipboard data
- Delete / Backspace clearing for partial cell selections
- Backspace / Delete whole-table removal when every cell is selected
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
  enableRowColumnDrag: true,
  allowCrossSectionRowDrag: false,
  enableTabNavigation: true,
  addRowOnTabAtEnd: true,
  enableShiftArrowSelection: true,
  constrainShiftArrowToSection: true,
  deleteTableOnAllCellsSelected: true,
  enableCellRangeClipboard: true,
  expandTableOnPaste: false,
  clearCellsOnDelete: true,
  View: null,
  wrapperClassName: 'html-table-node__wrapper',
  selectedCellClassName: 'html-table-cell--selected',
  selectedTableClassName: 'html-table-node--selected',
}
```

Row and column handles support drag reorder by default. Cross-section row drag stays disabled unless `allowCrossSectionRowDrag` is enabled.

Use `editor.commands.fitHtmlTableToWidth()` to measure the current table wrapper and persist table width plus `colgroup` / `colwidth` values. Use `editor.commands.distributeHtmlTableColumns()` to assign equal column widths.

Keyboard shortcuts:

| Shortcut | Behavior |
| --- | --- |
| `Tab` | Move to the next cell. At the last cell, optionally add a row and continue. |
| `Shift-Tab` | Move to the previous cell. |
| `Shift-ArrowLeft/Right/Up/Down` | Expand the current `CellSelection` to an adjacent cell. |
| `Cmd/Ctrl-C` / `Cmd/Ctrl-X` | Copy or cut the current cell range as HTML table + TSV clipboard data. |
| `Cmd/Ctrl-V` | Paste HTML table fragments or TSV data into the current table selection. |
| `Backspace` / `Delete` | Clear a partial `CellSelection`, or delete the whole table when every logical cell is selected. |
| `Mod-Backspace` / `Mod-Delete` | Same whole-table delete behavior on macOS / platform modifier setups. |

By default, `Shift-Arrow` expansion treats `thead`, `tbody`, and `tfoot` boundaries as hard stops. Set `constrainShiftArrowToSection: false` to allow cross-section expansion.

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
- `HtmlTableMap` now provides a section-aware `TableMap`-style adapter, including `colCount`, but it is not a drop-in replacement because positions are resolved against the richer HTML table structure.
- `CellSelection` now includes the main official-style helpers such as `content()`, `forEachCell()`, `rowSelection()`, and `colSelection()`. Compatibility gaps may still exist around JSON shape and edge-case plugin behavior.
- Core `tableEditing()` now handles cell selection visuals, mouse selection, keyboard navigation, cell-range clipboard, delete behavior, and append-transaction repair. The remaining work is to document and harden edge cases rather than to add the basic plugin entry point.
- `setCellAttribute` updates the current cell and returns `false` when the target cell already has the requested value. Use the dedicated text-align, background-color, and vertical-align commands for selection-aware bulk formatting.
- `Shift-Arrow` range expansion currently treats section boundaries as hard boundaries.

## Roadmap

The next major areas are:

```txt
1. document the official compatibility layer and keep its API contract stable
2. support custom node names throughout CellSelection, tableEditing, clipboard, and compat helpers
3. continue closing official `tableEditing()` parity gaps around edge-case paste and repair flows
4. harden malformed HTML / Excel / Word import and large-table performance
5. add pure ProseMirror / compat demo coverage
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
