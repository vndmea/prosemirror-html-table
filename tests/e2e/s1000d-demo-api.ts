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

const DEMO_BODY_CELL_SELECTOR = [
  '[data-testid="editor"]',
  '[data-testid="s1000d-table"]',
  'tbody[data-s1000d="tbody"] tr td,',
  '[data-testid="editor"]',
  '[data-testid="s1000d-table"]',
  'tbody[data-s1000d="tbody"] tr th',
].join(' ');

function inferProfile(kind: 'proced' | 'extended' | 'unsafe'): 'proced' | 'extended' {
  return kind === 'proced' ? 'proced' : 'extended';
}

async function waitForDemoTable(page: Page, profile: 'proced' | 'extended'): Promise<void> {
  await expect(page.getByTestId('editor')).toBeVisible();
  await expect(page.getByTestId('s1000d-table')).toBeVisible();
  await expect.poll(async () => (await getDemoSnapshot(page)).profile).toBe(profile);
  await expect.poll(async () => page.locator(DEMO_BODY_CELL_SELECTOR).count()).toBeGreaterThan(0);
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
}

async function waitForSelectionScope(
  page: Page,
  predicate: (scope: DemoSelectionScope) => boolean,
): Promise<void> {
  await expect.poll(async () => predicate((await getDemoSnapshot(page)).selectionScope)).toBe(true);
}

async function waitForSelectionSummary(
  page: Page,
  predicate: (snapshot: DemoSnapshot) => boolean,
): Promise<void> {
  await expect.poll(async () => predicate(await getDemoSnapshot(page))).toBe(true);
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
  const loaded = await page.evaluate((sampleKind) => window.__S1000D_DEMO__!.loadSample(sampleKind), kind);
  if (!loaded) {
    return false;
  }

  await waitForDemoTable(page, inferProfile(kind));
  return true;
}

export async function loadDemoXml(
  page: Page,
  xml: string,
  profile: 'proced' | 'extended' = 'extended',
): Promise<boolean> {
  const loaded = await page.evaluate(
    ({ nextXml, nextProfile }) => window.__S1000D_DEMO__!.loadXml(nextXml, nextProfile),
    { nextXml: xml, nextProfile: profile },
  );
  if (!loaded) {
    return false;
  }

  await waitForDemoTable(page, profile);
  return true;
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
  const selected = await page.evaluate(
    ({ nextRowIndex, nextColumnIndex, nextTgroupIndex }) =>
      window.__S1000D_DEMO__!.selectCell(nextRowIndex, nextColumnIndex, nextTgroupIndex),
    { nextRowIndex: rowIndex, nextColumnIndex: columnIndex, nextTgroupIndex: tgroupIndex },
  );
  if (!selected) {
    return false;
  }

  await waitForSelectionSummary(
    page,
    (snapshot) =>
      snapshot.selectionSummary.includes('Cell selection: true')
      && snapshot.selectionSummary.includes(`Rows ${rowIndex}-${rowIndex}`)
      && snapshot.selectionSummary.includes(`Columns ${columnIndex}-${columnIndex}`)
      && snapshot.selectionSummary.includes('Entries 1'),
  );
  return true;
}

export async function selectDemoRange(
  page: Page,
  anchorRowIndex: number,
  anchorColumnIndex: number,
  headRowIndex: number,
  headColumnIndex: number,
  tgroupIndex = 0,
): Promise<boolean> {
  const selected = await page.evaluate(
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
  if (!selected) {
    return false;
  }

  await waitForSelectionSummary(
    page,
    (snapshot) =>
      (snapshot.selectionScope === 'multi-cell'
        || snapshot.selectionScope === 'cell'
        || snapshot.selectionSummary.includes('Cell selection: true'))
      && snapshot.selectionSummary.includes('Entries'),
  );
  return true;
}

export async function selectDemoRow(
  page: Page,
  rowIndex: number,
  tgroupIndex = 0,
): Promise<boolean> {
  const selected = await page.evaluate(
    ({ nextRowIndex, nextTgroupIndex }) =>
      window.__S1000D_DEMO__!.selectRow(nextRowIndex, nextTgroupIndex),
    { nextRowIndex: rowIndex, nextTgroupIndex: tgroupIndex },
  );
  if (!selected) {
    return false;
  }

  await waitForSelectionScope(page, (scope) => scope === 'row');
  return true;
}

export async function selectDemoColumn(
  page: Page,
  columnIndex: number,
  tgroupIndex = 0,
): Promise<boolean> {
  const selected = await page.evaluate(
    ({ nextColumnIndex, nextTgroupIndex }) =>
      window.__S1000D_DEMO__!.selectColumn(nextColumnIndex, nextTgroupIndex),
    { nextColumnIndex: columnIndex, nextTgroupIndex: tgroupIndex },
  );
  if (!selected) {
    return false;
  }

  await waitForSelectionScope(page, (scope) => scope === 'column');
  return true;
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
