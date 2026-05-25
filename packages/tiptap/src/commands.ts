import type { RawCommands } from '@tiptap/core';
import {
  addColumnAfter as addCoreColumnAfter,
  addColumnBefore as addCoreColumnBefore,
  addRowAfter as addCoreRowAfter,
  addRowBefore as addCoreRowBefore,
  deleteColumn as deleteCoreColumn,
  deleteRow as deleteCoreRow,
  deleteTable as deleteCoreTable,
  insertHtmlTable as insertCoreHtmlTable,
  setCellAttribute as setCoreCellAttribute,
  toggleHeaderCell as toggleCoreHeaderCell,
  toggleHeaderColumn as toggleCoreHeaderColumn,
  toggleHeaderRow as toggleCoreHeaderRow,
  type HtmlTableCommandOptions,
  type InsertHtmlTableCommandOptions,
} from 'prosemirror-html-table';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    htmlTable: {
      insertHtmlTable: (options?: InsertHtmlTableCommandOptions) => ReturnType;
      addHtmlTableRowBefore: (options?: HtmlTableCommandOptions) => ReturnType;
      addHtmlTableRowAfter: (options?: HtmlTableCommandOptions) => ReturnType;
      deleteHtmlTableRow: (options?: HtmlTableCommandOptions) => ReturnType;
      addHtmlTableColumnBefore: (options?: HtmlTableCommandOptions) => ReturnType;
      addHtmlTableColumnAfter: (options?: HtmlTableCommandOptions) => ReturnType;
      deleteHtmlTableColumn: (options?: HtmlTableCommandOptions) => ReturnType;
      deleteHtmlTable: (options?: HtmlTableCommandOptions) => ReturnType;
      setHtmlTableCellAttribute: (name: string, value: unknown, options?: HtmlTableCommandOptions) => ReturnType;
      toggleHtmlTableHeaderCell: (options?: HtmlTableCommandOptions) => ReturnType;
      toggleHtmlTableHeaderRow: (options?: HtmlTableCommandOptions) => ReturnType;
      toggleHtmlTableHeaderColumn: (options?: HtmlTableCommandOptions) => ReturnType;
    };
  }
}

export function createHtmlTableCommands(): Partial<RawCommands> {
  return {
    insertHtmlTable:
      (options?: InsertHtmlTableCommandOptions) =>
      ({ state, dispatch }) =>
        insertCoreHtmlTable(options)(state, dispatch),

    addHtmlTableRowBefore:
      (options?: HtmlTableCommandOptions) =>
      ({ state, dispatch }) =>
        addCoreRowBefore(options)(state, dispatch),

    addHtmlTableRowAfter:
      (options?: HtmlTableCommandOptions) =>
      ({ state, dispatch }) =>
        addCoreRowAfter(options)(state, dispatch),

    deleteHtmlTableRow:
      (options?: HtmlTableCommandOptions) =>
      ({ state, dispatch }) =>
        deleteCoreRow(options)(state, dispatch),

    addHtmlTableColumnBefore:
      (options?: HtmlTableCommandOptions) =>
      ({ state, dispatch }) =>
        addCoreColumnBefore(options)(state, dispatch),

    addHtmlTableColumnAfter:
      (options?: HtmlTableCommandOptions) =>
      ({ state, dispatch }) =>
        addCoreColumnAfter(options)(state, dispatch),

    deleteHtmlTableColumn:
      (options?: HtmlTableCommandOptions) =>
      ({ state, dispatch }) =>
        deleteCoreColumn(options)(state, dispatch),

    deleteHtmlTable:
      (options?: HtmlTableCommandOptions) =>
      ({ state, dispatch }) =>
        deleteCoreTable(options)(state, dispatch),

    setHtmlTableCellAttribute:
      (name: string, value: unknown, options?: HtmlTableCommandOptions) =>
      ({ state, dispatch }) =>
        setCoreCellAttribute(name, value, options)(state, dispatch),

    toggleHtmlTableHeaderCell:
      (options?: HtmlTableCommandOptions) =>
      ({ state, dispatch }) =>
        toggleCoreHeaderCell(options)(state, dispatch),

    toggleHtmlTableHeaderRow:
      (options?: HtmlTableCommandOptions) =>
      ({ state, dispatch }) =>
        toggleCoreHeaderRow(options)(state, dispatch),

    toggleHtmlTableHeaderColumn:
      (options?: HtmlTableCommandOptions) =>
      ({ state, dispatch }) =>
        toggleCoreHeaderColumn(options)(state, dispatch),
  };
}

export type { HtmlTableCommandOptions, InsertHtmlTableCommandOptions } from 'prosemirror-html-table';
