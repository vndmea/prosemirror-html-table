import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { Extension } from '@tiptap/core';
import { history, redo, undo } from '@tiptap/pm/history';
import { EditorContent, useEditor } from '@tiptap/react';
import type { Editor as TiptapEditor } from '@tiptap/core';
import { useEffect, useMemo, useRef, useState } from 'react';
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

type DemoSelectionScope = 'none' | 'table' | 'row' | 'column' | 'cell' | 'multi-cell';

type DemoMenuAction = {
  id: string;
  label: string;
  disabled: boolean;
  destructive?: boolean;
  run: () => void;
};

const HistoryExtension = Extension.create({
  name: 'history',

  addKeyboardShortcuts() {
    return {
      'Mod-z': () => undo(this.editor.state, this.editor.view.dispatch),
      'Mod-y': () => redo(this.editor.state, this.editor.view.dispatch),
      'Mod-Shift-z': () => redo(this.editor.state, this.editor.view.dispatch),
    };
  },

  addProseMirrorPlugins() {
    return [history()];
  },
});

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

function getDemoSelectionScope(state: EditorState | null): DemoSelectionScope {
  if (!state) {
    return 'none';
  }

  if (state.selection instanceof NodeSelection && state.selection.node.type.name === 'table') {
    return 'table';
  }

  if (isWholeS1000DTableSelection(state)) {
    return 'table';
  }

  const selectionInfo = getS1000DSelectionInfo(state);
  if (isS1000DCellSelection(state.selection)) {
    if (state.selection.isRowSelection()) {
      return 'row';
    }
    if (state.selection.isColSelection()) {
      return 'column';
    }
    return (selectionInfo?.entries.length ?? 0) > 1 ? 'multi-cell' : 'cell';
  }

  if ((selectionInfo?.entries.length ?? 0) > 1) {
    return 'multi-cell';
  }

  if ((selectionInfo?.entries.length ?? 0) === 1) {
    return 'cell';
  }

  return 'none';
}

function getSelectionScopeLabel(scope: DemoSelectionScope): string {
  switch (scope) {
    case 'table':
      return 'Table actions';
    case 'row':
      return 'Row actions';
    case 'column':
      return 'Column actions';
    case 'cell':
      return 'Cell actions';
    case 'multi-cell':
      return 'Selection actions';
    default:
      return 'No table selection';
  }
}

export function App() {
  const [profile, setProfile] = useState<S1000DTableProfile>('proced');
  const [toolbarRevision, setToolbarRevision] = useState(0);
  const [validationOutput, setValidationOutput] = useState<ValidationOutput>({
    valid: false,
    issues: [{ message: 'Load a sample to start.' }],
  });
  const [xmlOutput, setXmlOutput] = useState('');
  const [htmlOutput, setHtmlOutput] = useState('');
  const [htmlPreview, setHtmlPreview] = useState('');
  const [clipboardOutput, setClipboardOutput] = useState<ClipboardOutput>({ html: '', text: '' });
  const [selectionSummary, setSelectionSummary] = useState('No selection yet.');
  const [selectionMenuOpen, setSelectionMenuOpen] = useState(false);
  const [selectionMenuPosition, setSelectionMenuPosition] = useState<{ left: number; top: number } | null>(null);
  const selectionMenuRef = useRef<HTMLDivElement | null>(null);
  const selectionMenuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const debugToolsRef = useRef<HTMLDetailsElement | null>(null);

  const extensions = useMemo(() => [
    Document,
    Paragraph,
    Text,
    HistoryExtension,
    ...createS1000DTableExtensions({ profile: 'extended' }),
  ], []);

  const editor = useEditor({
    extensions: extensions as never,
    autofocus: false,
    content: '<p>Load a sample to start.</p>',
    onTransaction: ({ editor: activeEditor }: { editor: TiptapEditor }) => {
      setToolbarRevision((value) => value + 1);
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
    if (!editor) return false;
    const applied = command();
    if (!applied) {
      return false;
    }
    editor.commands.focus();
    updateAll(editor.state, profile);
    return true;
  }

  function closeSelectionMenu(restoreTriggerFocus = false) {
    setSelectionMenuOpen(false);
    setSelectionMenuPosition(null);
    if (restoreTriggerFocus) {
      selectionMenuTriggerRef.current?.focus();
    }
  }

  function openSelectionMenu(left: number, top: number) {
    setSelectionMenuPosition({ left, top });
    setSelectionMenuOpen(true);
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

  function openSelectionMenuFromTrigger() {
    const rect = selectionMenuTriggerRef.current?.getBoundingClientRect();
    if (!rect || selectionScope === 'none') {
      return;
    }
    openSelectionMenu(rect.left, rect.bottom + 8);
  }

  function openDebugTools() {
    if (!debugToolsRef.current) {
      return;
    }
    debugToolsRef.current.open = true;
  }

  const editorDomContainsDataAttrs = editor?.view.dom.innerHTML.includes('data-s1000d') ?? false;
  const commands = editor?.commands as unknown as Record<string, (() => boolean) | undefined> | undefined;
  const canCommands = editor?.can() as unknown as Record<string, (() => boolean) | undefined> | undefined;
  void toolbarRevision;

  function canRunCommand(name: string): boolean {
    return Boolean(canCommands?.[name]?.());
  }

  function runNamedCommand(name: string): void {
    runEditorCommand(() => commands?.[name]?.() ?? false);
  }

  function runHistoryCommand(command: typeof undo | typeof redo): void {
    if (!editor) return;
    if (!command(editor.state, editor.view.dispatch)) {
      return;
    }
    editor.commands.focus();
    updateAll(editor.state, profile);
  }

  const canCopySelection = Boolean(editor && isS1000DCellSelection(editor.state.selection));
  const canClearSelection = canCopySelection;
  const canUndo = Boolean(editor && undo(editor.state));
  const canRedo = Boolean(editor && redo(editor.state));
  const selectionScope = getDemoSelectionScope(editor?.state ?? null);
  const selectionScopeLabel = getSelectionScopeLabel(selectionScope);

  const selectionMenuActions: DemoMenuAction[] = [
    ...(selectionScope === 'table'
      ? [
        {
          id: 'select-table',
          label: 'Select table',
          disabled: false,
          run: () => runSelectionHelper(selectWholeTable),
        },
        {
          id: 'validate-table',
          label: 'Validate table',
          disabled: false,
          run: validateCurrentTable,
        },
        {
          id: 'export-xml',
          label: 'Export XML',
          disabled: false,
          run: exportXml,
        },
        {
          id: 'render-html',
          label: 'Render HTML',
          disabled: false,
          run: () => renderHtml(false),
        },
      ]
      : []),
    ...(selectionScope === 'row'
      ? [
        {
          id: 'add-row-before',
          label: 'Add row before',
          disabled: !canRunCommand('addS1000DTableRowBefore'),
          run: () => runNamedCommand('addS1000DTableRowBefore'),
        },
        {
          id: 'add-row-after',
          label: 'Add row after',
          disabled: !canRunCommand('addS1000DTableRowAfter'),
          run: () => runNamedCommand('addS1000DTableRowAfter'),
        },
        {
          id: 'delete-row',
          label: 'Delete row',
          disabled: !canRunCommand('deleteS1000DTableRow'),
          destructive: true,
          run: () => runNamedCommand('deleteS1000DTableRow'),
        },
        {
          id: 'move-row-up',
          label: 'Move row up',
          disabled: !canRunCommand('moveS1000DTableRowUp'),
          run: () => runNamedCommand('moveS1000DTableRowUp'),
        },
        {
          id: 'move-row-down',
          label: 'Move row down',
          disabled: !canRunCommand('moveS1000DTableRowDown'),
          run: () => runNamedCommand('moveS1000DTableRowDown'),
        },
        {
          id: 'clear-row-cells',
          label: 'Clear row contents',
          disabled: !canClearSelection,
          run: clearSelectedCells,
        },
      ]
      : []),
    ...(selectionScope === 'column'
      ? [
        {
          id: 'add-column-before',
          label: 'Add column before',
          disabled: !canRunCommand('addS1000DTableColumnBefore'),
          run: () => runNamedCommand('addS1000DTableColumnBefore'),
        },
        {
          id: 'add-column-after',
          label: 'Add column after',
          disabled: !canRunCommand('addS1000DTableColumnAfter'),
          run: () => runNamedCommand('addS1000DTableColumnAfter'),
        },
        {
          id: 'delete-column',
          label: 'Delete column',
          disabled: !canRunCommand('deleteS1000DTableColumn'),
          destructive: true,
          run: () => runNamedCommand('deleteS1000DTableColumn'),
        },
        {
          id: 'move-column-left',
          label: 'Move column left',
          disabled: !canRunCommand('moveS1000DTableColumnLeft'),
          run: () => runNamedCommand('moveS1000DTableColumnLeft'),
        },
        {
          id: 'move-column-right',
          label: 'Move column right',
          disabled: !canRunCommand('moveS1000DTableColumnRight'),
          run: () => runNamedCommand('moveS1000DTableColumnRight'),
        },
        {
          id: 'clear-column-cells',
          label: 'Clear column contents',
          disabled: !canClearSelection,
          run: clearSelectedCells,
        },
      ]
      : []),
    ...((selectionScope === 'cell' || selectionScope === 'multi-cell')
      ? [
        {
          id: 'select-cell',
          label: 'Select current cell',
          disabled: !canRunCommand('selectS1000DTableCell'),
          run: () => runNamedCommand('selectS1000DTableCell'),
        },
        {
          id: 'merge-cells',
          label: 'Merge cells',
          disabled: !canRunCommand('mergeS1000DTableCells'),
          run: () => runNamedCommand('mergeS1000DTableCells'),
        },
        {
          id: 'split-cell',
          label: 'Split cell',
          disabled: !canRunCommand('splitS1000DTableCell'),
          run: () => runNamedCommand('splitS1000DTableCell'),
        },
        {
          id: 'merge-or-split-cell',
          label: 'Merge or split',
          disabled: !canRunCommand('mergeOrSplitS1000DTableCell'),
          run: () => runNamedCommand('mergeOrSplitS1000DTableCell'),
        },
        {
          id: 'copy-selection',
          label: 'Copy selection',
          disabled: !canCopySelection,
          run: copySelection,
        },
        {
          id: 'paste-tsv',
          label: 'Paste sample TSV',
          disabled: false,
          run: pasteSampleTsv,
        },
        {
          id: 'clear-selection',
          label: 'Clear selected cells',
          disabled: !canClearSelection,
          destructive: true,
          run: clearSelectedCells,
        },
      ]
      : []),
  ];

  useEffect(() => {
    if (!selectionMenuOpen || !selectionMenuRef.current) {
      return;
    }

    const enabledButtons = Array.from(
      selectionMenuRef.current.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
    );
    enabledButtons[0]?.focus();

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (
        target instanceof Node
        && (
          selectionMenuRef.current?.contains(target)
          || selectionMenuTriggerRef.current?.contains(target)
        )
      ) {
        return;
      }

      closeSelectionMenu(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!selectionMenuRef.current) {
        return;
      }

      const items = Array.from(
        selectionMenuRef.current.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
      );
      if (items.length === 0) {
        return;
      }

      const activeIndex = items.findIndex((item) => item === document.activeElement);
      if (event.key === 'Escape') {
        event.preventDefault();
        closeSelectionMenu(true);
        return;
      }

      if (event.key === 'Tab') {
        closeSelectionMenu(false);
        return;
      }

      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        return;
      }

      event.preventDefault();
      let nextIndex = activeIndex < 0 ? 0 : activeIndex;
      if (event.key === 'Home') {
        nextIndex = 0;
      } else if (event.key === 'End') {
        nextIndex = items.length - 1;
      } else if (event.key === 'ArrowDown') {
        nextIndex = activeIndex < 0 ? 0 : (activeIndex + 1) % items.length;
      } else if (event.key === 'ArrowUp') {
        nextIndex = activeIndex < 0 ? items.length - 1 : (activeIndex - 1 + items.length) % items.length;
      }

      items[nextIndex]?.focus();
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectionMenuOpen]);

  useEffect(() => {
    if (!selectionMenuOpen) {
      return;
    }
    if (selectionScope === 'none' || selectionMenuActions.every((action) => action.disabled)) {
      closeSelectionMenu(false);
    }
  }, [selectionMenuActions, selectionMenuOpen, selectionScope]);

  return (
    <main className="s1000d-demo">
      <h1 data-testid="s1000d-demo-title">S1000D Table Demo</h1>
      <p>
        The editor DOM is internal and may include <code>data-s1000d</code>. The final HTML output below comes from the
        standalone renderer and is a separate output path.
      </p>

      <section className="s1000d-demo__toolbar" aria-label="Primary toolbar">
        <div className="s1000d-demo__actions">
          <button data-testid="undo" type="button" disabled={!canUndo} onClick={() => runHistoryCommand(undo)}>Undo</button>
          <button data-testid="redo" type="button" disabled={!canRedo} onClick={() => runHistoryCommand(redo)}>Redo</button>
          <button data-testid="load-proced" type="button" onClick={() => loadSample('proced')}>Load proced sample</button>
          <button data-testid="load-extended" type="button" onClick={() => loadSample('extended')}>Load extended sample</button>
          <button data-testid="load-unsafe" type="button" onClick={() => loadSample('unsafe')}>Load unsafe attrs sample</button>
          <button data-testid="validate" type="button" onClick={validateCurrentTable}>Validate</button>
          <button data-testid="export-xml" type="button" onClick={exportXml}>Export XML</button>
          <button data-testid="render-html" type="button" onClick={() => renderHtml(false)}>Render HTML</button>
          <button data-testid="render-html-raw" type="button" onClick={() => renderHtml(true)}>Render HTML with raw attrs</button>
        </div>

        <div className="s1000d-demo__actions">
          <button data-testid="add-row-before" type="button" disabled={!canRunCommand('addS1000DTableRowBefore')} onClick={() => runNamedCommand('addS1000DTableRowBefore')}>Add row before</button>
          <button data-testid="add-row-after" type="button" disabled={!canRunCommand('addS1000DTableRowAfter')} onClick={() => runNamedCommand('addS1000DTableRowAfter')}>Add row after</button>
          <button data-testid="delete-row" type="button" disabled={!canRunCommand('deleteS1000DTableRow')} onClick={() => runNamedCommand('deleteS1000DTableRow')}>Delete row</button>
          <button data-testid="move-row-up" type="button" disabled={!canRunCommand('moveS1000DTableRowUp')} onClick={() => runNamedCommand('moveS1000DTableRowUp')}>Move row up</button>
          <button data-testid="move-row-down" type="button" disabled={!canRunCommand('moveS1000DTableRowDown')} onClick={() => runNamedCommand('moveS1000DTableRowDown')}>Move row down</button>
        </div>

        <div className="s1000d-demo__actions">
          <button data-testid="add-column-before" type="button" disabled={!canRunCommand('addS1000DTableColumnBefore')} onClick={() => runNamedCommand('addS1000DTableColumnBefore')}>Add column before</button>
          <button data-testid="add-column-after" type="button" disabled={!canRunCommand('addS1000DTableColumnAfter')} onClick={() => runNamedCommand('addS1000DTableColumnAfter')}>Add column after</button>
          <button data-testid="delete-column" type="button" disabled={!canRunCommand('deleteS1000DTableColumn')} onClick={() => runNamedCommand('deleteS1000DTableColumn')}>Delete column</button>
          <button data-testid="move-column-left" type="button" disabled={!canRunCommand('moveS1000DTableColumnLeft')} onClick={() => runNamedCommand('moveS1000DTableColumnLeft')}>Move column left</button>
          <button data-testid="move-column-right" type="button" disabled={!canRunCommand('moveS1000DTableColumnRight')} onClick={() => runNamedCommand('moveS1000DTableColumnRight')}>Move column right</button>
        </div>

        <div className="s1000d-demo__actions">
          <button data-testid="merge-cells" type="button" disabled={!canRunCommand('mergeS1000DTableCells')} onClick={() => runNamedCommand('mergeS1000DTableCells')}>Merge cells</button>
          <button data-testid="split-cell" type="button" disabled={!canRunCommand('splitS1000DTableCell')} onClick={() => runNamedCommand('splitS1000DTableCell')}>Split cell</button>
          <button data-testid="merge-or-split-cell" type="button" disabled={!canRunCommand('mergeOrSplitS1000DTableCell')} onClick={() => runNamedCommand('mergeOrSplitS1000DTableCell')}>Merge or split cell</button>
          <button data-testid="copy-selection" type="button" disabled={!canCopySelection} onClick={copySelection}>Copy selection</button>
          <button data-testid="paste-tsv" type="button" onClick={pasteSampleTsv}>Paste sample TSV</button>
          <button data-testid="clear-selection" type="button" disabled={!canClearSelection} onClick={clearSelectedCells}>Clear selected cells</button>
        </div>
      </section>

      <section className="s1000d-demo__layout">
        <div className="s1000d-demo__workspace">
          <div className="s1000d-demo__selection-bar">
            <div>
              <strong data-testid="selection-scope-label">{selectionScopeLabel}</strong>
              <p className="s1000d-demo__selection-summary" data-testid="selection-output">{selectionSummary}</p>
            </div>
            <div className="s1000d-demo__selection-actions">
              <button
                ref={selectionMenuTriggerRef}
                data-testid="selection-actions-trigger"
                type="button"
                disabled={selectionScope === 'none'}
                aria-haspopup="menu"
                aria-expanded={selectionMenuOpen}
                onClick={() => {
                  if (selectionMenuOpen) {
                    closeSelectionMenu(true);
                    return;
                  }
                  openSelectionMenuFromTrigger();
                }}
              >
                {selectionScopeLabel}
              </button>
            </div>
          </div>

          <div
            className="s1000d-demo__editor"
            data-testid="editor"
            onContextMenu={(event) => {
              if (selectionScope === 'none') {
                return;
              }
              event.preventDefault();
              openSelectionMenu(event.clientX, event.clientY + 4);
            }}
          >
            {editor ? <EditorContent editor={editor} /> : null}
          </div>

          {selectionMenuOpen && selectionMenuPosition ? (
            <div
              ref={selectionMenuRef}
              className="s1000d-demo__context-menu"
              data-testid="selection-menu"
              role="menu"
              style={{ left: `${selectionMenuPosition.left}px`, top: `${selectionMenuPosition.top}px` }}
            >
              {selectionMenuActions.map((action) => (
                <button
                  key={action.id}
                  data-testid={`selection-menu-item-${action.id}`}
                  className={action.destructive ? 'is-destructive' : undefined}
                  type="button"
                  role="menuitem"
                  disabled={action.disabled}
                  onClick={() => {
                    action.run();
                    closeSelectionMenu(false);
                  }}
                >
                  {action.label}
                </button>
              ))}
            </div>
          ) : null}

          <details ref={debugToolsRef} className="s1000d-demo__debug" data-testid="debug-tools">
            <summary data-testid="debug-tools-toggle">Debug tools</summary>
            <div className="s1000d-demo__actions">
              <button data-testid="select-cell" type="button" onClick={() => runSelectionHelper(selectFirstBodyCell)}>Select first body cell</button>
              <button data-testid="select-row" type="button" onClick={() => runSelectionHelper(selectFirstBodyRow)}>Select first body row</button>
              <button data-testid="select-column" type="button" onClick={() => runSelectionHelper(selectFirstBodyColumn)}>Select first body column</button>
              <button data-testid="select-first-two-cells" type="button" onClick={() => runSelectionHelper(selectFirstTwoBodyCells)}>Select first two body cells</button>
              <button data-testid="select-table" type="button" onClick={() => runSelectionHelper(selectWholeTable)}>Select whole table</button>
            </div>
            <p data-testid="editor-dom-output">Editor DOM has data-s1000d: {String(editorDomContainsDataAttrs)}</p>
            <p data-testid="clipboard-html-length">Copied HTML length: {clipboardOutput.html.length}</p>
            <pre data-testid="clipboard-text-output">{clipboardOutput.text}</pre>
            <button
              data-testid="open-debug-tools"
              type="button"
              onClick={openDebugTools}
              style={{ display: 'none' }}
            >
              Open debug tools
            </button>
          </details>
        </div>

        <aside className="s1000d-demo__outputs">
          <pre data-testid="validation-output">{stringify(validationOutput)}</pre>
          <pre data-testid="xml-output">{xmlOutput}</pre>
          <pre data-testid="html-output">{htmlOutput}</pre>
          <div
            className="s1000d-demo__preview"
            data-testid="html-preview"
            dangerouslySetInnerHTML={{ __html: htmlPreview }}
          />
        </aside>
      </section>
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
