import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { Extension } from '@tiptap/core';
import { history, redo, undo } from '@tiptap/pm/history';
import { EditorContent, useEditor } from '@tiptap/react';
import type { Editor as TiptapEditor } from '@tiptap/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { NodeSelection, type EditorState, type Transaction } from 'prosemirror-state';

import {
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
  parseS1000DHtmlClipboard,
  parseS1000DPlainTextClipboard,
  serializeS1000DCellSelectionToHtml,
  serializeS1000DCellSelectionToText,
} from 'prosemirror-html-table-s1000d/clipboard';
import { renderS1000DTableToHtml } from 'prosemirror-html-table-s1000d/renderer';
import { createS1000DTableExtensions } from 'prosemirror-html-table-s1000d/tiptap';

import {
  createDocFromS1000DXml,
  findFirstS1000DTable,
  findGridEntryPosition,
  focusFirstBodyCell,
  selectGridCell,
  selectGridColumn,
  selectGridRange,
  selectGridRow,
  selectFirstBodyCell,
  selectFirstBodyColumn,
  selectFirstBodyRow,
  selectFirstTwoBodyCells,
  selectWholeTable,
} from './editor';
import {
  extendedSampleXml,
  procedSampleXml,
  sampleSingleCellText,
  sampleTsv,
  unsafeRawAttrsSampleXml,
} from './samples';

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

type ValidationOutput = {
  valid: boolean;
  issues: Array<{ message: string; code?: string | undefined }>;
};

type DemoSnapshot = {
  profile: S1000DTableProfile;
  selectionScope: DemoSelectionScope;
  selectionLabel: string;
  selectionSummary: string;
  validation: ValidationOutput;
  xml: string;
  html: string;
  clipboard: ClipboardOutput;
  editorDomContainsDataAttrs: boolean;
};

type DemoApi = {
  loadSample: (kind: SampleKind) => boolean;
  loadXml: (xml: string, profile?: S1000DTableProfile) => boolean;
  validate: () => ValidationOutput;
  exportXml: () => string;
  renderHtml: (includeRawAttrs?: boolean) => string;
  getSelectionSummary: () => string;
  getClipboard: () => ClipboardOutput;
  copySelection: () => ClipboardOutput;
  pasteHtml: (html?: string) => boolean;
  pasteTsv: (text?: string) => boolean;
  pasteSingleCell: (text?: string) => boolean;
  clearSelection: () => boolean;
  selectCell: (rowIndex: number, columnIndex: number, tgroupIndex?: number) => boolean;
  selectRange: (
    anchorRowIndex: number,
    anchorColumnIndex: number,
    headRowIndex: number,
    headColumnIndex: number,
    tgroupIndex?: number,
  ) => boolean;
  selectRow: (rowIndex: number, tgroupIndex?: number) => boolean;
  selectColumn: (columnIndex: number, tgroupIndex?: number) => boolean;
  getEntryText: (rowIndex: number, columnIndex: number, tgroupIndex?: number) => string | null;
  runCommand: (name: string) => boolean;
  getSnapshot: () => DemoSnapshot;
};

declare global {
  interface Window {
    __S1000D_DEMO__?: DemoApi;
  }
}

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

export function App() {
  const [profile, setProfile] = useState<S1000DTableProfile>('proced');
  const [toolbarRevision, setToolbarRevision] = useState(0);
  const [clipboardOutput, setClipboardOutput] = useState<ClipboardOutput>({ html: '', text: '' });
  const [selectionMenuOpen, setSelectionMenuOpen] = useState(false);
  const [selectionMenuPosition, setSelectionMenuPosition] = useState<{ left: number; top: number } | null>(null);
  const selectionMenuRef = useRef<HTMLDivElement | null>(null);
  const selectionMenuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const clipboardOutputRef = useRef<ClipboardOutput>({ html: '', text: '' });

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
      void activeEditor;
    },
  });

  useEffect(() => {
    if (!editor) return;
    loadSample('proced');
  }, [editor]);

  function loadSample(kind: SampleKind) {
    if (!editor) return;
    const nextProfile = inferProfile(kind);
    loadXmlDocument(getSampleXml(kind), nextProfile);
  }

  function loadXmlDocument(xml: string, nextProfile: S1000DTableProfile) {
    if (!editor) return;
    const doc = createDocFromS1000DXml(editor.schema, xml, nextProfile);
    setProfile(nextProfile);
    editor.view.dispatch(
      editor.state.tr
        .replaceWith(0, editor.state.doc.content.size, doc.content)
        .setMeta('addToHistory', false),
    );

    const state = editor.state;
    const focusTr = focusFirstBodyCell(state);
    if (focusTr) {
      focusTr.setMeta('addToHistory', false);
      editor.view.dispatch(focusTr);
    }

    void nextProfile;
    const nextClipboard = { html: '', text: '' };
    clipboardOutputRef.current = nextClipboard;
    setClipboardOutput(nextClipboard);
  }

  function runEditorCommand(command: () => boolean) {
    if (!editor) return false;
    const applied = command();
    if (!applied) {
      return false;
    }
    editor.commands.focus();
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

  function copySelection() {
    if (!editor) return;
    const html = serializeS1000DCellSelectionToHtml(editor.state) ?? '';
    const text = serializeS1000DCellSelectionToText(editor.state) ?? '';
    const nextClipboard = { html, text };
    clipboardOutputRef.current = nextClipboard;
    setClipboardOutput(nextClipboard);
  }

  function validateCurrentTable(): ValidationOutput {
    return toValidationOutput(editor?.state ?? null, profile);
  }

  function exportXml(): string {
    if (!editor) return '';
    const table = findFirstS1000DTable(editor.state.doc)?.table;
    if (!table) return '';
    return serializeS1000DTableXml(table, { profile });
  }

  function renderHtml(includeRawAttrs = false): string {
    if (!editor) return '';
    const table = findFirstS1000DTable(editor.state.doc)?.table;
    if (!table) return '';
    return renderS1000DTableToHtml(table, { profile, strict: false, includeRawAttrs });
  }

  function pastePlainText(text: string): boolean {
    if (!editor) return false;
    const clipboard = parseS1000DPlainTextClipboard(text, editor.schema);
    if (!clipboard) return false;
    const applied = applyS1000DClipboardToSelection(editor.state, editor.view.dispatch, clipboard);
    if (applied) {
      editor.commands.focus();
    }
    return applied;
  }

  function pasteSingleCellValue(text: string): boolean {
    return pastePlainText(text);
  }

  function pasteHtmlText(html: string): boolean {
    if (!editor) return false;
    const clipboard = parseS1000DHtmlClipboard(html, editor.schema);
    if (!clipboard) return false;
    const applied = applyS1000DClipboardToSelection(editor.state, editor.view.dispatch, clipboard);
    if (applied) {
      editor.commands.focus();
    }
    return applied;
  }

  function pasteCopiedHtml() {
    if (!editor || !clipboardOutputRef.current.html) return;
    void pasteHtmlText(clipboardOutputRef.current.html);
  }

  function clearSelectedCells() {
    if (!editor) return;
    clearS1000DSelectedCells(editor.state, editor.view.dispatch);
    editor.commands.focus();
  }

  function openSelectionMenuFromTrigger() {
    const rect = selectionMenuTriggerRef.current?.getBoundingClientRect();
    if (!rect || selectionScope === 'none') {
      return;
    }
    openSelectionMenu(rect.left, rect.bottom + 8);
  }

  const commands = editor?.commands as unknown as Record<string, (() => boolean) | undefined> | undefined;
  const canCommands = editor?.can() as unknown as Record<string, (() => boolean) | undefined> | undefined;
  void toolbarRevision;
  void profile;

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
  }

  const canCopySelection = Boolean(editor && isS1000DCellSelection(editor.state.selection));
  const canClearSelection = canCopySelection;
  const canUndo = Boolean(editor && undo(editor.state));
  const canRedo = Boolean(editor && redo(editor.state));
  const selectionScope = getDemoSelectionScope(editor?.state ?? null);
  const hasActionMenu = selectionScope !== 'none';

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const runSelectionHelper = (builder: (state: EditorState) => ReturnType<typeof focusFirstBodyCell>) => {
      if (!editor) return false;
      const tr = builder(editor.state);
      if (!tr) return false;
      editor.view.dispatch(tr);
      editor.commands.focus();
      return true;
    };

    const runCustomSelection = (builder: (state: EditorState) => Transaction | null) => {
      if (!editor) return false;
      const tr = builder(editor.state);
      if (!tr) return false;
      editor.view.dispatch(tr);
      editor.commands.focus();
      return true;
    };

    const api: DemoApi = {
      loadSample: (kind) => {
        if (!editor) return false;
        loadSample(kind);
        return true;
      },
      loadXml: (xml, nextProfile = 'extended') => {
        if (!editor) return false;
        loadXmlDocument(xml, nextProfile);
        return true;
      },
      validate: () => validateCurrentTable(),
      exportXml: () => exportXml(),
      renderHtml: (includeRawAttrs = false) => renderHtml(includeRawAttrs),
      getSelectionSummary: () => describeSelection(editor?.state ?? null),
      getClipboard: () => clipboardOutputRef.current,
      copySelection: () => {
        if (!editor) {
          return clipboardOutputRef.current;
        }
        const nextClipboard = {
          html: serializeS1000DCellSelectionToHtml(editor.state) ?? '',
          text: serializeS1000DCellSelectionToText(editor.state) ?? '',
        };
        clipboardOutputRef.current = nextClipboard;
        setClipboardOutput(nextClipboard);
        return nextClipboard;
      },
      pasteHtml: (html) => {
        if (html) {
          return pasteHtmlText(html);
        }
        if (!clipboardOutputRef.current.html) return false;
        return pasteHtmlText(clipboardOutputRef.current.html);
      },
      pasteTsv: (text) => pastePlainText(text ?? sampleTsv),
      pasteSingleCell: (text) => pasteSingleCellValue(text ?? sampleSingleCellText),
      clearSelection: () => {
        if (!editor) return false;
        const cleared = clearS1000DSelectedCells(editor.state, editor.view.dispatch);
        if (cleared) {
          editor.commands.focus();
        }
        return cleared;
      },
      selectCell: (rowIndex, columnIndex, tgroupIndex = 0) =>
        runCustomSelection((state) => selectGridCell(state, rowIndex, columnIndex, tgroupIndex)),
      selectRange: (anchorRowIndex, anchorColumnIndex, headRowIndex, headColumnIndex, tgroupIndex = 0) =>
        runCustomSelection((state) =>
          selectGridRange(state, anchorRowIndex, anchorColumnIndex, headRowIndex, headColumnIndex, tgroupIndex)),
      selectRow: (rowIndex, tgroupIndex = 0) =>
        runCustomSelection((state) => selectGridRow(state, rowIndex, tgroupIndex)),
      selectColumn: (columnIndex, tgroupIndex = 0) =>
        runCustomSelection((state) => selectGridColumn(state, columnIndex, tgroupIndex)),
      getEntryText: (rowIndex, columnIndex, tgroupIndex = 0) => {
        if (!editor) return null;
        const entryPos = findGridEntryPosition(editor.state.doc, rowIndex, columnIndex, tgroupIndex);
        return typeof entryPos === 'number' ? editor.state.doc.nodeAt(entryPos)?.textContent ?? null : null;
      },
      runCommand: (name) => {
        if (name === 'undo') {
          if (!editor) return false;
          const applied = undo(editor.state, editor.view.dispatch);
          if (applied) editor.commands.focus();
          return applied;
        }
        if (name === 'redo') {
          if (!editor) return false;
          const applied = redo(editor.state, editor.view.dispatch);
          if (applied) editor.commands.focus();
          return applied;
        }
        if (name === 'selectFirstBodyCell') return runSelectionHelper(selectFirstBodyCell);
        if (name === 'selectFirstBodyRow') return runSelectionHelper(selectFirstBodyRow);
        if (name === 'selectFirstBodyColumn') return runSelectionHelper(selectFirstBodyColumn);
        if (name === 'selectFirstTwoBodyCells') return runSelectionHelper(selectFirstTwoBodyCells);
        if (name === 'selectWholeTable') return runSelectionHelper(selectWholeTable);
        if (!editor) return false;
        return runEditorCommand(() => commands?.[name]?.() ?? false);
      },
      getSnapshot: () => ({
        profile,
        selectionScope: getDemoSelectionScope(editor?.state ?? null),
        selectionLabel: getSelectionScopeLabel(getDemoSelectionScope(editor?.state ?? null)),
        selectionSummary: describeSelection(editor?.state ?? null),
        validation: validateCurrentTable(),
        xml: exportXml(),
        html: renderHtml(false),
        clipboard: clipboardOutputRef.current,
        editorDomContainsDataAttrs: editor?.view.dom.innerHTML.includes('data-s1000d') ?? false,
      }),
    };

    window.__S1000D_DEMO__ = api;
    return () => {
      if (window.__S1000D_DEMO__ === api) {
        delete window.__S1000D_DEMO__;
      }
    };
  }, [commands, editor, profile]);

  const selectionMenuActions: DemoMenuAction[] = [
    ...(selectionScope === 'table'
      ? [
        {
          id: 'select-table',
          label: 'Select table',
          disabled: false,
          run: () => {
            if (!editor) return;
            const tr = selectWholeTable(editor.state);
            if (!tr) return;
            editor.view.dispatch(tr);
            editor.commands.focus();
          },
        },
        {
          id: 'delete-table',
          label: 'Delete table',
          disabled: false,
          destructive: true,
          run: () => {
            if (!editor) return;
            editor.commands.deleteSelection();
            editor.commands.focus();
          },
        },
        {
          id: 'validate-table',
          label: 'Validate table',
          disabled: false,
          run: () => {
            void validateCurrentTable();
          },
        },
        {
          id: 'export-xml',
          label: 'Export XML',
          disabled: false,
          run: () => {
            void exportXml();
          },
        },
        {
          id: 'render-html',
          label: 'Render HTML',
          disabled: false,
          run: () => {
            void renderHtml(false);
          },
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
          id: 'paste-html',
          label: 'Paste copied HTML',
          disabled: !clipboardOutput.html,
          run: pasteCopiedHtml,
        },
        {
          id: 'clear-selection',
          label: 'Clear selected cells',
          disabled: !canClearSelection,
          destructive: true,
          run: clearSelectedCells,
        },
        {
          id: 'set-align-left',
          label: 'Align left',
          disabled: false,
          run: () => {
            if (!editor) return;
            editor.commands.updateAttributes('entry', { align: 'left' });
            editor.commands.focus();
          },
        },
        {
          id: 'set-align-center',
          label: 'Align center',
          disabled: false,
          run: () => {
            if (!editor) return;
            editor.commands.updateAttributes('entry', { align: 'center' });
            editor.commands.focus();
          },
        },
        {
          id: 'set-align-right',
          label: 'Align right',
          disabled: false,
          run: () => {
            if (!editor) return;
            editor.commands.updateAttributes('entry', { align: 'right' });
            editor.commands.focus();
          },
        },
        {
          id: 'set-valign-top',
          label: 'Align top',
          disabled: false,
          run: () => {
            if (!editor) return;
            editor.commands.updateAttributes('entry', { valign: 'top' });
            editor.commands.focus();
          },
        },
        {
          id: 'set-valign-middle',
          label: 'Align middle',
          disabled: false,
          run: () => {
            if (!editor) return;
            editor.commands.updateAttributes('entry', { valign: 'middle' });
            editor.commands.focus();
          },
        },
        {
          id: 'set-valign-bottom',
          label: 'Align bottom',
          disabled: false,
          run: () => {
            if (!editor) return;
            editor.commands.updateAttributes('entry', { valign: 'bottom' });
            editor.commands.focus();
          },
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
      <header className="s1000d-demo__header">
        <h1 data-testid="s1000d-demo-title">S1000D Table Demo</h1>
        <p className="s1000d-demo__description">
          Use the toolbar to load a sample, then work directly on the table. Row, column, cell, and table operations
          stay in the contextual Actions menu.
        </p>
        <div className="s1000d-demo__toolbar" aria-label="Primary toolbar">
          <button data-testid="undo" type="button" disabled={!canUndo} onClick={() => runHistoryCommand(undo)}>Undo</button>
          <button data-testid="redo" type="button" disabled={!canRedo} onClick={() => runHistoryCommand(redo)}>Redo</button>
          <button data-testid="load-proced" type="button" onClick={() => loadSample('proced')}>Proced</button>
          <button data-testid="load-extended" type="button" onClick={() => loadSample('extended')}>Extended</button>
          <button data-testid="load-unsafe" type="button" onClick={() => loadSample('unsafe')}>Unsafe</button>
          <button
            ref={selectionMenuTriggerRef}
            data-testid="selection-actions-trigger"
            type="button"
            disabled={!hasActionMenu}
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
            Actions
          </button>
        </div>
      </header>

      <section className="s1000d-demo__workspace">
        <div
          className="s1000d-demo__editor"
          data-testid="editor"
          onContextMenu={(event) => {
            if (!hasActionMenu) {
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
      </section>
    </main>
  );
}
