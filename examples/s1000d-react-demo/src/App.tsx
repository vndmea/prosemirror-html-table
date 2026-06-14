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
  isS1000DCellSelection,
  type S1000DTableProfile,
} from 'prosemirror-html-table-s1000d';
import {
  applyS1000DClipboardToSelection,
  clearS1000DSelectedCells,
  getS1000DSelectionInfo,
  isWholeS1000DTableSelection,
  parseS1000DHtmlClipboard,
  serializeS1000DCellSelectionToHtml,
  serializeS1000DCellSelectionToText,
} from 'prosemirror-html-table-s1000d/clipboard';
import { createS1000DTableExtensions } from 'prosemirror-html-table-s1000d/tiptap';

import {
  createDocFromS1000DXml,
  findFirstS1000DTable,
  focusFirstBodyCell,
  selectWholeTable,
} from './editor';
import {
  extendedSampleXml,
  procedSampleXml,
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

export function App() {
  const [profile, setProfile] = useState<S1000DTableProfile>('proced');
  const [toolbarRevision, setToolbarRevision] = useState(0);
  const [clipboardOutput, setClipboardOutput] = useState<ClipboardOutput>({ html: '', text: '' });
  const [selectionMenuOpen, setSelectionMenuOpen] = useState(false);
  const [selectionMenuPosition, setSelectionMenuPosition] = useState<{ left: number; top: number } | null>(null);
  const selectionMenuRef = useRef<HTMLDivElement | null>(null);
  const selectionMenuTriggerRef = useRef<HTMLButtonElement | null>(null);

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
    const doc = createDocFromS1000DXml(editor.schema, getSampleXml(kind), nextProfile);
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
    setClipboardOutput({ html: '', text: '' });
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
    setClipboardOutput({ html, text });
  }

  function pasteCopiedHtml() {
    if (!editor || !clipboardOutput.html) return;
    const clipboard = parseS1000DHtmlClipboard(clipboardOutput.html, editor.schema);
    if (!clipboard) return;
    applyS1000DClipboardToSelection(editor.state, editor.view.dispatch, clipboard);
    editor.commands.focus();
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
  const selectionScopeLabel = getSelectionScopeLabel(selectionScope);
  const hasActionMenu = selectionScope !== 'none';

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
