import { expect, type Page } from '@playwright/test';

type DemoSelectionScope = 'none' | 'table' | 'row' | 'column' | 'cell' | 'multi-cell';

type ValidationOutput = {
  valid: boolean;
  issues: Array<{ message: string; code?: string | undefined }>;
};

type ClipboardOutput = {
  html: string;
  text: string;
};

type DemoSnapshot = {
  profile: 'proced' | 'extended';
  selectionScope: DemoSelectionScope;
  selectionLabel: string;
  selectionSummary: string;
  validation: ValidationOutput;
  xml: string;
  html: string;
  clipboard: ClipboardOutput;
  editorDomContainsDataAttrs: boolean;
};

declare global {
  interface Window {
    __S1000D_DEMO__?: {
      loadSample: (kind: 'proced' | 'extended' | 'unsafe') => boolean;
      loadXml: (xml: string, profile?: 'proced' | 'extended') => boolean;
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
  }
}

export async function expectDemoApi(page: Page): Promise<void> {
  await expect
    .poll(async () => page.evaluate(() => Boolean(window.__S1000D_DEMO__)))
    .toBe(true);
}

export async function getDemoSnapshot(page: Page): Promise<DemoSnapshot> {
  return page.evaluate(() => window.__S1000D_DEMO__!.getSnapshot());
}

export async function runDemoCommand(page: Page, name: string): Promise<boolean> {
  return page.evaluate((commandName) => window.__S1000D_DEMO__!.runCommand(commandName), name);
}

export async function loadDemoSample(
  page: Page,
  kind: 'proced' | 'extended' | 'unsafe',
): Promise<boolean> {
  return page.evaluate((sampleKind) => window.__S1000D_DEMO__!.loadSample(sampleKind), kind);
}

export async function loadDemoXml(
  page: Page,
  xml: string,
  profile: 'proced' | 'extended' = 'extended',
): Promise<boolean> {
  return page.evaluate(
    ({ nextXml, nextProfile }) => window.__S1000D_DEMO__!.loadXml(nextXml, nextProfile),
    { nextXml: xml, nextProfile: profile },
  );
}

export async function validateDemo(page: Page): Promise<ValidationOutput> {
  return page.evaluate(() => window.__S1000D_DEMO__!.validate());
}

export async function exportDemoXml(page: Page): Promise<string> {
  return page.evaluate(() => window.__S1000D_DEMO__!.exportXml());
}

export async function renderDemoHtml(page: Page, includeRawAttrs = false): Promise<string> {
  return page.evaluate((withRawAttrs) => window.__S1000D_DEMO__!.renderHtml(withRawAttrs), includeRawAttrs);
}

export async function copyDemoSelection(page: Page): Promise<ClipboardOutput> {
  return page.evaluate(() => window.__S1000D_DEMO__!.copySelection());
}

export async function getDemoClipboard(page: Page): Promise<ClipboardOutput> {
  return page.evaluate(() => window.__S1000D_DEMO__!.getClipboard());
}

export async function pasteDemoHtml(page: Page, html?: string): Promise<boolean> {
  return page.evaluate((nextHtml) => window.__S1000D_DEMO__!.pasteHtml(nextHtml), html);
}

export async function pasteDemoTsv(page: Page, text?: string): Promise<boolean> {
  return page.evaluate((nextText) => window.__S1000D_DEMO__!.pasteTsv(nextText), text);
}

export async function pasteDemoSingleCell(page: Page, text?: string): Promise<boolean> {
  return page.evaluate((nextText) => window.__S1000D_DEMO__!.pasteSingleCell(nextText), text);
}

export async function clearDemoSelection(page: Page): Promise<boolean> {
  return page.evaluate(() => window.__S1000D_DEMO__!.clearSelection());
}

export async function selectDemoCell(
  page: Page,
  rowIndex: number,
  columnIndex: number,
  tgroupIndex = 0,
): Promise<boolean> {
  return page.evaluate(
    ({ nextRowIndex, nextColumnIndex, nextTgroupIndex }) =>
      window.__S1000D_DEMO__!.selectCell(nextRowIndex, nextColumnIndex, nextTgroupIndex),
    { nextRowIndex: rowIndex, nextColumnIndex: columnIndex, nextTgroupIndex: tgroupIndex },
  );
}

export async function selectDemoRange(
  page: Page,
  anchorRowIndex: number,
  anchorColumnIndex: number,
  headRowIndex: number,
  headColumnIndex: number,
  tgroupIndex = 0,
): Promise<boolean> {
  return page.evaluate(
    ({
      nextAnchorRowIndex,
      nextAnchorColumnIndex,
      nextHeadRowIndex,
      nextHeadColumnIndex,
      nextTgroupIndex,
    }) => window.__S1000D_DEMO__!.selectRange(
      nextAnchorRowIndex,
      nextAnchorColumnIndex,
      nextHeadRowIndex,
      nextHeadColumnIndex,
      nextTgroupIndex,
    ),
    {
      nextAnchorRowIndex: anchorRowIndex,
      nextAnchorColumnIndex: anchorColumnIndex,
      nextHeadRowIndex: headRowIndex,
      nextHeadColumnIndex: headColumnIndex,
      nextTgroupIndex: tgroupIndex,
    },
  );
}

export async function selectDemoRow(
  page: Page,
  rowIndex: number,
  tgroupIndex = 0,
): Promise<boolean> {
  return page.evaluate(
    ({ nextRowIndex, nextTgroupIndex }) =>
      window.__S1000D_DEMO__!.selectRow(nextRowIndex, nextTgroupIndex),
    { nextRowIndex: rowIndex, nextTgroupIndex: tgroupIndex },
  );
}

export async function selectDemoColumn(
  page: Page,
  columnIndex: number,
  tgroupIndex = 0,
): Promise<boolean> {
  return page.evaluate(
    ({ nextColumnIndex, nextTgroupIndex }) =>
      window.__S1000D_DEMO__!.selectColumn(nextColumnIndex, nextTgroupIndex),
    { nextColumnIndex: columnIndex, nextTgroupIndex: tgroupIndex },
  );
}

export async function getDemoEntryText(
  page: Page,
  rowIndex: number,
  columnIndex: number,
  tgroupIndex = 0,
): Promise<string | null> {
  return page.evaluate(
    ({ nextRowIndex, nextColumnIndex, nextTgroupIndex }) =>
      window.__S1000D_DEMO__!.getEntryText(nextRowIndex, nextColumnIndex, nextTgroupIndex),
    { nextRowIndex: rowIndex, nextColumnIndex: columnIndex, nextTgroupIndex: tgroupIndex },
  );
}
