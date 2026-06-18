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
import {
  closeS1000DTableContextMenu,
  createS1000DTableExtensions,
  getS1000DContextMenuState,
  getS1000DContextTriggerButtonState,
  getS1000DTableInteractionState,
  openS1000DTableContextMenu,
  type S1000DContextMenuActionResolver,
  type S1000DTableMenuScope,
} from 'prosemirror-html-table-s1000d/tiptap';

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
    if (state.selection.isRowSelection() && selectionInfo && selectionInfo.top === selectionInfo.bottom) {
      return 'row';
    }
    if (state.selection.isColSelection() && selectionInfo && selectionInfo.left === selectionInfo.right) {
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
  const [, setClipboardOutput] = useState<ClipboardOutput>({ html: '', text: '' });
  const selectionMenuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const clipboardOutputRef = useRef<ClipboardOutput>({ html: '', text: '' });
  const contextMenuActionsRef = useRef<S1000DContextMenuActionResolver>(() => []);

  const extensions = useMemo(() => [
    Document,
    Paragraph,
    Text,
    HistoryExtension,
    ...createS1000DTableExtensions({
      profile: 'extended',
      table: {
        contextMenuActionResolver: (context) => contextMenuActionsRef.current(context),
      },
    }),
  ], []);

  const editor = useEditor({
    extensions: extensions as never,
    autofocus: false,
    content: '<p>Load a sample to start.</p>',
    onTransaction: ({
      editor: activeEditor,
      transaction,
    }: {
      editor: TiptapEditor;
      transaction: Transaction;
    }) => {
      if (transaction.docChanged || transaction.selectionSet) {
        setToolbarRevision((value) => value + 1);
      }
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
    if (editor) {
      closeS1000DTableContextMenu(editor.view);
    }
    if (restoreTriggerFocus) {
      selectionMenuTriggerRef.current?.focus();
    }
  }

  function openSelectionMenuForScope(
    scope: S1000DTableMenuScope,
    left: number,
    top: number,
    options: { preserveScroll?: boolean } = {},
  ) {
    if (!editor) {
      return;
    }

    const ownerWindow = editor.view.dom.ownerDocument.defaultView;
    const previousScrollX = ownerWindow?.scrollX ?? 0;
    const previousScrollY = ownerWindow?.scrollY ?? 0;
    openS1000DTableContextMenu(editor.view, {
      scope,
      anchor: { left, top },
    });
    if (!options.preserveScroll || !ownerWindow) {
      return;
    }

    const restoreScroll = () => ownerWindow.scrollTo(previousScrollX, previousScrollY);
    restoreScroll();
    let remainingFrames = 30;
    const restoreOnFrame = () => {
      restoreScroll();
      remainingFrames -= 1;
      if (remainingFrames > 0) {
        ownerWindow.requestAnimationFrame(restoreOnFrame);
      }
    };
    ownerWindow.requestAnimationFrame(restoreOnFrame);
  }

  function getSelectionMenuAnchor(scope: S1000DTableMenuScope) {
    const doc = editor?.view.dom.ownerDocument;
    if (!doc) {
      return null;
    }

    if (scope === 'table') {
      const tableHandle = doc.querySelector('[data-testid="s1000d-table-handle"]') as HTMLElement | null;
      if (!tableHandle) return null;
      const rect = tableHandle.getBoundingClientRect();
      return { left: rect.left, top: rect.top };
    }

    if (scope === 'row') {
      const rowBand = doc.querySelector('[data-testid="s1000d-selection-row-band"]') as HTMLElement | null;
      if (!rowBand) return null;
      const rect = rowBand.getBoundingClientRect();
      return { left: rect.left, top: rect.top + rect.height / 2 };
    }

    if (scope === 'column') {
      const columnBand = doc.querySelector('[data-testid="s1000d-selection-column-band"]') as HTMLElement | null;
      if (!columnBand) return null;
      const rect = columnBand.getBoundingClientRect();
      return { left: rect.left + rect.width / 2, top: rect.top };
    }

    const cellOutline = doc.querySelector('[data-testid="s1000d-selection-cell-outline"]') as HTMLElement | null;
    if (cellOutline) {
      const rect = cellOutline.getBoundingClientRect();
      return { left: rect.right, top: rect.top + rect.height / 2 };
    }

    if (!editor) {
      return null;
    }

    const { node, offset } = editor.view.domAtPos(editor.state.selection.from);
    const selectionNode = node instanceof Element
      ? node.childNodes[offset] ?? node
      : node;
    const selectionCell = (
      selectionNode instanceof Element
        ? selectionNode.closest('td, th')
        : selectionNode.parentElement?.closest('td, th')
    ) as HTMLElement | null;
    if (!selectionCell) {
      return null;
    }

    const rect = selectionCell.getBoundingClientRect();
    return { left: rect.right, top: rect.top + rect.height / 2 };
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

  function openSelectionMenuFromTrigger() {
    if (selectionScope === 'none') {
      return;
    }

    const anchor = getSelectionMenuAnchor(selectionScope === 'multi-cell' ? 'cell' : selectionScope);
    if (anchor) {
      openSelectionMenuForScope(
        selectionScope === 'multi-cell' ? 'cell' : selectionScope,
        anchor.left,
        anchor.top,
        { preserveScroll: true },
      );
      return;
    }

    const rect = selectionMenuTriggerRef.current?.getBoundingClientRect();
    if (rect) {
      openSelectionMenuForScope(
        selectionScope === 'multi-cell' ? 'cell' : selectionScope,
        rect.left,
        rect.bottom + 8,
        { preserveScroll: true },
      );
    }
  }

  function syncContextMenuSelectionFromTarget(target: EventTarget | null): S1000DTableMenuScope | null {
    if (!editor || !(target instanceof Element)) {
      return null;
    }

    const rowHandle = target.closest('[data-testid="s1000d-row-handle"]');
    if (rowHandle instanceof HTMLElement) {
      const rowIndex = Number.parseInt(rowHandle.dataset.rowIndex ?? '', 10);
      const tgroupIndex = Number.parseInt(rowHandle.dataset.tgroupIndex ?? '0', 10);
      const tr = Number.isInteger(rowIndex) ? selectGridRow(editor.state, rowIndex, Number.isInteger(tgroupIndex) ? tgroupIndex : 0) : null;
      if (!tr) {
        return null;
      }
      editor.view.dispatch(tr);
      editor.commands.focus();
      return 'row';
    }

    const columnHandle = target.closest('[data-testid="s1000d-column-handle"]');
    if (columnHandle instanceof HTMLElement) {
      const columnIndex = Number.parseInt(columnHandle.dataset.columnIndex ?? '', 10);
      const tgroupIndex = Number.parseInt(columnHandle.dataset.tgroupIndex ?? '0', 10);
      const tr = Number.isInteger(columnIndex)
        ? selectGridColumn(editor.state, columnIndex, Number.isInteger(tgroupIndex) ? tgroupIndex : 0)
        : null;
      if (!tr) {
        return null;
      }
      editor.view.dispatch(tr);
      editor.commands.focus();
      return 'column';
    }

    const tableHandle = target.closest('[data-testid="s1000d-table-handle"]');
    if (tableHandle instanceof HTMLElement) {
      const tr = selectWholeTable(editor.state);
      if (!tr) {
        return null;
      }
      editor.view.dispatch(tr);
      editor.commands.focus();
      return 'table';
    }

    return null;
  }

  void toolbarRevision;

  function runHistoryCommand(command: typeof undo | typeof redo): void {
    if (!editor) return;
    if (!command(editor.state, editor.view.dispatch)) {
      return;
    }
    editor.commands.focus();
  }

  const canCopySelection = Boolean(editor && isS1000DCellSelection(editor.state.selection));
  const canUndo = Boolean(editor && undo(editor.state));
  const canRedo = Boolean(editor && redo(editor.state));
  const selectionScope = getDemoSelectionScope(editor?.state ?? null);
  const interaction = editor ? getS1000DTableInteractionState(editor.state) : null;
  const triggerState = editor && interaction
    ? getS1000DContextTriggerButtonState(editor.state, interaction, {
      actionResolver: contextMenuActionsRef.current,
      view: editor.view,
    })
    : null;
  const selectionMenuOpen = Boolean(interaction?.contextMenuOpen);
  const hasActionMenu = Boolean(triggerState?.visible);

  contextMenuActionsRef.current = ({ scope }) => [
    ...(scope === 'table'
      ? [
        {
          id: 'validate-table',
          label: 'Validate table',
          group: 'external' as const,
          enabled: true,
          run: () => {
            void validateCurrentTable();
          },
        },
        {
          id: 'export-xml',
          label: 'Export XML',
          group: 'external' as const,
          enabled: true,
          run: () => {
            void exportXml();
          },
        },
        {
          id: 'render-html',
          label: 'Render HTML',
          group: 'external' as const,
          enabled: true,
          run: () => {
            void renderHtml(false);
          },
        },
      ]
      : []),
    ...(scope === 'cell'
      ? [
        {
          id: 'copy-selection',
          label: 'Copy selection',
          group: 'external' as const,
          enabled: canCopySelection,
          run: () => {
            copySelection();
          },
        },
        {
          id: 'paste-html',
          label: 'Paste copied HTML',
          group: 'external' as const,
          enabled: Boolean(clipboardOutputRef.current.html),
          run: () => {
            pasteCopiedHtml();
          },
        },
      ]
      : []),
  ];

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
        return runEditorCommand(() => {
          const commands = editor.commands as unknown as Record<string, (() => boolean) | undefined>;
          return commands[name]?.() ?? false;
        });
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
  }, [editor, profile]);

  useEffect(() => {
    const handleFocusRequest = () => {
      selectionMenuTriggerRef.current?.focus();
    };

    document.addEventListener('s1000d-focus-selection-trigger', handleFocusRequest);
    return () => {
      document.removeEventListener('s1000d-focus-selection-trigger', handleFocusRequest);
    };
  }, []);

  useEffect(() => {
    if (!selectionMenuOpen) {
      return;
    }
    const menuState = editor && interaction
      ? getS1000DContextMenuState(editor.state, interaction, {
        actionResolver: contextMenuActionsRef.current,
        view: editor.view,
      })
      : null;
    if (!menuState?.visible) {
      closeSelectionMenu(false);
    }
  }, [editor, interaction, selectionMenuOpen]);

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
            aria-label={triggerState?.label ?? 'Actions'}
            title={triggerState?.title ?? undefined}
            onMouseDown={(event) => {
              event.preventDefault();
            }}
            onClick={() => {
              if (selectionMenuOpen) {
                closeSelectionMenu(true);
                return;
              }
              if (!editor || !interaction) {
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
            const syncedScope = syncContextMenuSelectionFromTarget(event.target);
            const scope = syncedScope ?? (selectionScope === 'multi-cell' ? 'cell' : selectionScope);
            if (!hasActionMenu && !syncedScope) {
              return;
            }
            if (scope === 'none') {
              return;
            }
            event.preventDefault();
            openSelectionMenuForScope(scope, event.clientX, event.clientY + 4);
          }}
        >
          {editor ? <EditorContent editor={editor} /> : null}
        </div>
      </section>
    </main>
  );
}
