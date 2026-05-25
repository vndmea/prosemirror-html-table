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
  };
}

export type { HtmlTableCommandOptions, InsertHtmlTableCommandOptions } from 'prosemirror-html-table';
