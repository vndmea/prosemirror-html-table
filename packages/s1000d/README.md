# prosemirror-html-table-s1000d

S1000D/CALS table support for `prosemirror-html-table`.

This package focuses on the S1000D table subset used by `proced.xsd`, while also providing an `extended` profile for broader CALS/S1000D table structures such as `spanspec`, `tfoot`, and graphic-only tables.

## Features

- S1000D table schema for `proced` and `extended` profiles
- XML import/export for S1000D table fragments
- Grid, map, normalization, validation, and editing commands
- `S1000DCellSelection` for logical table selections
- Tiptap extensions via the `prosemirror-html-table-s1000d/tiptap` subpath
- S1000D-specific clipboard helpers via the `prosemirror-html-table-s1000d/clipboard` subpath
- HTML renderer MVP via the `prosemirror-html-table-s1000d/renderer` subpath

## Install

```bash
npm install prosemirror-html-table-s1000d prosemirror-model
```

For clipboard helpers, also install:

```bash
npm install prosemirror-state
```

For Tiptap integration, also install:

```bash
npm install @tiptap/core prosemirror-state prosemirror-view
```

## Support Boundary

- `createS1000DTableNodeSpecs({ names })` is experimental and only applies to schema generation.
- Editing commands, clipboard helpers, and Tiptap integration currently support the default S1000D node names only.
- The Tiptap DOM is an editor-internal structure and is not the same thing as a final HTML renderer for S1000D/CALS tables.
- Browsers normalize nested table-section DOM. In current Tiptap output, section-bearing `tgroup` content such as `thead` and `tbody` can be hoisted out of the `tgroup` wrapper by the browser parser, so section-heavy editor DOM should be treated as experimental until the rendering model is redesigned.
- XML export and HTML rendering are separate output paths.
- Final HTML rendering should use `prosemirror-html-table-s1000d/renderer`, not Tiptap `renderHTML`.
- The renderer does not depend on Tiptap and currently targets an HTML table MVP only.
- `entryBlock` remains a lightweight content model, not the full S1000D content model.

## Schema

```ts
import { Schema } from 'prosemirror-model';
import { createS1000DTableNodeSpecs } from 'prosemirror-html-table-s1000d';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    text: { group: 'inline' },
    paragraph: {
      group: 'block',
      content: 'inline*',
      toDOM: () => ['p', 0],
      parseDOM: [{ tag: 'p' }],
    },
    ...createS1000DTableNodeSpecs({ profile: 'proced' }),
  },
});
```

## XML Import/Export

```ts
import {
  parseS1000DTableXml,
  serializeS1000DTableXml,
} from 'prosemirror-html-table-s1000d';

const table = parseS1000DTableXml(
  '<table><tgroup cols="1"><tbody><row><entry>A</entry></row></tbody></tgroup></table>',
  schema,
);

const xml = serializeS1000DTableXml(table);
```

## Editing Commands

Available command helpers include:

- `addS1000DRowBefore`
- `addS1000DRowAfter`
- `deleteS1000DRow`
- `addS1000DColumnBefore`
- `addS1000DColumnAfter`
- `deleteS1000DColumn`
- `moveS1000DRowUp`
- `moveS1000DRowDown`
- `moveS1000DColumnLeft`
- `moveS1000DColumnRight`
- `mergeS1000DCells`
- `splitS1000DCell`
- `mergeOrSplitS1000DCell`

## Tiptap Integration

```ts
import { Editor } from '@tiptap/core';
import { createS1000DTableExtensions } from 'prosemirror-html-table-s1000d/tiptap';

const editor = new Editor({
  extensions: [
    ...createS1000DTableExtensions({ profile: 'extended' }),
  ],
});
```

You can also use the lower-level plugin directly:

```ts
import {
  createS1000DTableEditingPlugin,
  defaultS1000DTableTiptapOptions,
} from 'prosemirror-html-table-s1000d/tiptap';

const plugin = createS1000DTableEditingPlugin(defaultS1000DTableTiptapOptions);
```

## HTML Rendering

Use the renderer subpath when you need final HTML output instead of editor DOM:

```ts
import { renderS1000DTableToHtml } from 'prosemirror-html-table-s1000d/renderer';

const html = renderS1000DTableToHtml(tableNode);
```

Renderer notes:

- editor DOM and final HTML are different outputs
- the renderer does not reuse Tiptap `renderHTML`
- the renderer currently focuses on HTML table MVP output
- graphic-only tables are not yet supported by the renderer
- the renderer is not used for XML round-trip

## Clipboard Behavior

Low-level clipboard helpers are exposed from `prosemirror-html-table-s1000d/clipboard`.

The S1000D clipboard layer supports:

- copying selected logical cell ranges as both HTML and TSV
- pasting TSV back into simple S1000D tables
- restoring multi-cell selections after paste
- deleting whole-table selections as a table operation

Current clipboard paste support intentionally stays conservative:

- simple rectangular single-span cell ranges are supported
- complex merged target/source overlays are not expanded automatically yet

## Profiles

- `proced`
  - targets the default `proced.xsd` table subset
  - does not allow `spanspec`, `tfoot`, or graphic-only tables
- `extended`
  - keeps the broader CALS/S1000D superset
  - supports `spanspec`, `tfoot`, richer entry blocks, and graphic-only tables
