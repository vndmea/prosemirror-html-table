import { DOMSerializer, Fragment, Schema, type Node as ProseMirrorNode } from 'prosemirror-model';
import { EditorState, TextSelection, type Command } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import {
  CellSelection,
  HtmlTableMap,
  createHtmlTableNodeSpecs,
  fixTables,
  officialCompat,
  tableEditing,
} from 'prosemirror-html-table';

import 'prosemirror-view/style/prosemirror.css';
import './styles.css';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    text: { group: 'inline' },
    paragraph: {
      group: 'block',
      content: 'inline*',
      parseDOM: [{ tag: 'p' }],
      toDOM: () => ['p', 0],
    },
    ...createHtmlTableNodeSpecs(),
  },
});

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main class="app">
    <div class="topbar">
      <button data-command="select-all">Select table cells</button>
      <button data-command="select-row">Select first row</button>
      <button data-command="toggle-header-row">Toggle header row</button>
      <button data-command="mark-cell">Set compat attr</button>
      <button data-command="fix-tables">Fix tables</button>
      <button data-command="reset">Reset</button>
    </div>
    <section class="layout">
      <div class="editor-shell">
        <div id="editor"></div>
      </div>
      <aside class="inspector">
        <div class="panel">
          <div class="panel-title">Status</div>
          <pre id="status"></pre>
        </div>
        <div class="panel">
          <div class="panel-title">CellSelection.content()</div>
          <pre id="selection-json"></pre>
        </div>
        <div class="panel">
          <div class="panel-title">Document JSON</div>
          <pre id="doc-json"></pre>
        </div>
        <div class="panel">
          <div class="panel-title">Serialized HTML</div>
          <pre id="html-output"></pre>
        </div>
      </aside>
    </section>
  </main>
`;

const editorMount = document.querySelector<HTMLDivElement>('#editor')!;
const statusOutput = document.querySelector<HTMLPreElement>('#status')!;
const selectionOutput = document.querySelector<HTMLPreElement>('#selection-json')!;
const docOutput = document.querySelector<HTMLPreElement>('#doc-json')!;
const htmlOutput = document.querySelector<HTMLPreElement>('#html-output')!;

const view = new EditorView(editorMount, {
  state: createDemoState(),
  dispatchTransaction(transaction) {
    view.updateState(view.state.apply(transaction));
    renderInspector();
  },
});

document.querySelector<HTMLDivElement>('.topbar')!.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-command]');
  if (!button) return;

  runToolbarCommand(button.dataset.command ?? '');
});

renderInspector();

function createDemoState(): EditorState {
  const doc = createDemoDoc();
  return EditorState.create({
    schema,
    doc,
    plugins: [
      tableEditing(),
    ],
    selection: TextSelection.create(doc, 1),
  });
}

function createDemoDoc(): ProseMirrorNode {
  return schema.nodes.doc!.create(null, [
    schema.nodes.paragraph!.create(null, schema.text('Pure ProseMirror table editing')),
    createSectionedTable(),
  ]);
}

function createSectionedTable(): ProseMirrorNode {
  return schema.nodes.htmlTable!.create({ width: 640 }, [
    schema.nodes.htmlTableCaption!.create(null, schema.text('Quarterly metrics')),
    schema.nodes.htmlTableColgroup!.create(null, [
      schema.nodes.htmlTableCol!.create({ width: 160 }),
      schema.nodes.htmlTableCol!.create({ width: 240 }),
      schema.nodes.htmlTableCol!.create({ width: 240 }),
    ]),
    schema.nodes.htmlTableHead!.create(null, [
      createRow(['Metric', 'North', 'South'], true),
    ]),
    schema.nodes.htmlTableBody!.create(null, [
      createRow(['Revenue', '$120k', '$98k']),
      createRow(['Pipeline', '$210k', '$175k']),
    ]),
    schema.nodes.htmlTableFoot!.create(null, [
      createRow(['Total', '$330k', '$273k']),
    ]),
  ]);
}

function createRow(texts: string[], isHeader = false): ProseMirrorNode {
  const cellType = isHeader ? schema.nodes.htmlTableHeaderCell! : schema.nodes.htmlTableCell!;
  return schema.nodes.htmlTableRow!.create(null, texts.map((text) =>
    cellType.create(null, [
      schema.nodes.paragraph!.create(null, text ? schema.text(text) : undefined),
    ])));
}

function runToolbarCommand(name: string): void {
  switch (name) {
    case 'select-all':
      selectTableCells();
      return;
    case 'select-row':
      selectFirstRow();
      return;
    case 'toggle-header-row':
      runCommand(officialCompat.toggleHeader('row'));
      return;
    case 'mark-cell':
      runCommand(officialCompat.setCellAttr('backgroundColor', '#fef3c7'));
      return;
    case 'fix-tables':
      runCommand(fixTables());
      return;
    case 'reset':
      view.updateState(createDemoState());
      renderInspector();
      return;
    default:
      return;
  }
}

function runCommand(command: Command): void {
  command(view.state, (transaction) => view.dispatch(transaction), view);
  view.focus();
  renderInspector();
}

function selectTableCells(): void {
  const cells = findCellPositions(view.state.doc);
  if (cells.length === 0) return;
  view.dispatch(view.state.tr.setSelection(CellSelection.create(view.state.doc, cells[0]!, cells[cells.length - 1]!)));
  view.focus();
}

function selectFirstRow(): void {
  const cells = findCellPositions(view.state.doc);
  if (cells.length < 3) return;
  const $first = view.state.doc.resolve(cells[0]!);
  const $third = view.state.doc.resolve(cells[2]!);
  view.dispatch(view.state.tr.setSelection(CellSelection.rowSelection($first, $third)));
  view.focus();
}

function findCellPositions(doc: ProseMirrorNode): number[] {
  const positions: number[] = [];
  doc.descendants((node, pos) => {
    if (node.type.spec.tableRole === 'cell' || node.type.spec.tableRole === 'header_cell') {
      positions.push(pos);
    }
    return true;
  });
  return positions;
}

function renderInspector(): void {
  const selection = view.state.selection;
  const table = officialCompat.findTable(selection.$from);
  const map = table ? HtmlTableMap.get(table.node) : null;
  const range = officialCompat.findCellRange(selection);

  statusOutput.textContent = JSON.stringify({
    selection: selection.constructor.name,
    tableFound: Boolean(table),
    tablePos: table?.pos ?? null,
    cellRange: range ? [range[0].pos, range[1].pos] : null,
    map: map ? { width: map.width, height: map.height, cells: map.grid.cells.length } : null,
  }, null, 2);

  selectionOutput.textContent = selection instanceof CellSelection
    ? JSON.stringify(selection.content().content.toJSON(), null, 2)
    : 'Select a cell range to inspect the slice content.';

  docOutput.textContent = JSON.stringify(view.state.doc.toJSON(), null, 2);
  htmlOutput.textContent = serializeDocHtml(view.state.doc);
}

function serializeDocHtml(doc: ProseMirrorNode): string {
  const container = document.createElement('div');
  const serializer = DOMSerializer.fromSchema(schema);
  container.appendChild(serializer.serializeFragment(Fragment.from(doc.content)));
  return container.innerHTML;
}
