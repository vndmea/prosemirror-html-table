import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { EditorContent, useEditor } from '@tiptap/react';
import type { Editor as TiptapEditor } from '@tiptap/core';
import { useEffect, useMemo, useState } from 'react';
import { NodeSelection, type EditorState } from 'prosemirror-state';

import {
  S1000DCellSelection,
  isS1000DCellSelection,
  serializeS1000DTableXml,
  validateS1000DTable,
  type S1000DTableProfile,
} from 'prosemirror-html-table-s1000d';
import {
  applyS1000DClipboardToSelection,
  clearS1000DSelectedCells,
  getS1000DSelectionInfo,
  isWholeS1000DTableSelection,
  parseS1000DPlainTextClipboard,
  serializeS1000DCellSelectionToHtml,
  serializeS1000DCellSelectionToText,
} from 'prosemirror-html-table-s1000d/clipboard';
import { renderS1000DTableToHtml } from 'prosemirror-html-table-s1000d/renderer';
import { createS1000DTableExtensions } from 'prosemirror-html-table-s1000d/tiptap';

import {
  createDocFromS1000DXml,
  findFirstS1000DTable,
  focusFirstBodyCell,
  selectFirstBodyCell,
  selectFirstBodyColumn,
  selectFirstBodyRow,
  selectFirstTwoBodyCells,
  selectWholeTable,
} from './editor';
import {
  extendedSampleXml,
  procedSampleXml,
  sampleTsv,
  unsafeRawAttrsSampleXml,
} from './samples';

type ValidationOutput = {
  valid: boolean;
  issues: Array<{ message: string; code?: string | undefined }>;
};

type ClipboardOutput = {
  html: string;
  text: string;
};

type SampleKind = 'proced' | 'extended' | 'unsafe';

function inferProfile(kind: SampleKind): S1000DTableProfile {
  return kind === 'proced' ? 'proced' : 'extended';
}

function getSampleXml(kind: SampleKind): string {
  switch (kind) {
    case 'extended':
      return extendedSampleXml;
    case 'unsafe':
      return unsafeRawAttrsSampleXml;
    default:
      return procedSampleXml;
  }
}

function toValidationOutput(state: EditorState | null, profile: S1000DTableProfile): ValidationOutput {
  if (!state) {
    return { valid: false, issues: [{ message: 'Editor state is not ready yet.' }] };
  }

  const table = findFirstS1000DTable(state.doc)?.table;
  if (!table) {
    return { valid: false, issues: [{ message: 'No S1000D table is loaded.' }] };
  }

  const result = validateS1000DTable(table, { profile });
  return {
    valid: result.valid,
    issues: result.issues.map((issue) => ({ message: issue.message })),
  };
}

function stringify(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

export function App() {
  const [profile, setProfile] = useState<S1000DTableProfile>('proced');
  const [validationOutput, setValidationOutput] = useState<ValidationOutput>({
    valid: false,
    issues: [{ message: 'Load a sample to start.' }],
  });
  const [xmlOutput, setXmlOutput] = useState('');
  const [htmlOutput, setHtmlOutput] = useState('');
  const [htmlPreview, setHtmlPreview] = useState('');
  const [clipboardOutput, setClipboardOutput] = useState<ClipboardOutput>({ html: '', text: '' });
  const [selectionSummary, setSelectionSummary] = useState('No selection yet.');

  const extensions = useMemo(() => [
    Document,
    Paragraph,
    Text,
    ...createS1000DTableExtensions({ profile: 'extended' }),
  ], []);

  const editor = useEditor({
    extensions: extensions as never,
    autofocus: false,
    content: '<p>Load a sample to start.</p>',
    onUpdate: ({ editor: activeEditor }: { editor: TiptapEditor }) => {
      updateOutputs(activeEditor.state, profile, setValidationOutput, setSelectionSummary);
    },
    onSelectionUpdate: ({ editor: activeEditor }: { editor: TiptapEditor }) => {
      updateOutputs(activeEditor.state, profile, setValidationOutput, setSelectionSummary);
    },
  });

  useEffect(() => {
    if (!editor) return;
    loadSample('proced');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  function updateAll(state: EditorState | null, nextProfile: S1000DTableProfile) {
    updateOutputs(state, nextProfile, setValidationOutput, setSelectionSummary);
    if (!state) {
      setXmlOutput('');
      setHtmlOutput('');
      setHtmlPreview('');
    }
  }

  function loadSample(kind: SampleKind) {
    if (!editor) return;
    const nextProfile = inferProfile(kind);
    const doc = createDocFromS1000DXml(editor.schema, getSampleXml(kind), nextProfile);
    editor.commands.setContent(doc.toJSON());
    setProfile(nextProfile);

    const state = editor.state;
    const focusTr = focusFirstBodyCell(state);
    if (focusTr) {
      editor.view.dispatch(focusTr);
    }

    updateAll(editor.state, nextProfile);
    setXmlOutput('');
    setHtmlOutput('');
    setHtmlPreview('');
    setClipboardOutput({ html: '', text: '' });
  }

  function runEditorCommand(command: () => boolean) {
    if (!editor) return;
    command();
    editor.commands.focus();
    updateAll(editor.state, profile);
  }

  function runSelectionHelper(builder: (state: EditorState) => ReturnType<typeof focusFirstBodyCell>) {
    if (!editor) return;
    const tr = builder(editor.state);
    if (!tr) return;
    editor.view.dispatch(tr);
    editor.commands.focus();
    updateAll(editor.state, profile);
  }

  function validateCurrentTable() {
    updateAll(editor?.state ?? null, profile);
  }

  function exportXml() {
    if (!editor) return;
    const table = findFirstS1000DTable(editor.state.doc)?.table;
    if (!table) return;
    setXmlOutput(serializeS1000DTableXml(table, { profile }));
  }

  function renderHtml(includeRawAttrs = false) {
    if (!editor) return;
    const table = findFirstS1000DTable(editor.state.doc)?.table;
    if (!table) return;
    const html = renderS1000DTableToHtml(table, { profile, strict: false, includeRawAttrs });
    setHtmlOutput(html);
    setHtmlPreview(html);
  }

  function copySelection() {
    if (!editor) return;
    const html = serializeS1000DCellSelectionToHtml(editor.state) ?? '';
    const text = serializeS1000DCellSelectionToText(editor.state) ?? '';
    setClipboardOutput({ html, text });
  }

  function pasteSampleTsv() {
    if (!editor) return;
    const clipboard = parseS1000DPlainTextClipboard(sampleTsv, editor.schema);
    if (!clipboard) return;
    applyS1000DClipboardToSelection(editor.state, editor.view.dispatch, clipboard);
    editor.commands.focus();
    updateAll(editor.state, profile);
  }

  function clearSelectedCells() {
    if (!editor) return;
    clearS1000DSelectedCells(editor.state, editor.view.dispatch);
    editor.commands.focus();
    updateAll(editor.state, profile);
  }

  const editorDomContainsDataAttrs = editor?.view.dom.innerHTML.includes('data-s1000d') ?? false;
  const commands = editor?.commands as unknown as Record<string, (() => boolean) | undefined> | undefined;

  return (
    <main className="s1000d-demo">
      <h1 data-testid="s1000d-demo-title">S1000D Table Demo</h1>
      <p>
        The editor DOM is internal and may include <code>data-s1000d</code>. The final HTML output below comes from the
        standalone renderer and is a separate output path.
      </p>

      <div className="s1000d-demo__actions">
        <button data-testid="load-proced" type="button" onClick={() => loadSample('proced')}>Load proced sample</button>
        <button data-testid="load-extended" type="button" onClick={() => loadSample('extended')}>Load extended sample</button>
        <button data-testid="load-unsafe" type="button" onClick={() => loadSample('unsafe')}>Load unsafe attrs sample</button>
        <button data-testid="validate" type="button" onClick={validateCurrentTable}>Validate</button>
        <button data-testid="export-xml" type="button" onClick={exportXml}>Export XML</button>
        <button data-testid="render-html" type="button" onClick={() => renderHtml(false)}>Render HTML</button>
        <button data-testid="render-html-raw" type="button" onClick={() => renderHtml(true)}>Render HTML with raw attrs</button>
      </div>

      <div className="s1000d-demo__actions">
        <button data-testid="add-row-before" type="button" onClick={() => runEditorCommand(() => commands?.addS1000DTableRowBefore?.() ?? false)}>Add row before</button>
        <button data-testid="add-row-after" type="button" onClick={() => runEditorCommand(() => commands?.addS1000DTableRowAfter?.() ?? false)}>Add row after</button>
        <button data-testid="delete-row" type="button" onClick={() => runEditorCommand(() => commands?.deleteS1000DTableRow?.() ?? false)}>Delete row</button>
        <button data-testid="move-row-up" type="button" onClick={() => runEditorCommand(() => commands?.moveS1000DTableRowUp?.() ?? false)}>Move row up</button>
        <button data-testid="move-row-down" type="button" onClick={() => runEditorCommand(() => commands?.moveS1000DTableRowDown?.() ?? false)}>Move row down</button>
      </div>

      <div className="s1000d-demo__actions">
        <button data-testid="add-column-before" type="button" onClick={() => runEditorCommand(() => commands?.addS1000DTableColumnBefore?.() ?? false)}>Add column before</button>
        <button data-testid="add-column-after" type="button" onClick={() => runEditorCommand(() => commands?.addS1000DTableColumnAfter?.() ?? false)}>Add column after</button>
        <button data-testid="delete-column" type="button" onClick={() => runEditorCommand(() => commands?.deleteS1000DTableColumn?.() ?? false)}>Delete column</button>
        <button data-testid="move-column-left" type="button" onClick={() => runEditorCommand(() => commands?.moveS1000DTableColumnLeft?.() ?? false)}>Move column left</button>
        <button data-testid="move-column-right" type="button" onClick={() => runEditorCommand(() => commands?.moveS1000DTableColumnRight?.() ?? false)}>Move column right</button>
      </div>

      <div className="s1000d-demo__actions">
        <button data-testid="merge-cells" type="button" onClick={() => runEditorCommand(() => commands?.mergeS1000DTableCells?.() ?? false)}>Merge cells</button>
        <button data-testid="split-cell" type="button" onClick={() => runEditorCommand(() => commands?.splitS1000DTableCell?.() ?? false)}>Split cell</button>
        <button data-testid="merge-or-split-cell" type="button" onClick={() => runEditorCommand(() => commands?.mergeOrSplitS1000DTableCell?.() ?? false)}>Merge or split cell</button>
        <button data-testid="select-cell" type="button" onClick={() => runSelectionHelper(selectFirstBodyCell)}>Select first body cell</button>
        <button data-testid="select-row" type="button" onClick={() => runSelectionHelper(selectFirstBodyRow)}>Select first body row</button>
        <button data-testid="select-column" type="button" onClick={() => runSelectionHelper(selectFirstBodyColumn)}>Select first body column</button>
        <button data-testid="select-first-two-cells" type="button" onClick={() => runSelectionHelper(selectFirstTwoBodyCells)}>Select first two body cells</button>
        <button data-testid="select-table" type="button" onClick={() => runSelectionHelper(selectWholeTable)}>Select whole table</button>
        <button data-testid="clear-selection" type="button" onClick={clearSelectedCells}>Clear selected cells</button>
      </div>

      <div className="s1000d-demo__actions">
        <button data-testid="copy-selection" type="button" onClick={copySelection}>Copy selection</button>
        <button data-testid="paste-tsv" type="button" onClick={pasteSampleTsv}>Paste sample TSV</button>
      </div>

      <div className="s1000d-demo__editor" data-testid="editor">
        {editor ? <EditorContent editor={editor} /> : null}
      </div>

      <p data-testid="selection-output">{selectionSummary}</p>
      <p data-testid="editor-dom-output">Editor DOM has data-s1000d: {String(editorDomContainsDataAttrs)}</p>
      <p data-testid="clipboard-html-length">Copied HTML length: {clipboardOutput.html.length}</p>
      <pre data-testid="clipboard-text-output">{clipboardOutput.text}</pre>
      <pre data-testid="validation-output">{stringify(validationOutput)}</pre>
      <pre data-testid="xml-output">{xmlOutput}</pre>
      <pre data-testid="html-output">{htmlOutput}</pre>
      <div
        className="s1000d-demo__preview"
        data-testid="html-preview"
        dangerouslySetInnerHTML={{ __html: htmlPreview }}
      />
    </main>
  );
}

function updateOutputs(
  state: EditorState | null,
  profile: S1000DTableProfile,
  setValidationOutput: (value: ValidationOutput) => void,
  setSelectionSummary: (value: string) => void,
) {
  setValidationOutput(toValidationOutput(state, profile));
  setSelectionSummary(describeSelection(state));
}

function describeSelection(state: EditorState | null): string {
  if (!state) return 'Editor not ready.';

  const parts = [
    `Cell selection: ${String(isS1000DCellSelection(state.selection))}`,
    `Whole table: ${String(isWholeS1000DTableSelection(state))}`,
  ];

  const selectionInfo = getS1000DSelectionInfo(state);
  if (selectionInfo) {
    parts.push(`Rows ${selectionInfo.top}-${selectionInfo.bottom}`);
    parts.push(`Columns ${selectionInfo.left}-${selectionInfo.right}`);
    parts.push(`Entries ${selectionInfo.entries.length}`);
  } else if (state.selection instanceof NodeSelection) {
    parts.push(`Node selection: ${state.selection.node.type.name}`);
  }

  return parts.join(' | ');
}
