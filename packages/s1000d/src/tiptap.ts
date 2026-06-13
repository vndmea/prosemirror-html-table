import { Node, mergeAttributes, type RawCommands } from '@tiptap/core';
import { type Node as ProseMirrorNode } from 'prosemirror-model';
import { NodeSelection, Plugin, PluginKey, TextSelection, type EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';

import { createS1000DTableNode } from './builder.js';
import {
  addS1000DColumnAfter,
  addS1000DColumnBefore,
  addS1000DRowAfter,
  addS1000DRowBefore,
  deleteS1000DColumn,
  deleteS1000DRow,
  findS1000DEntryContext,
  findS1000DTableContext,
  mergeOrSplitS1000DCell,
  mergeS1000DCells,
  moveS1000DColumnLeft,
  moveS1000DColumnRight,
  moveS1000DRowDown,
  moveS1000DRowUp,
  splitS1000DCell,
} from './commands.js';
import {
  applyS1000DClipboardToSelection,
  clearS1000DSelectedCells,
  getS1000DSelectionInfo,
  isWholeS1000DTableSelection,
  parseS1000DHtmlClipboard,
  parseS1000DPlainTextClipboard,
  serializeS1000DCellSelectionToHtml,
  serializeS1000DCellSelectionToText,
} from './clipboard.js';
import { s1000dTableNodeNames, type S1000DTableNodeNames } from './names.js';
import {
  findFirstS1000DDescendantPosition,
  findS1000DEntryPosition,
  findS1000DNodePositions,
  requireS1000DTgroupPosition,
} from './position.js';
import { normalizeS1000DTableProfile, type S1000DTableProfile } from './profile.js';
import { S1000DCellSelection, isS1000DCellSelection } from './selection.js';
import {
  normalizeS1000DTableSchemaOptions,
} from './schema.js';
import { S1000DTableMap } from './table-map.js';
import type { S1000DTableSchemaOptions } from './types.js';

export interface S1000DTableTiptapOptions {
  HTMLAttributes: Record<string, unknown>;
  allowTableNodeSelection: boolean;
  enableTabNavigation: boolean;
  addRowOnTabAtEnd: boolean;
  enableShiftArrowSelection: boolean;
  enableCellRangeClipboard: boolean;
  deleteTableOnAllCellsSelected: boolean;
  clearCellsOnDelete: boolean;
  selectedCellClassName: string;
}

export interface CreateS1000DTableExtensionsOptions extends Omit<S1000DTableSchemaOptions, 'names'> {
  table?: Partial<S1000DTableTiptapOptions>;
}

export const defaultS1000DTableTiptapOptions: S1000DTableTiptapOptions = {
  HTMLAttributes: {},
  allowTableNodeSelection: true,
  enableTabNavigation: true,
  addRowOnTabAtEnd: true,
  enableShiftArrowSelection: true,
  enableCellRangeClipboard: true,
  deleteTableOnAllCellsSelected: true,
  clearCellsOnDelete: true,
  selectedCellClassName: 's1000d-table-cell--selected',
};

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    s1000dTable: {
      insertS1000DTable: (options?: { rows?: number; cols?: number; withTitle?: boolean; titleText?: string }) => ReturnType;
      addS1000DTableRowBefore: () => ReturnType;
      addS1000DTableRowAfter: () => ReturnType;
      deleteS1000DTableRow: () => ReturnType;
      addS1000DTableColumnBefore: () => ReturnType;
      addS1000DTableColumnAfter: () => ReturnType;
      deleteS1000DTableColumn: () => ReturnType;
      moveS1000DTableRowUp: () => ReturnType;
      moveS1000DTableRowDown: () => ReturnType;
      moveS1000DTableColumnLeft: () => ReturnType;
      moveS1000DTableColumnRight: () => ReturnType;
      mergeS1000DTableCells: () => ReturnType;
      splitS1000DTableCell: () => ReturnType;
      mergeOrSplitS1000DTableCell: () => ReturnType;
      goToNextS1000DTableCell: () => ReturnType;
      goToPreviousS1000DTableCell: () => ReturnType;
      selectS1000DTableCell: () => ReturnType;
      selectS1000DTableRow: () => ReturnType;
      selectS1000DTableColumn: () => ReturnType;
      selectS1000DTable: () => ReturnType;
    };
  }
}

const s1000dTableEditingKey = new PluginKey('s1000dTableEditing');

export function createS1000DTableExtensions(options: CreateS1000DTableExtensionsOptions = {}) {
  assertNoCustomNames(options);
  const config = normalizeS1000DTableSchemaOptions(options);
  const { names, profile } = config;
  const tableExtension = createTableExtension(config, options.table);

  return [
    tableExtension,
    createTitleExtension(names),
    createTgroupExtension(names, profile),
    createLeafExtension(names.colspec, 'col', getKnownAttrNames('colspec', profile), {
      'data-s1000d': 'colspec',
    }),
    createLeafExtension(names.spanspec, 'span', getKnownAttrNames('spanspec', profile), {
      'data-s1000d': 'spanspec',
    }),
    createSectionExtension(names, names.thead, 'thead', getKnownAttrNames('section', profile)),
    createSectionExtension(names, names.tbody, 'tbody', getKnownAttrNames('section', profile)),
    createSectionExtension(names, names.tfoot, 'tfoot', getKnownAttrNames('section', profile)),
    createRowExtension(names, profile),
    createEntryExtension(names.entry, config.entryContent, profile),
    createEntryBlockExtension(names.entryBlock),
    createGraphicExtension(names.graphic),
  ];
}

export const S1000DTableExtensions = createS1000DTableExtensions();

function assertNoCustomNames(options: CreateS1000DTableExtensionsOptions): void {
  const runtimeNames = (options as CreateS1000DTableExtensionsOptions & {
    names?: Partial<S1000DTableNodeNames>;
  }).names;
  if (runtimeNames && Object.keys(runtimeNames).length > 0) {
    throw new Error(
      'Custom node names are experimental at the schema layer and are not supported by the S1000D Tiptap integration.',
    );
  }
}

function createTableExtension(
  options: ReturnType<typeof normalizeS1000DTableSchemaOptions>,
  tableOptions: Partial<S1000DTableTiptapOptions> | undefined,
) {
  const names = options.names;
  const knownAttrs = getKnownAttrNames('table', options.profile);

  return Node.create<S1000DTableTiptapOptions>({
    name: names.table,
    group: options.tableGroup,
    content: options.profile === 'extended'
      ? `${names.title}? (${names.tgroup}+ | ${names.graphic}+)`
      : `${names.title}? ${names.tgroup}+`,
    isolating: true,

    addOptions() {
      return { ...defaultS1000DTableTiptapOptions, ...tableOptions };
    },

    addAttributes() {
      return createTiptapAttributeMap(knownAttrs, true);
    },

    addCommands() {
      return createS1000DTableCommands(options.profile);
    },

    addKeyboardShortcuts() {
      return {
        Tab: () => {
          if (!this.options.enableTabNavigation) return false;
          if (this.editor.commands.goToNextS1000DTableCell()) return true;
          if (!this.options.addRowOnTabAtEnd) return false;
          if (!this.editor.commands.addS1000DTableRowAfter()) return false;
          return this.editor.commands.goToNextS1000DTableCell();
        },
        'Shift-Tab': () => (this.options.enableTabNavigation ? this.editor.commands.goToPreviousS1000DTableCell() : false),
      };
    },

    addProseMirrorPlugins() {
      return [createS1000DTableEditingPlugin(this.options)];
    },

    parseHTML() {
      return [{ tag: 'table' }];
    },

    renderHTML({ HTMLAttributes }) {
      return ['table', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { 'data-s1000d': 'table' }), 0];
    },
  });
}

function createTitleExtension(names: S1000DTableNodeNames) {
  return Node.create({
    name: names.title,
    content: 'inline*',
    defining: true,
    parseHTML() {
      return [{ tag: 'caption' }];
    },
    renderHTML({ HTMLAttributes }) {
      return ['caption', mergeAttributes(HTMLAttributes, { 'data-s1000d': 'title' }), 0];
    },
  });
}

function createTgroupExtension(names: S1000DTableNodeNames, profile: S1000DTableProfile) {
  const spanspecContent = profile === 'extended' ? ` ${names.spanspec}*` : '';
  const tfootContent = profile === 'extended' ? ` ${names.tfoot}?` : '';

  return Node.create({
    name: names.tgroup,
    content: `${names.colspec}*${spanspecContent} ${names.thead}?${tfootContent} ${names.tbody}`,
    isolating: true,
    addAttributes() {
      return createTiptapAttributeMap(getKnownAttrNames('tgroup', profile));
    },
    parseHTML() {
      return [{ tag: 'tbody[data-s1000d="tgroup"]' }];
    },
    renderHTML({ HTMLAttributes }) {
      return ['tbody', mergeAttributes(HTMLAttributes, { 'data-s1000d': 'tgroup' }), 0];
    },
  });
}

function createSectionExtension(
  names: S1000DTableNodeNames,
  name: string,
  tag: 'thead' | 'tbody' | 'tfoot',
  knownAttrs: readonly string[],
) {
  return Node.create({
    name,
    content: tag === 'tbody' ? `${names.row}+` : `${names.colspec}* ${names.row}+`,
    isolating: true,
    addAttributes() {
      return createTiptapAttributeMap(knownAttrs);
    },
    parseHTML() {
      return [{ tag }];
    },
    renderHTML({ HTMLAttributes }) {
      return [tag, mergeAttributes(HTMLAttributes, { 'data-s1000d': tag }), 0];
    },
  });
}

function createRowExtension(names: S1000DTableNodeNames, profile: S1000DTableProfile) {
  return Node.create({
    name: names.row,
    content: `${names.entry}+`,
    addAttributes() {
      return createTiptapAttributeMap(getKnownAttrNames('row', profile), profile === 'extended');
    },
    parseHTML() {
      return [{ tag: 'tr' }];
    },
    renderHTML({ HTMLAttributes }) {
      return ['tr', mergeAttributes(HTMLAttributes, { 'data-s1000d': 'row' }), 0];
    },
  });
}

function createEntryExtension(name: string, content: string, profile: S1000DTableProfile) {
  return Node.create({
    name,
    content,
    isolating: true,
    addAttributes() {
      return createTiptapAttributeMap(getKnownAttrNames('entry', profile));
    },
    parseHTML() {
      return [{ tag: 'td' }];
    },
    renderHTML({ HTMLAttributes }) {
      return ['td', mergeAttributes(HTMLAttributes, { 'data-s1000d': 'entry' }), 0];
    },
  });
}

function createEntryBlockExtension(name: string) {
  return Node.create({
    name,
    group: 'block',
    content: 'inline*',
    defining: true,
    addAttributes() {
      return createTiptapAttributeMap(['xmlName', 'rawXml', 'rawText']);
    },
    parseHTML() {
      return [{
        tag: '[data-s1000d="entry-block"]',
        getAttrs: (node) => {
          const element = node as HTMLElement;
          return {
            xmlName: element.tagName.toLowerCase(),
            rawXml: null,
            rawText: element.textContent ?? null,
          };
        },
      }];
    },
    renderHTML({ node, HTMLAttributes }) {
      return [String(node.attrs.xmlName ?? 'para'), mergeAttributes(HTMLAttributes, { 'data-s1000d': 'entry-block' }), 0];
    },
  });
}

function createGraphicExtension(name: string) {
  return Node.create({
    name,
    atom: true,
    addAttributes() {
      return createTiptapAttributeMap(['infoEntityIdent']);
    },
    parseHTML() {
      return [{ tag: 'figure[data-s1000d="graphic"]' }];
    },
    renderHTML({ HTMLAttributes }) {
      return ['figure', mergeAttributes(HTMLAttributes, { 'data-s1000d': 'graphic' })];
    },
  });
}

function createLeafExtension(
  name: string,
  tag: string,
  knownAttrs: readonly string[],
  defaultAttrs: Record<string, string>,
) {
  return Node.create({
    name,
    atom: true,
    addAttributes() {
      return createTiptapAttributeMap(knownAttrs);
    },
    parseHTML() {
      return [{ tag }];
    },
    renderHTML({ HTMLAttributes }) {
      return [tag, mergeAttributes(HTMLAttributes, defaultAttrs)];
    },
  });
}

export function createS1000DTableEditingPlugin(options: S1000DTableTiptapOptions): Plugin {
  return new Plugin({
    key: s1000dTableEditingKey,
    props: {
      decorations(state) {
        return drawCellSelection(state, options.selectedCellClassName);
      },
      handleDOMEvents: {
        copy(view, event) {
          if (!options.enableCellRangeClipboard) return false;
          return handleClipboardCopy(view, event as ClipboardEvent);
        },
        cut(view, event) {
          if (!options.enableCellRangeClipboard) return false;
          return handleClipboardCut(view, event as ClipboardEvent);
        },
        paste(view, event) {
          if (!options.enableCellRangeClipboard) return false;
          return handleClipboardPaste(view, event as ClipboardEvent);
        },
      },
      handleKeyDown(view, event) {
        return handleKeyDown(view, event, options);
      },
    },
    appendTransaction(_transactions, _oldState, state) {
      return normalizeSelection(state, options.allowTableNodeSelection);
    },
  });
}

function createS1000DTableCommands(profile: S1000DTableProfile): Partial<RawCommands> {
  void profile;
  return {
    insertS1000DTable:
      (options = {}) =>
      ({ state, dispatch }) => {
        const table = createS1000DTableNode(state.schema, options);
        if (!dispatch) return true;
        dispatch(state.tr.replaceSelectionWith(table).scrollIntoView());
        return true;
      },
    addS1000DTableRowBefore:
      () =>
      ({ state, dispatch }) =>
        addS1000DRowBefore()(state, dispatch),
    addS1000DTableRowAfter:
      () =>
      ({ state, dispatch }) =>
        addS1000DRowAfter()(state, dispatch),
    deleteS1000DTableRow:
      () =>
      ({ state, dispatch }) =>
        deleteS1000DRow()(state, dispatch),
    addS1000DTableColumnBefore:
      () =>
      ({ state, dispatch }) =>
        addS1000DColumnBefore()(state, dispatch),
    addS1000DTableColumnAfter:
      () =>
      ({ state, dispatch }) =>
        addS1000DColumnAfter()(state, dispatch),
    deleteS1000DTableColumn:
      () =>
      ({ state, dispatch }) =>
        deleteS1000DColumn()(state, dispatch),
    moveS1000DTableRowUp:
      () =>
      ({ state, dispatch }) =>
        moveS1000DRowUp()(state, dispatch),
    moveS1000DTableRowDown:
      () =>
      ({ state, dispatch }) =>
        moveS1000DRowDown()(state, dispatch),
    moveS1000DTableColumnLeft:
      () =>
      ({ state, dispatch }) =>
        moveS1000DColumnLeft()(state, dispatch),
    moveS1000DTableColumnRight:
      () =>
      ({ state, dispatch }) =>
        moveS1000DColumnRight()(state, dispatch),
    mergeS1000DTableCells:
      () =>
      ({ state, dispatch }) =>
        mergeS1000DCells()(state, dispatch),
    splitS1000DTableCell:
      () =>
      ({ state, dispatch }) =>
        splitS1000DCell()(state, dispatch),
    mergeOrSplitS1000DTableCell:
      () =>
      ({ state, dispatch }) =>
        mergeOrSplitS1000DCell()(state, dispatch),
    goToNextS1000DTableCell:
      () =>
      ({ state, dispatch }) =>
        goToAdjacentCell(state, dispatch, 1),
    goToPreviousS1000DTableCell:
      () =>
      ({ state, dispatch }) =>
        goToAdjacentCell(state, dispatch, -1),
    selectS1000DTableCell:
      () =>
      ({ state, dispatch }) =>
        selectCurrentCell(state, dispatch),
    selectS1000DTableRow:
      () =>
      ({ state, dispatch }) =>
        selectCurrentAxis(state, dispatch, 'row'),
    selectS1000DTableColumn:
      () =>
      ({ state, dispatch }) =>
        selectCurrentAxis(state, dispatch, 'column'),
    selectS1000DTable:
      () =>
      ({ state, dispatch }) =>
        selectCurrentTable(state, dispatch),
  };
}

function drawCellSelection(state: EditorState, className: string): DecorationSet | null {
  const selectionInfo = getS1000DSelectionInfo(state);
  if (!selectionInfo || !isS1000DCellSelection(state.selection)) return null;

  const decorations: Decoration[] = [];
  for (const entry of selectionInfo.entries) {
    const pos = findS1000DEntryPosition(selectionInfo, entry);
    if (typeof pos !== 'number') continue;
    decorations.push(Decoration.node(pos, pos + entry.node.nodeSize, { class: className }));
  }
  return DecorationSet.create(state.doc, decorations);
}

function handleClipboardCopy(view: EditorView, event: ClipboardEvent): boolean {
  if (!event.clipboardData) return false;
  const html = serializeS1000DCellSelectionToHtml(view.state);
  const text = serializeS1000DCellSelectionToText(view.state);
  if (!html && !text) return false;
  if (html) event.clipboardData.setData('text/html', html);
  if (text) event.clipboardData.setData('text/plain', text);
  event.preventDefault();
  return true;
}

function handleClipboardCut(view: EditorView, event: ClipboardEvent): boolean {
  if (!handleClipboardCopy(view, event)) return false;

  if (view.state.selection instanceof NodeSelection && view.state.selection.node.type.name === s1000dTableNodeNames.table) {
    return deleteCurrentTable(view.state, view.dispatch);
  }

  return clearS1000DSelectedCells(view.state, view.dispatch);
}

function handleClipboardPaste(view: EditorView, event: ClipboardEvent): boolean {
  if (!event.clipboardData) return false;
  const html = event.clipboardData.getData('text/html');
  const text = event.clipboardData.getData('text/plain');
  const clipboard = parseS1000DHtmlClipboard(html, view.state.schema)
    ?? parseS1000DPlainTextClipboard(text, view.state.schema);
  if (!clipboard) return false;

  const applied = applyS1000DClipboardToSelection(view.state, view.dispatch, clipboard);
  if (!applied) return false;
  event.preventDefault();
  return true;
}

function handleKeyDown(
  view: EditorView,
  event: KeyboardEvent,
  options: S1000DTableTiptapOptions,
): boolean {
  if ((event.key === 'Backspace' || event.key === 'Delete') && isS1000DCellSelection(view.state.selection)) {
    if (isWholeS1000DTableSelection(view.state) && options.deleteTableOnAllCellsSelected) {
      const deleted = deleteCurrentTable(view.state, view.dispatch);
      if (deleted) {
        event.preventDefault();
      }
      return deleted;
    }

    if (!options.clearCellsOnDelete) return false;
    const cleared = clearS1000DSelectedCells(view.state, view.dispatch);
    if (cleared) {
      event.preventDefault();
    }
    return cleared;
  }

  if (event.shiftKey && options.enableShiftArrowSelection) {
    const direction = getArrowDirection(event);
    if (!direction) return false;
    const moved = extendCellSelection(view, direction.axis, direction.dir);
    if (moved) event.preventDefault();
    return moved;
  }

  return false;
}

function normalizeSelection(
  state: EditorState,
  allowTableNodeSelection: boolean,
) {
  const selection = state.selection;

  if (selection instanceof NodeSelection && selection.node.type.name === s1000dTableNodeNames.entry) {
    return state.tr.setSelection(S1000DCellSelection.create(state.doc, selection.from));
  }

  if (selection instanceof NodeSelection && selection.node.type.name === s1000dTableNodeNames.row) {
    const firstEntryPos = findFirstS1000DDescendantPosition(selection.node, s1000dTableNodeNames.entry, selection.from);
    if (typeof firstEntryPos === 'number') {
      return state.tr.setSelection(S1000DCellSelection.rowSelection(state.doc.resolve(firstEntryPos + 1)));
    }
  }

  if (
    selection instanceof NodeSelection
    && selection.node.type.name === s1000dTableNodeNames.table
    && !allowTableNodeSelection
  ) {
    const positions = findS1000DNodePositions(selection.node, s1000dTableNodeNames.entry).map((pos) => selection.from + 1 + pos);
    if (positions.length > 0) {
      return state.tr.setSelection(S1000DCellSelection.create(state.doc, positions[0]!, positions[positions.length - 1]!));
    }
  }

  return undefined;
}

function deleteCurrentTable(
  state: EditorState,
  dispatch: ((tr: any) => void) | undefined,
): boolean {
  const context = findS1000DTableContext(state);
  if (!context) return false;
  if (!dispatch) return true;

  const paragraph = state.schema.nodes.paragraph?.createAndFill();
  const tr = paragraph && state.doc.childCount === 1
    ? state.tr.replaceWith(context.tablePos, context.tablePos + context.table.nodeSize, paragraph)
    : state.tr.delete(context.tablePos, context.tablePos + context.table.nodeSize);
  dispatch(tr.scrollIntoView());
  return true;
}

function goToAdjacentCell(
  state: EditorState,
  dispatch: ((tr: any) => void) | undefined,
  dir: -1 | 1,
): boolean {
  const context = findS1000DTableContext(state);
  const entryContext = findS1000DEntryContext(state);
  if (!context?.activeTgroup || !entryContext) return false;

  const map = findActiveTableMap(context.table, context.activeTgroupIndex);
  const entryPos = findS1000DEntryPosition(context, entryContext.entry);
  if (typeof entryPos !== 'number') return false;
  const tgroupPos = requireS1000DTgroupPosition(context.table, context.tablePos, context.activeTgroupIndex);
  const nextPos = map.nextCell(entryPos - tgroupPos, 'horiz', dir);
  if (nextPos == null) return false;
  if (!dispatch) return true;
  dispatch(state.tr.setSelection(TextSelection.near(state.doc.resolve(tgroupPos + nextPos + 1))).scrollIntoView());
  return true;
}

function selectCurrentCell(
  state: EditorState,
  dispatch: ((tr: any) => void) | undefined,
): boolean {
  const context = findS1000DEntryContext(state);
  if (!context) return false;
  const entryPos = findS1000DEntryPosition(context, context.entry);
  if (typeof entryPos !== 'number') return false;
  if (!dispatch) return true;
  dispatch(state.tr.setSelection(S1000DCellSelection.create(state.doc, entryPos)).scrollIntoView());
  return true;
}

function selectCurrentAxis(
  state: EditorState,
  dispatch: ((tr: any) => void) | undefined,
  axis: 'row' | 'column',
): boolean {
  const context = findS1000DEntryContext(state);
  if (!context) return false;
  const entryPos = findS1000DEntryPosition(context, context.entry);
  if (typeof entryPos !== 'number') return false;
  const selection = axis === 'row'
    ? S1000DCellSelection.rowSelection(state.doc.resolve(entryPos + 1))
    : S1000DCellSelection.colSelection(state.doc.resolve(entryPos + 1));
  if (!dispatch) return true;
  dispatch(state.tr.setSelection(selection).scrollIntoView());
  return true;
}

function selectCurrentTable(
  state: EditorState,
  dispatch: ((tr: any) => void) | undefined,
): boolean {
  const context = findS1000DTableContext(state);
  if (!context) return false;
  if (!dispatch) return true;
  dispatch(state.tr.setSelection(NodeSelection.create(state.doc, context.tablePos)).scrollIntoView());
  return true;
}

function extendCellSelection(
  view: EditorView,
  axis: 'horiz' | 'vert',
  dir: -1 | 1,
): boolean {
  const context = findS1000DTableContext(view.state);
  if (!context?.activeTgroup) return false;
  const map = findActiveTableMap(context.table, context.activeTgroupIndex);

  const currentSelection = isS1000DCellSelection(view.state.selection)
    ? view.state.selection
    : createSelectionFromCursor(view.state);
  if (!currentSelection) return false;

  const tgroupPos = requireS1000DTgroupPosition(context.table, context.tablePos, context.activeTgroupIndex);
  const nextHeadPos = map.nextCell(currentSelection.headEntryPos - tgroupPos, axis, dir);
  if (nextHeadPos == null) return false;
  view.dispatch(
    view.state.tr.setSelection(S1000DCellSelection.create(view.state.doc, currentSelection.anchorEntryPos, tgroupPos + nextHeadPos)).scrollIntoView(),
  );
  return true;
}

function createSelectionFromCursor(state: EditorState): S1000DCellSelection | null {
  const context = findS1000DEntryContext(state);
  if (!context) return null;
  const entryPos = findS1000DEntryPosition(context, context.entry);
  return typeof entryPos === 'number' ? S1000DCellSelection.create(state.doc, entryPos) : null;
}

function getArrowDirection(event: KeyboardEvent): { axis: 'horiz' | 'vert'; dir: -1 | 1 } | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  switch (event.key) {
    case 'ArrowLeft':
      return { axis: 'horiz', dir: -1 };
    case 'ArrowRight':
      return { axis: 'horiz', dir: 1 };
    case 'ArrowUp':
      return { axis: 'vert', dir: -1 };
    case 'ArrowDown':
      return { axis: 'vert', dir: 1 };
    default:
      return null;
  }
}

function createTiptapAttributeMap(
  knownAttrs: readonly string[],
  includeGroupedAttrs = false,
) {
  const attributes: Record<string, { default: unknown; parseHTML: (element: HTMLElement) => unknown; renderHTML: (attrs: Record<string, unknown>) => Record<string, string> }> = {};

  for (const name of knownAttrs) {
    attributes[name] = {
      default: null,
      parseHTML: (element) => element.getAttribute(name),
      renderHTML: (attrs) => {
        const value = attrs[name];
        return value == null || value === '' ? {} : { [name]: String(value) };
      },
    };
  }

  attributes.rawAttrs = {
    default: {},
    parseHTML: (element) => collectRawAttrs(element, new Set(knownAttrs)),
    renderHTML: (attrs) => renderStringRecord(attrs.rawAttrs),
  };

  if (includeGroupedAttrs) {
    for (const groupName of ['changeAttrs', 'authorityAttrs', 'securityAttrs'] as const) {
      attributes[groupName] = {
        default: {},
        parseHTML: () => ({}),
        renderHTML: (attrs) => renderStringRecord(attrs[groupName]),
      };
    }
  }

  return attributes;
}

function collectRawAttrs(element: HTMLElement, knownAttrs: Set<string>): Record<string, string> {
  const rawAttrs: Record<string, string> = {};
  for (const attr of Array.from(element.attributes)) {
    if (knownAttrs.has(attr.name) || attr.name === 'data-s1000d' || attr.name === 'style') continue;
    rawAttrs[attr.name] = attr.value;
  }
  return rawAttrs;
}

function renderStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0),
  );
}

function getKnownAttrNames(
  kind: 'table' | 'tgroup' | 'colspec' | 'spanspec' | 'section' | 'row' | 'entry',
  profile: S1000DTableProfile,
): readonly string[] {
  const normalized = normalizeS1000DTableProfile(profile);
  switch (kind) {
    case 'table':
      return normalized === 'extended'
        ? ['tabstyle', 'tocentry', 'frame', 'colsep', 'rowsep', 'orient', 'pgwide', 'applicRefId', 'id']
        : ['frame', 'colsep', 'rowsep', 'applicRefId', 'id'];
    case 'tgroup':
      return normalized === 'extended'
        ? ['applicRefId', 'cols', 'tgstyle', 'colsep', 'rowsep', 'align', 'charoff', 'char']
        : ['cols', 'colsep', 'rowsep', 'align', 'charoff', 'char'];
    case 'colspec':
      return normalized === 'extended'
        ? ['colname', 'colnum', 'colwidth', 'colsep', 'rowsep', 'align', 'char', 'charoff']
        : ['colname', 'align', 'colwidth'];
    case 'spanspec':
      return ['spanname', 'namest', 'nameend', 'colsep', 'rowsep', 'align', 'char', 'charoff'];
    case 'section':
      return ['valign'];
    case 'row':
      return normalized === 'extended'
        ? ['applicRefId', 'rowsep', 'id']
        : ['applicRefId', 'rowsep', 'id'];
    case 'entry':
      return normalized === 'extended'
        ? ['applicRefId', 'colname', 'namest', 'nameend', 'spanname', 'morerows', 'colsep', 'rowsep', 'rotate', 'valign', 'align', 'charoff', 'char', 'id', 'warningRefs', 'cautionRefs']
        : ['colname', 'namest', 'nameend', 'morerows', 'colsep', 'rowsep', 'rotate', 'valign', 'align'];
  }
}

function findActiveTableMap(table: ProseMirrorNode, tgroupIndex: number) {
  return S1000DTableMap.get(table, tgroupIndex);
}
