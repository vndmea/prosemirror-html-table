# prosemirror-html-table

Section-aware ProseMirror table primitives for full HTML table structures.

## Install

```bash
npm install prosemirror-html-table
```

## What It Includes

- full HTML table schema helpers
- section-aware grid and `HtmlTableMap`
- commands for rows, columns, sections, merge/split, and normalization
- `CellSelection` and related table utilities

## Usage

```ts
import {
  HtmlTableMap,
  createHtmlTableGrid,
  fixTables,
  insertHtmlTable,
} from 'prosemirror-html-table';

const grid = createHtmlTableGrid(tableNode);
const tableMap = HtmlTableMap.get(tableNode);
```

This package is the ProseMirror core only. It does not include Tiptap extensions or default UI styles.
