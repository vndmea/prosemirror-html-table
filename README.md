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
A minimal pure ProseMirror compatibility demo is available in `examples/prosemirror-compat-demo`.
A React + Tiptap S1000D visual demo is available in `examples/s1000d-react-demo`.

Online:

[Playground](https://vndmea.github.io/prosemirror-html-table/)

Local:

```bash
npm install
npm run dev --workspace vue3-tiptap-table-demo
npm run dev --workspace prosemirror-compat-demo
npm run dev:demo:s1000d
```

The Vue playground is the full Tiptap integration surface: it includes a full HTML table with `caption`, `colgroup`, `thead`, `tbody`, and `tfoot`, plus row/column handles, nested context menus, resize and extend controls, selection overlays, and a compact toolbar for table-level commands.
The pure ProseMirror demo is the minimal compatibility surface: it exercises `tableEditing()`, `CellSelection.content()`, `officialCompat`, JSON output, and serialized HTML output without Tiptap.
The S1000D React demo is the visual package-level verification surface: it loads S1000D XML, renders editable tables, runs S1000D commands, exports XML, renders final HTML, and exercises the clipboard MVP.

## E2E test suites

- `npm run test:e2e`
  - runs the full end-to-end suite
  - first the Vue/Tiptap demo tests
  - then the S1000D React demo tests

- `npm run test:e2e:tiptap`
  - runs the original Vue/Tiptap demo E2E suite only

- `npm run test:e2e:s1000d`
  - runs the S1000D React demo E2E suite only

## S1000D demo surfaces

- `examples/s1000d-snippets`
  - API snippets only
  - meant for typecheck coverage and copy/paste examples
  - not a visual browser demo

- `examples/s1000d-react-demo`
  - visual React demo
  - local run: `npm run dev:demo:s1000d`
  - E2E: `npm run test:e2e:s1000d`
  - included in full E2E: `npm run test:e2e`

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

`createFixTablesTransaction(state, oldState)` scopes repair to tables touched by the document diff. Omit `oldState` for a full-document `fixTables` pass.

Pure ProseMirror users should install `tableEditing()` directly. Tiptap users should use `HtmlTableExtensions`; its editing plugin delegates the core selection, clipboard, keyboard, and repair behavior to `tableEditing()` while mapping Tiptap options such as `enableCellRangeClipboard`, `clearCellsOnDelete`, and `deleteTableOnAllCellsSelected`.

Header commands convert between `htmlTableHeaderCell` and `htmlTableCell` while preserving cell attributes, content, and marks.

Selection commands use a dedicated `CellSelection` for cell, row, and column ranges, while whole-table selection still uses `NodeSelection`.

### Official compatibility layer

`officialCompat` is a migration-oriented adapter for code that expects familiar `prosemirror-tables` helper names. It follows the project's full HTML table schema, so it is compatible at the API boundary but not a structural drop-in replacement for the official simple row model.

| Official API | This package | Status | Notes |
| --- | --- | --- | --- |
| `tableEditing()` | `tableEditing()` | Supported | Core ProseMirror plugin for cell selection, clipboard, keyboard behavior, and table repair. |
| `CellSelection` | `CellSelection` | Supported | Includes `content()`, `forEachCell()`, `rowSelection()`, and `colSelection()`; JSON emits official `anchor` / `head` and still reads legacy `anchorCellPos` / `headCellPos`. |
| `TableMap` | `TableMap` / `HtmlTableMap` | Supported adapter | `TableMap` is a compat alias for `HtmlTableMap`; section-aware map with `findCell`, `colCount`, `nextCell`, `rectBetween`, `cellsInRect`, `positionAt`, and `get`. |
| `TableRect` | `TableRect` / `HtmlTableRect` | Supported type alias | Compat alias for the rectangle shape returned by `TableMap` helpers. |
| `CellSelectionJSON` | `CellSelectionJSON` | Supported type | Uses official `anchor` / `head`; legacy `anchorCellPos` / `headCellPos` is still accepted on read. |
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

### API stability

Stable core APIs include schema helpers, `HtmlTableMap` / `TableMap`, `CellSelection`, `tableEditing()`, normalization helpers, clipboard helpers, and the command set documented above. `officialCompat` exports are stable adapter names for migration, but they still operate on this package's full HTML table schema. Tiptap node extensions, command wrappers, options, and `HtmlTableExtensions` are stable public entry points.

Experimental interaction APIs include Tiptap context menu, handle, overlay geometry, and DOM measurement helpers. They are exported for advanced integrations and the bundled demos, but their exact shapes may change before a stable major release.

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
- cell-range copy / cut / paste with HTML table + TSV clipboard data, including CF_HTML / Office wrapper normalization
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

Official Tiptap Table / TableKit parity:

| Official item | This package | Status | Notes |
| --- | --- | --- | --- |
| `TableKit` bundle | `HtmlTableExtensions` | Different bundle | Official TableKit bundles `Table`, `TableRow`, `TableCell`, and `TableHeader`; this package also includes `caption`, `colgroup`, `col`, `thead`, `tbody`, and `tfoot` nodes. |
| `HTMLAttributes` | `HTMLAttributes` | Supported | Applied to the rendered table element. |
| `resizable` | `resizable` | Supported | Uses this package's resize view and persists widths through `colgroup` / `colwidth`. |
| `renderWrapper` | `renderWrapper` | Supported | Controls the table wrapper used by the node view. |
| `handleWidth` | `handleWidth` | Supported | Width of resize / handle affordances. |
| `cellMinWidth` | `cellMinWidth` | Supported | Minimum column width used by resize and fit operations. |
| `View` | `View` | Supported | Custom table node view class hook. |
| `lastColumnResizable` | `lastColumnResizable` | Supported | Blocks the last resize handle when disabled. |
| `allowTableNodeSelection` | `allowTableNodeSelection` | Supported | Also controls direct table handle selection. |

| Official command | This package | Status | Notes |
| --- | --- | --- | --- |
| `insertTable` | `insertHtmlTable` | Supported | Adds options for caption and full HTML table sections. |
| `addColumnBefore` / `addColumnAfter` | `addHtmlTableColumnBefore` / `addHtmlTableColumnAfter` | Supported | Applies across all sections as one logical table axis. |
| `deleteColumn` | `deleteHtmlTableColumn` | Supported | Keeps `colgroup` aligned with the logical grid. |
| `addRowBefore` / `addRowAfter` | `addHtmlTableRowBefore` / `addHtmlTableRowAfter` | Supported | Section-aware; inserts in the active section. |
| `deleteRow` | `deleteHtmlTableRow` | Supported | Section-aware row deletion. |
| `deleteTable` | `deleteHtmlTable` | Supported | Deletes the active table. |
| `mergeCells` / `splitCell` / `mergeOrSplit` | `mergeHtmlTableCells` / `splitHtmlTableCell` / `mergeOrSplitHtmlTableCells` | Supported | Merge requires one rectangular section; split operates on the current merged cell. |
| `toggleHeaderColumn` / `toggleHeaderRow` / `toggleHeaderCell` | `toggleHtmlTableHeaderColumn` / `toggleHtmlTableHeaderRow` / `toggleHtmlTableHeaderCell` | Supported | Converts `td` / `th` while preserving attrs and content. |
| `setCellAttribute` | `setHtmlTableCellAttribute` | Supported | Current-cell command; dedicated selection-aware commands exist for text align, background, and vertical align. |
| `goToNextCell` / `goToPreviousCell` | `goToNextHtmlTableCell` / `goToPreviousHtmlTableCell` | Supported | Optional cycling is available. |
| `fixTables` | `fixHtmlTables` | Supported | Uses the full HTML table normalizer. |

Project-specific enhancements include `caption` and `colgroup` commands, explicit `thead` / `tbody` / `tfoot` section commands, row / column duplication and movement, row / column drag handles, body row sorting, table fit / distribute width commands, and section-aware cell range clipboard behavior.

Intentional differences: node names and document structure are not drop-in replacements for official Tiptap TableKit; the grid is section-aware; cross-section merge is rejected by default; `HtmlTableExtensions` is the recommended Tiptap entry point instead of mixing official TableKit nodes with this package.

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
1. collect real Office / Excel / Google Sheets clipboard fixtures
2. add large-table and collaboration-style stress regression tests
3. keep tightening edge-case paste flows and release docs
```

## Development

```bash
npm install
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
```

Run the Vue demo:

```bash
npm run dev --workspace vue3-tiptap-table-demo
```

Run the pure ProseMirror compat demo:

```bash
npm run dev --workspace prosemirror-compat-demo
```

Run only the original Vue/Tiptap E2E suite:

```bash
npm run test:e2e:tiptap
```

Run only the S1000D React demo E2E suite:

```bash
npm run test:e2e:s1000d
```

## License

MIT
