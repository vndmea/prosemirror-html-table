import type { RawCommands } from '@tiptap/core';
import {
  addColumnAfter as addCoreColumnAfter,
  addColumnBefore as addCoreColumnBefore,
  addRowAfter as addCoreRowAfter,
  addRowBefore as addCoreRowBefore,
  deleteColumn as deleteCoreColumn,
  deleteRow as deleteCoreRow,
  deleteTable as deleteCoreTable,
  fixTables as fixCoreTables,
  goToNextCell as goToCoreNextCell,
  goToPreviousCell as goToCorePreviousCell,
  insertHtmlTable as insertCoreHtmlTable,
  mergeCells as mergeCoreCells,
  mergeOrSplit as mergeOrSplitCoreCells,
  selectCell as selectCoreCell,
  selectColumn as selectCoreColumn,
  selectRow as selectCoreRow,
  selectTable as selectCoreTable,
  setCellAttribute as setCoreCellAttribute,
  splitCell as splitCoreCell,
  toggleHeaderCell as toggleCoreHeaderCell,
  toggleHeaderColumn as toggleCoreHeaderColumn,
  toggleHeaderRow as toggleCoreHeaderRow,
  type HtmlTableCellNavigationOptions,
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
      mergeHtmlTableCells: (options?: HtmlTableCommandOptions) => ReturnType;
      splitHtmlTableCell: (options?: HtmlTableCommandOptions) => ReturnType;
      mergeOrSplitHtmlTableCells: (options?: HtmlTableCommandOptions) => ReturnType;
      setHtmlTableCellAttribute: (name: string, value: unknown, options?: HtmlTableCommandOptions) => ReturnType;
      toggleHtmlTableHeaderCell: (options?: HtmlTableCommandOptions) => ReturnType;
      toggleHtmlTableHeaderRow: (options?: HtmlTableCommandOptions) => ReturnType;
      toggleHtmlTableHeaderColumn: (options?: HtmlTableCommandOptions) => ReturnType;
      goToNextHtmlTableCell: (options?: HtmlTableCellNavigationOptions) => ReturnType;
      goToPreviousHtmlTableCell: (options?: HtmlTableCellNavigationOptions) => ReturnType;
      fixHtmlTables: (options?: HtmlTableCommandOptions) => ReturnType;
      selectHtmlTableCell: (options?: HtmlTableCommandOptions) => ReturnType;
      selectHtmlTableRow: (options?: HtmlTableCommandOptions) => ReturnType;
      selectHtmlTableColumn: (options?: HtmlTableCommandOptions) => ReturnType;
      selectHtmlTable: (options?: HtmlTableCommandOptions) => ReturnType;
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

    mergeHtmlTableCells:
      (options?: HtmlTableCommandOptions) =>
      ({ state, dispatch }) =>
        mergeCoreCells(options)(state, dispatch),

    splitHtmlTableCell:
      (options?: HtmlTableCommandOptions) =>
      ({ state, dispatch }) =>
        splitCoreCell(options)(state, dispatch),

    mergeOrSplitHtmlTableCells:
      (options?: HtmlTableCommandOptions) =>
      ({ state, dispatch }) =>
        mergeOrSplitCoreCells(options)(state, dispatch),

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

    goToNextHtmlTableCell:
      (options?: HtmlTableCellNavigationOptions) =>
      ({ state, dispatch }) =>
        goToCoreNextCell(options)(state, dispatch),

    goToPreviousHtmlTableCell:
      (options?: HtmlTableCellNavigationOptions) =>
      ({ state, dispatch }) =>
        goToCorePreviousCell(options)(state, dispatch),

    fixHtmlTables:
      (options?: HtmlTableCommandOptions) =>
      ({ state, dispatch }) =>
        fixCoreTables(options)(state, dispatch),

    selectHtmlTableCell:
      (options?: HtmlTableCommandOptions) =>
      ({ state, dispatch }) =>
        selectCoreCell(options)(state, dispatch),

    selectHtmlTableRow:
      (options?: HtmlTableCommandOptions) =>
      ({ state, dispatch }) =>
        selectCoreRow(options)(state, dispatch),

    selectHtmlTableColumn:
      (options?: HtmlTableCommandOptions) =>
      ({ state, dispatch }) =>
        selectCoreColumn(options)(state, dispatch),

    selectHtmlTable:
      (options?: HtmlTableCommandOptions) =>
      ({ state, dispatch }) =>
        selectCoreTable(options)(state, dispatch),
  };
}

export type {
  HtmlTableCellNavigationOptions,
  HtmlTableCommandOptions,
  InsertHtmlTableCommandOptions,
} from 'prosemirror-html-table';
