import { expect, type Page } from '@playwright/test';

type ClipboardOutput = {
  html: string;
  text: string;
};

type DemoSnapshot = {
  canRedo: boolean;
  canUndo: boolean;
  clipboard: ClipboardOutput;
  html: string;
};

declare global {
  interface Window {
    __HTML_TABLE_DEMO__?: {
      clearSelection: () => boolean;
      copySelection: () => ClipboardOutput;
      getClipboard: () => ClipboardOutput;
      getSnapshot: () => DemoSnapshot;
      pasteHtml: (html?: string) => boolean;
      pasteSingleCell: (text?: string) => boolean;
      pasteTsv: (text?: string) => boolean;
      runCommand: (name: string) => boolean;
      selectCell: (rowIndex: number, columnIndex: number, section?: 'thead' | 'tbody' | 'tfoot') => boolean;
    };
  }
}

export async function expectHtmlTableDemoApi(page: Page): Promise<void> {
  await expect
    .poll(async () => page.evaluate(() => Boolean(window.__HTML_TABLE_DEMO__)))
    .toBe(true);
}

export async function copyHtmlTableDemoSelection(page: Page): Promise<ClipboardOutput> {
  return page.evaluate(() => window.__HTML_TABLE_DEMO__!.copySelection());
}

export async function pasteHtmlTableDemoHtml(page: Page, html?: string): Promise<boolean> {
  return page.evaluate((nextHtml) => window.__HTML_TABLE_DEMO__!.pasteHtml(nextHtml), html);
}

export async function pasteHtmlTableDemoSingleCell(page: Page, text?: string): Promise<boolean> {
  return page.evaluate((nextText) => window.__HTML_TABLE_DEMO__!.pasteSingleCell(nextText), text);
}

export async function runHtmlTableDemoCommand(page: Page, name: string): Promise<boolean> {
  return page.evaluate((commandName) => window.__HTML_TABLE_DEMO__!.runCommand(commandName), name);
}

export async function getHtmlTableDemoSnapshot(page: Page): Promise<DemoSnapshot> {
  return page.evaluate(() => window.__HTML_TABLE_DEMO__!.getSnapshot());
}

export async function selectHtmlTableDemoCell(
  page: Page,
  rowIndex: number,
  columnIndex: number,
  section: 'thead' | 'tbody' | 'tfoot' = 'tbody',
): Promise<boolean> {
  return page.evaluate(
    ({ nextRowIndex, nextColumnIndex, nextSection }) =>
      window.__HTML_TABLE_DEMO__!.selectCell(nextRowIndex, nextColumnIndex, nextSection),
    { nextRowIndex: rowIndex, nextColumnIndex: columnIndex, nextSection: section },
  );
}
