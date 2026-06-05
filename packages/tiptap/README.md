# tiptap-html-table

Tiptap v3 extensions for editing full HTML table structures.

## Install

```bash
npm install tiptap-html-table prosemirror-html-table
```

## Usage

```ts
import { Editor } from '@tiptap/core';
import { HtmlTableExtensions } from 'tiptap-html-table';
import 'tiptap-html-table/styles.css';

const editor = new Editor({
  extensions: [
    ...HtmlTableExtensions,
  ],
});
```

## What It Includes

- Tiptap extensions for `table`, `caption`, `colgroup`, `thead`, `tbody`, and `tfoot`
- command wrappers built on top of `prosemirror-html-table`
- node view, interaction plugins, handles, overlays, and context menus
- default CSS theme exposed via `tiptap-html-table/styles.css`

You can override the default look with your own CSS variables and class-based styles.
