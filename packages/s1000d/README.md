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

## Entry Points

- `prosemirror-html-table-s1000d`
  - schema generation
  - XML import/export
  - validation / normalization
  - CALS resolver helpers
  - grid / map helpers
  - ProseMirror command helpers

- `prosemirror-html-table-s1000d/tiptap`
  - Tiptap extensions
  - Tiptap editing plugin
  - Tiptap-only options and types

- `prosemirror-html-table-s1000d/clipboard`
  - low-level clipboard serialization / parsing / apply helpers

- `prosemirror-html-table-s1000d/renderer`
  - final HTML rendering
  - no Tiptap dependency

See also:

- [`examples/s1000d-snippets/README.md`](../../examples/s1000d-snippets/README.md)
- [`examples/s1000d-snippets/schema-xml.ts`](../../examples/s1000d-snippets/schema-xml.ts)
- [`examples/s1000d-snippets/tiptap-basic.ts`](../../examples/s1000d-snippets/tiptap-basic.ts)
- [`examples/s1000d-snippets/clipboard-basic.ts`](../../examples/s1000d-snippets/clipboard-basic.ts)
- [`examples/s1000d-snippets/renderer-basic.ts`](../../examples/s1000d-snippets/renderer-basic.ts)

## Install

```bash
npm install prosemirror-html-table-s1000d prosemirror-model prosemirror-state
```

If you only use schema / XML helpers, `prosemirror-state` will often stay unused at runtime, but it is still a required peer today because the main entry also exports commands and selection helpers.

For Tiptap integration, also install:

```bash
npm install @tiptap/core prosemirror-view
```

## API Stability

Stable:

- schema generation
- XML import/export
- validation
- CALS resolver helpers
- grid / map helpers
- basic ProseMirror commands from the main entry
- Tiptap integration via `/tiptap`
- clipboard MVP via `/clipboard`
- HTML renderer MVP via `/renderer`

Experimental:

- `createS1000DTableNodeSpecs({ names })`
- section-heavy editor DOM shape in the Tiptap layer
- some renderer presentation details such as CALS `colwidth`
- extended-profile rendering details outside the covered MVP tests

Internal:

- Tiptap editor DOM structure
- ProseMirror plugin implementation details
- test helpers and source-relative internals

## Support Boundary

- `createS1000DTableNodeSpecs({ names })` is experimental and only applies to schema generation.
- Editing commands, clipboard helpers, renderer, and Tiptap integration currently support the default S1000D node names only.
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
  validateS1000DTable,
} from 'prosemirror-html-table-s1000d';

const table = parseS1000DTableXml(
  '<table><tgroup cols="1"><tbody><row><entry>A</entry></row></tbody></tgroup></table>',
  schema,
);

const validation = validateS1000DTable(table, { profile: 'proced' });
const xml = serializeS1000DTableXml(table);
```

XML export and HTML rendering are intentionally different output paths. Use XML export for S1000D/CALS round-trip, and use `/renderer` for final HTML output.

## Editing Commands

Available command helpers from the main entry include:

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

```ts
import { addS1000DRowAfter } from 'prosemirror-html-table-s1000d';

const handled = addS1000DRowAfter()(state, dispatch);
```

Command notes:

- commands currently support the default S1000D node names only
- graphic-only tables do not participate in normal row / column / cell commands

## Tiptap Integration

```ts
import { Editor } from '@tiptap/core';
import { createS1000DTableExtensions } from 'prosemirror-html-table-s1000d/tiptap';

const editor = new Editor({
  extensions: [
    ...createS1000DTableExtensions({ profile: 'proced' }),
  ],
});
```

You can also opt into the broader `extended` profile:

```ts
import { createS1000DTableExtensions } from 'prosemirror-html-table-s1000d/tiptap';

const extensions = createS1000DTableExtensions({ profile: 'extended' });
```

You can also use the lower-level plugin directly:

```ts
import {
  createS1000DTableEditingPlugin,
  defaultS1000DTableTiptapOptions,
} from 'prosemirror-html-table-s1000d/tiptap';

const plugin = createS1000DTableEditingPlugin(defaultS1000DTableTiptapOptions);
```

Tiptap notes:

- Tiptap `renderHTML` is editor DOM, not final HTML output
- the current section-heavy editor DOM should be treated as internal / experimental

## Clipboard Behavior

Low-level clipboard helpers are exposed from `prosemirror-html-table-s1000d/clipboard`.

```ts
import {
  parseS1000DHtmlClipboard,
  serializeS1000DCellSelectionToHtml,
} from 'prosemirror-html-table-s1000d/clipboard';
import { S1000DCellSelection } from 'prosemirror-html-table-s1000d';

const selection = S1000DCellSelection.create(state.doc, entryPos);
const nextState = state.apply(state.tr.setSelection(selection));
const html = serializeS1000DCellSelectionToHtml(nextState);
const parsed = html ? parseS1000DHtmlClipboard(html, state.schema) : null;
```

The S1000D clipboard layer supports:

- copying selected logical cell ranges as both HTML and TSV
- pasting TSV back into simple S1000D tables
- restoring multi-cell selections after paste
- deleting whole-table selections as a table operation

Current clipboard paste support intentionally stays conservative:

- simple rectangular single-span cell ranges are supported
- complex merged target/source overlays are not expanded automatically yet

## HTML Rendering

Use the renderer subpath when you need final HTML output instead of editor DOM:

```ts
import { renderS1000DTableToHtml } from 'prosemirror-html-table-s1000d/renderer';

const html = renderS1000DTableToHtml(tableNode, {
  strict: true,
  includeRawAttrs: true,
});
```

Renderer notes:

- editor DOM and final HTML are different outputs
- the renderer does not reuse Tiptap `renderHTML`
- the renderer does not depend on Tiptap or `prosemirror-view`
- the renderer currently focuses on HTML table MVP output
- graphic-only tables are not yet supported by the renderer
- the renderer is not used for XML round-trip
- `colwidth` is currently mapped conservatively and CALS values such as `1*` are not full CSS layout semantics
- header cells currently render as `td`, not `th`

## Profiles

- `proced`
  - targets the default `proced.xsd` table subset
  - does not allow `spanspec`, `tfoot`, or graphic-only tables
  - is the safer default when you want the `proced.xsd` subset

- `extended`
  - keeps the broader CALS/S1000D superset
  - supports `spanspec`, `tfoot`, richer entry blocks, and graphic-only tables at the schema / XML layer
  - renderer MVP still does not support graphic-only table HTML output
  - does not imply a full S1000D content model
