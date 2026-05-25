import type { RawCommands } from '@tiptap/core';
import { insertHtmlTable as insertCoreHtmlTable, type InsertHtmlTableCommandOptions } from 'prosemirror-html-table';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    htmlTable: {
      insertHtmlTable: (options?: InsertHtmlTableCommandOptions) => ReturnType;
    };
  }
}

export function createHtmlTableCommands(): Partial<RawCommands> {
  return {
    insertHtmlTable:
      (options?: InsertHtmlTableCommandOptions) =>
      ({ state, dispatch }) =>
        insertCoreHtmlTable(options)(state, dispatch),
  };
}

export type { InsertHtmlTableCommandOptions } from 'prosemirror-html-table';
