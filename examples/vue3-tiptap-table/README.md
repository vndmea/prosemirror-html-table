# Vue 3 + Tiptap v3 HTML Table Demo

This example demonstrates `tiptap-html-table` in a Vue 3 + Tiptap v3 application.

It includes a full HTML table structure with:

- `caption`
- `colgroup` / `col`
- `thead`
- `tbody`
- `tfoot`
- `th` / `td`

## Getting Started

### Install Dependencies

From the repository root:

```bash
npm install
```

### Development

Start the development server:

```bash
npm run dev -w vue3-tiptap-table-demo
```

Then open the local Vite URL printed in the terminal.

### Build

**For local development:**
```bash
npm run build -w vue3-tiptap-table-demo
```

Output will be in `dist/` directory.

**For GitHub Pages deployment:**
```bash
npm run build:demo:pages
```

Output will be in `docs/` directory at the project root, ready to be deployed to GitHub Pages at `https://<username>.github.io/prosemirror-html-table/`.

## What to Try

Use the toolbar to test:

- Inserting a table
- Adding and deleting rows
- Adding and deleting columns
- Setting `colspan`
- Toggling header cell / row / column
- Moving to previous / next table cells
- Selecting cell / row / column / table
- Resizing columns by dragging edges
- Managing table sections (thead, tbody, tfoot)

