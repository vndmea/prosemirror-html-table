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
packages/core    ProseMirror schema helpers, table model types, and table utilities
packages/tiptap  Tiptap v3 node extensions built on top of the core package
```

## Install

```bash
npm install prosemirror-html-table
```

For Tiptap projects:

```bash
npm install tiptap-html-table prosemirror-html-table
```

## Status

This repository currently provides the initial monorepo structure and a minimal schema/extension foundation. Advanced table editing commands such as column insertion, row deletion, cell selection, merge/split, resizing, and table normalization will be implemented progressively.

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
