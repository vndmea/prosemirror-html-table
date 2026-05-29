import type { RawCommands } from '@tiptap/core';
import {
  addFootSection as addCoreFootSection,
  addHeadSection as addCoreHeadSection,
  addRowToBody as addCoreRowToBodySection,
  addRowToFoot as addCoreRowToFootSection,
  addRowToHead as addCoreRowToHeadSection,
  addColumnAfter as addCoreColumnAfter,
  addColumnBefore as addCoreColumnBefore,
  addRowAfter as addCoreRowAfter,
  addRowBefore as addCoreRowBefore,
  deleteColumn as deleteCoreColumn,
  removeColgroup as removeCoreColgroup,
  removeCaption as removeCoreCaption,
  deleteRow as deleteCoreRow,
  deleteTable as deleteCoreTable,
  fixTables as fixCoreTables,
  goToNextCell as goToCoreNextCell,
  goToPreviousCell as goToCorePreviousCell,
  insertHtmlTable as insertCoreHtmlTable,
  mergeCells as mergeCoreCells,
  mergeOrSplit as mergeOrSplitCoreCells,
  moveRowDown as moveCoreRowDown,
  moveRowToBody as moveCoreRowToBody,
  moveRowToFoot as moveCoreRowToFoot,
  moveRowToHead as moveCoreRowToHead,
  moveRowUp as moveCoreRowUp,
  removeFootSection as removeCoreFootSection,
  removeHeadSection as removeCoreHeadSection,
  selectCell as selectCoreCell,
  selectColumn as selectCoreColumn,
  selectRow as selectCoreRow,
  selectTable as selectCoreTable,
  setColgroup as setCoreColgroup,
  setCaption as setCoreCaption,
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
      addHtmlTableHeadSection: (options?: HtmlTableCommandOptions) => ReturnType;
      removeHtmlTableHeadSection: (options?: HtmlTableCommandOptions) => ReturnType;
      addHtmlTableFootSection: (options?: HtmlTableCommandOptions) => ReturnType;
      removeHtmlTableFootSection: (options?: HtmlTableCommandOptions) => ReturnType;
      addHtmlTableRowToHead: (options?: HtmlTableCommandOptions) => ReturnType;
      addHtmlTableRowToBody: (options?: HtmlTableCommandOptions) => ReturnType;
      addHtmlTableRowToFoot: (options?: HtmlTableCommandOptions) => ReturnType;
      addHtmlTableRowBefore: (options?: HtmlTableCommandOptions) => ReturnType;
      addHtmlTableRowAfter: (options?: HtmlTableCommandOptions) => ReturnType;
      deleteHtmlTableRow: (options?: HtmlTableCommandOptions) => ReturnType;
      addHtmlTableColumnBefore: (options?: HtmlTableCommandOptions) => ReturnType;
      addHtmlTableColumnAfter: (options?: HtmlTableCommandOptions) => ReturnType;
      deleteHtmlTableColumn: (options?: HtmlTableCommandOptions) => ReturnType;
      deleteHtmlTable: (options?: HtmlTableCommandOptions) => ReturnType;
      moveHtmlTableRowUp: (options?: HtmlTableCommandOptions) => ReturnType;
      moveHtmlTableRowDown: (options?: HtmlTableCommandOptions) => ReturnType;
      moveHtmlTableRowToHead: (options?: HtmlTableCommandOptions) => ReturnType;
      moveHtmlTableRowToBody: (options?: HtmlTableCommandOptions) => ReturnType;
      moveHtmlTableRowToFoot: (options?: HtmlTableCommandOptions) => ReturnType;
      setHtmlTableCaption: (text: string, options?: HtmlTableCommandOptions) => ReturnType;
      setHtmlTableColgroup: (widths?: Array<number | null>, options?: HtmlTableCommandOptions) => ReturnType;
      removeHtmlTableCaption: (options?: HtmlTableCommandOptions) => ReturnType;
      removeHtmlTableColgroup: (options?: HtmlTableCommandOptions) => ReturnType;
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

    addHtmlTableHeadSection:
      (options?: HtmlTableCommandOptions) =>
      ({ state, dispatch }) =>
        addCoreHeadSection(options)(state, dispatch),

    removeHtmlTableHeadSection:
      (options?: HtmlTableCommandOptions) =>
      ({ state, dispatch }) =>
        removeCoreHeadSection(options)(state, dispatch),

    addHtmlTableFootSection:
      (options?: HtmlTableCommandOptions) =>
      ({ state, dispatch }) =>
        addCoreFootSection(options)(state, dispatch),

    removeHtmlTableFootSection:
      (options?: HtmlTableCommandOptions) =>
      ({ state, dispatch }) =>
        removeCoreFootSection(options)(state, dispatch),

    addHtmlTableRowToHead:
      (options?: HtmlTableCommandOptions) =>
      ({ state, dispatch }) =>
        addCoreRowToHeadSection(options)(state, dispatch),

    addHtmlTableRowToBody:
      (options?: HtmlTableCommandOptions) =>
      ({ state, dispatch }) =>
        addCoreRowToBodySection(options)(state, dispatch),

    addHtmlTableRowToFoot:
      (options?: HtmlTableCommandOptions) =>
      ({ state, dispatch }) =>
        addCoreRowToFootSection(options)(state, dispatch),

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

    moveHtmlTableRowUp:
      (options?: HtmlTableCommandOptions) =>
      ({ state, dispatch }) =>
        moveCoreRowUp(options)(state, dispatch),

    moveHtmlTableRowDown:
      (options?: HtmlTableCommandOptions) =>
      ({ state, dispatch }) =>
        moveCoreRowDown(options)(state, dispatch),

    moveHtmlTableRowToHead:
      (options?: HtmlTableCommandOptions) =>
      ({ state, dispatch }) =>
        moveCoreRowToHead(options)(state, dispatch),

    moveHtmlTableRowToBody:
      (options?: HtmlTableCommandOptions) =>
      ({ state, dispatch }) =>
        moveCoreRowToBody(options)(state, dispatch),

    moveHtmlTableRowToFoot:
      (options?: HtmlTableCommandOptions) =>
      ({ state, dispatch }) =>
        moveCoreRowToFoot(options)(state, dispatch),

    setHtmlTableCaption:
      (text: string, options?: HtmlTableCommandOptions) =>
      ({ state, dispatch }) =>
        setCoreCaption(text, options)(state, dispatch),

    setHtmlTableColgroup:
      (widths?: Array<number | null>, options?: HtmlTableCommandOptions) =>
      ({ state, dispatch }) =>
        setCoreColgroup(widths, options)(state, dispatch),

    removeHtmlTableCaption:
      (options?: HtmlTableCommandOptions) =>
      ({ state, dispatch }) =>
        removeCoreCaption(options)(state, dispatch),

    removeHtmlTableColgroup:
      (options?: HtmlTableCommandOptions) =>
      ({ state, dispatch }) =>
        removeCoreColgroup(options)(state, dispatch),

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
