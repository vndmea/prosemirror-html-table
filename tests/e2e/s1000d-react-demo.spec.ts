import { expect, test, type Page } from '@playwright/test';

test.describe('S1000D React demo', () => {
  async function openDebugTools(page: Page) {
    const debugTools = page.getByTestId('debug-tools');
    await expect(debugTools).toBeVisible();
    const isExpanded = await debugTools.evaluate((element: HTMLElement) => (element as HTMLDetailsElement).open);
    if (!isExpanded) {
      await page.getByTestId('debug-tools-toggle').click();
    }
  }

  test('demo loads with the required UI surface', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByTestId('s1000d-demo-title')).toHaveText('S1000D Table Demo');
    await expect(page.getByTestId('editor')).toBeVisible();
    await expect(page.getByTestId('validation-output')).toBeVisible();
    await expect(page.getByTestId('xml-output')).toBeVisible();
    await expect(page.getByTestId('html-output')).toBeVisible();
    await expect(page.getByTestId('html-preview')).toBeVisible();
  });

  test('loads the proced sample and validates it', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('load-proced').click();

    await expect(page.getByTestId('editor')).toContainText('Check system status');
    await page.getByTestId('validate').click();
    await expect(page.getByTestId('validation-output')).toContainText('"valid": true');
  });

  test('renders final HTML without editor-only data attributes by default', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('load-proced').click();
    await page.getByTestId('render-html').click();

    const htmlOutput = page.getByTestId('html-output');
    await expect(htmlOutput).toContainText('<table');
    await expect(htmlOutput).toContainText('<caption>');
    await expect(htmlOutput).toContainText('<colgroup>');
    await expect(htmlOutput).toContainText('<tbody>');
    await expect(htmlOutput).not.toContainText('<tbody><tbody>');
    await expect(htmlOutput).not.toContainText('data-s1000d');
  });

  test('exports XML for the current table', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('load-proced').click();
    await page.getByTestId('export-xml').click();

    const xmlOutput = page.getByTestId('xml-output');
    await expect(xmlOutput).toContainText('<table');
    await expect(xmlOutput).toContainText('<tgroup');
    await expect(xmlOutput).toContainText('<tbody');
    await expect(xmlOutput).toContainText('<entry');
  });

  test('row command updates the XML output', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('load-proced').click();
    await openDebugTools(page);
    await page.getByTestId('select-cell').click();
    await page.getByTestId('add-row-after').click();
    await page.getByTestId('export-xml').click();

    const xml = await page.getByTestId('xml-output').textContent();
    expect((xml?.match(/<row\b/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  test('column command updates rendered html', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('load-proced').click();
    await openDebugTools(page);
    await page.getByTestId('select-cell').click();
    await page.getByTestId('add-column-after').click();
    await page.getByTestId('render-html').click();

    const html = await page.getByTestId('html-output').textContent();
    expect((html?.match(/<col\b/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  test('toolbar commands work from real handle selection without debug selection buttons', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('load-proced').click();

    const table = page.getByTestId('editor').getByTestId('s1000d-table');
    await table.hover();
    await page.getByTestId('s1000d-row-handle').first().click();

    await expect(page.getByTestId('selection-scope-label')).toHaveText('Row actions');
    await expect(page.getByTestId('add-row-after')).toBeEnabled();
    await page.getByTestId('add-row-after').click();
    await expect(page.getByTestId('editor').locator('.ProseMirror')).toBeFocused();

    await page.getByTestId('export-xml').click();
    const xml = await page.getByTestId('xml-output').textContent();
    expect((xml?.match(/<row\b/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  test('table handle selects the whole table and keeps table actions available', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('load-proced').click();

    const table = page.getByTestId('editor').getByTestId('s1000d-table');
    await table.hover();
    await page.getByTestId('s1000d-table-handle').click();

    await expect(page.getByTestId('selection-scope-label')).toHaveText('Table actions');
    await expect(page.getByTestId('selection-output')).toContainText('Whole table: true');
    await page.getByTestId('selection-actions-trigger').click();
    await expect(page.getByTestId('selection-menu-item-export-xml')).toBeVisible();
    await page.getByTestId('selection-menu-item-render-html').click();
    await expect(page.getByTestId('html-output')).toContainText('<table');
  });

  test('selection context menu supports keyboard navigation and dismissal', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('load-proced').click();

    const table = page.getByTestId('editor').getByTestId('s1000d-table');
    await table.hover();
    await page.getByTestId('s1000d-column-handle').first().click();

    await page.getByTestId('selection-actions-trigger').click();
    await expect(page.getByTestId('selection-menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('selection-menu')).toBeHidden();
    await expect(page.getByTestId('selection-actions-trigger')).toBeFocused();

    await page.getByTestId('selection-actions-trigger').click();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('selection-menu')).toBeHidden();

    await page.getByTestId('render-html').click();
    const html = await page.getByTestId('html-output').textContent();
    expect((html?.match(/<col\b/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  test('row context menu can delete a selected row', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('load-proced').click();

    const table = page.getByTestId('editor').getByTestId('s1000d-table');
    await table.hover();
    await page.getByTestId('s1000d-row-handle').nth(1).click();

    await page.getByTestId('export-xml').click();
    const beforeXml = await page.getByTestId('xml-output').textContent();
    const beforeRows = beforeXml?.match(/<row\b/g)?.length ?? 0;

    await page.getByTestId('selection-actions-trigger').click();
    await page.getByTestId('selection-menu-item-delete-row').click();
    await page.getByTestId('export-xml').click();

    const afterXml = await page.getByTestId('xml-output').textContent();
    expect(afterXml?.match(/<row\b/g)?.length ?? 0).toBe(beforeRows - 1);
  });

  test('cell context menu can merge and split a keyboard-selected cell range', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('load-extended').click();

    const table = page.getByTestId('editor').getByTestId('s1000d-table');
    const bodyRows = table.locator('tbody[data-s1000d="tbody"] tr');
    await bodyRows.nth(0).locator('td').nth(1).click();
    await page.getByTestId('add-row-after').click();
    await bodyRows.nth(0).locator('td').nth(1).click();
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowDown');

    await expect(page.getByTestId('selection-scope-label')).toHaveText('Selection actions');
    await expect(page.getByTestId('selection-output')).toContainText('Rows 3-4');
    await expect(page.getByTestId('selection-output')).toContainText('Columns 1-2');
    await page.getByTestId('selection-actions-trigger').click();
    await expect(page.getByTestId('selection-menu-item-merge-cells')).toBeEnabled();
    await page.getByTestId('selection-menu-item-merge-cells').click();
    await page.getByTestId('render-html').click();
    await expect(page.getByTestId('html-output')).toContainText('colspan=');

    await page.getByTestId('selection-actions-trigger').click();
    await page.getByTestId('selection-menu-item-split-cell').click();
    await page.getByTestId('validate').click();
    await expect(page.getByTestId('validation-output')).toContainText('"valid": true');
  });

  test('toolbar structural commands participate in undo and redo', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('load-proced').click();

    const table = page.getByTestId('editor').getByTestId('s1000d-table');
    await table.hover();
    await page.getByTestId('s1000d-row-handle').nth(1).click();
    await page.getByTestId('export-xml').click();
    const beforeXml = await page.getByTestId('xml-output').textContent();
    const beforeRows = beforeXml?.match(/<row\b/g)?.length ?? 0;

    await page.getByTestId('add-row-after').click();
    await page.getByTestId('export-xml').click();
    const afterXml = await page.getByTestId('xml-output').textContent();
    expect(afterXml?.match(/<row\b/g)?.length ?? 0).toBe(beforeRows + 1);

    await expect(page.getByTestId('undo')).toBeEnabled();
    await page.getByTestId('undo').click();
    await page.getByTestId('export-xml').click();
    const undoXml = await page.getByTestId('xml-output').textContent();
    expect(undoXml?.match(/<row\b/g)?.length ?? 0).toBe(beforeRows);

    await expect(page.getByTestId('redo')).toBeEnabled();
    await page.getByTestId('redo').click();
    await page.getByTestId('export-xml').click();
    const redoXml = await page.getByTestId('xml-output').textContent();
    expect(redoXml?.match(/<row\b/g)?.length ?? 0).toBe(beforeRows + 1);
  });

  test('tab and shift-tab navigate between neighboring cells', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('load-proced').click();

    const table = page.getByTestId('editor').getByTestId('s1000d-table');
    const firstBodyCell = table.locator('tbody[data-s1000d="tbody"] tr').first().locator('td').first();
    await firstBodyCell.click();

    await page.keyboard.press('Tab');
    await expect(page.getByTestId('selection-output')).toContainText('Columns 1-1');

    await page.keyboard.press('Shift+Tab');
    await expect(page.getByTestId('selection-output')).toContainText('Columns 0-0');
  });

  test('delete clears a selected cell range and escape collapses the cell selection', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('load-proced').click();

    const table = page.getByTestId('editor').getByTestId('s1000d-table');
    const bodyRow = table.locator('tbody[data-s1000d="tbody"] tr').first();
    await bodyRow.locator('td').first().click();
    await page.keyboard.press('Shift+ArrowRight');
    await expect(page.getByTestId('selection-output')).toContainText('Entries 2');

    await page.keyboard.press('Delete');
    await page.getByTestId('export-xml').click();
    const xml = await page.getByTestId('xml-output').textContent();
    expect(xml).not.toContain('Check system status');
    expect(xml).not.toContain('1</entry>');

    await bodyRow.locator('td').first().click();
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('selection-output')).toContainText('Cell selection: false');
  });

  test('move commands keep the table valid', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('load-proced').click();
    await openDebugTools(page);
    await page.getByTestId('select-row').click();
    await page.getByTestId('move-row-down').click();
    await page.getByTestId('validate').click();

    await expect(page.getByTestId('validation-output')).toContainText('"valid": true');
  });

  test('extended sample renders rowspan, colspan, and tfoot', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('load-extended').click();
    await page.getByTestId('render-html').click();

    const html = page.getByTestId('html-output');
    await expect(html).toContainText('colspan=');
    await expect(html).toContainText('rowspan=');
    await expect(html).toContainText('<tfoot>');
  });

  test('merge and split flow stays valid', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('load-proced').click();
    await openDebugTools(page);
    await page.getByTestId('select-first-two-cells').click();
    await page.getByTestId('merge-cells').click();
    await page.getByTestId('render-html').click();
    await expect(page.getByTestId('html-output')).toContainText('colspan=');

    await page.getByTestId('split-cell').click();
    await page.getByTestId('validate').click();
    await expect(page.getByTestId('validation-output')).toContainText('"valid": true');
  });

  test('unsafe attrs stay filtered in default renderer output', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('load-unsafe').click();
    await page.getByTestId('render-html').click();

    const html = page.getByTestId('html-output');
    await expect(html).not.toContainText('onclick');
    await expect(html).not.toContainText('style=');
    await expect(html).not.toContainText('javascript:');
  });

  test('editor DOM and renderer output stay distinct', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('load-proced').click();
    await page.getByTestId('render-html').click();
    await openDebugTools(page);

    await expect(page.getByTestId('editor-dom-output')).toContainText('true');
    await expect(page.getByTestId('html-output')).not.toContainText('data-s1000d');
  });

  test('clipboard MVP copy and paste path works', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('load-proced').click();
    await openDebugTools(page);
    await page.getByTestId('select-cell').click();
    await page.getByTestId('copy-selection').click();

    await expect(page.getByTestId('clipboard-html-length')).not.toContainText('0');
    await page.getByTestId('paste-tsv').click();
    await page.getByTestId('validate').click();

    await expect(page.getByTestId('clipboard-text-output')).toContainText('1');
    await expect(page.getByTestId('validation-output')).toContainText('"valid": true');
  });

  test('clipboard copy exposes TSV and html table payloads for a 2x2 range', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('load-extended').click();

    const table = page.getByTestId('editor').getByTestId('s1000d-table');
    const bodyRows = table.locator('tbody[data-s1000d="tbody"] tr');
    const firstCell = bodyRows.first().locator('td').first();
    const secondRowSecondCell = bodyRows.nth(1).locator('td').nth(1);
    const firstBox = await firstCell.boundingBox();
    const lastBox = await secondRowSecondCell.boundingBox();
    expect(firstBox).toBeTruthy();
    expect(lastBox).toBeTruthy();

    await table.hover();
    await page.mouse.move(firstBox!.x + (firstBox!.width / 2), firstBox!.y + (firstBox!.height / 2));
    await page.mouse.down();
    await page.mouse.move(lastBox!.x + (lastBox!.width / 2), lastBox!.y + (lastBox!.height / 2), { steps: 6 });
    await page.mouse.up();

    await page.getByTestId('copy-selection').click();
    await expect(page.getByTestId('clipboard-text-output')).toContainText('\t');
    await expect(page.getByTestId('clipboard-text-output')).toContainText('\n');
    await expect(page.getByTestId('clipboard-html-output')).toContainText('<table');
    await expect(page.getByTestId('clipboard-html-output')).toContainText('<tbody>');
  });

  test('clipboard html paste restores a copied range and keeps xml valid', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('load-proced').click();

    const table = page.getByTestId('editor').getByTestId('s1000d-table');
    const bodyRows = table.locator('tbody[data-s1000d="tbody"] tr');

    const sourceFirstCell = bodyRows.first().locator('td').first();
    const sourceSecondCell = bodyRows.first().locator('td').nth(1);
    const targetFirstCell = bodyRows.nth(1).locator('td').first();
    const targetSecondCell = bodyRows.nth(1).locator('td').nth(1);

    const sourceFirstBox = await sourceFirstCell.boundingBox();
    const sourceSecondBox = await sourceSecondCell.boundingBox();
    const targetFirstBox = await targetFirstCell.boundingBox();
    const targetSecondBox = await targetSecondCell.boundingBox();
    expect(sourceFirstBox).toBeTruthy();
    expect(sourceSecondBox).toBeTruthy();
    expect(targetFirstBox).toBeTruthy();
    expect(targetSecondBox).toBeTruthy();

    await table.hover();
    await page.mouse.move(sourceFirstBox!.x + (sourceFirstBox!.width / 2), sourceFirstBox!.y + (sourceFirstBox!.height / 2));
    await page.mouse.down();
    await page.mouse.move(sourceSecondBox!.x + (sourceSecondBox!.width / 2), sourceSecondBox!.y + (sourceSecondBox!.height / 2), { steps: 4 });
    await page.mouse.up();
    await expect(page.getByTestId('selection-output')).toContainText('Entries 2');
    await page.getByTestId('copy-selection').click();

    await page.mouse.move(targetFirstBox!.x + (targetFirstBox!.width / 2), targetFirstBox!.y + (targetFirstBox!.height / 2));
    await page.mouse.down();
    await page.mouse.move(targetSecondBox!.x + (targetSecondBox!.width / 2), targetSecondBox!.y + (targetSecondBox!.height / 2), { steps: 4 });
    await page.mouse.up();
    await expect(page.getByTestId('selection-output')).toContainText('Rows 2-2');
    await expect(page.getByTestId('selection-output')).toContainText('Columns 0-1');

    await page.getByTestId('clear-selection').click();
    await page.getByTestId('export-xml').click();
    const clearedXml = await page.getByTestId('xml-output').textContent();
    expect(clearedXml).not.toContain('Record result');

    await page.getByTestId('paste-html').click();
    await page.getByTestId('validate').click();
    await expect(page.getByTestId('validation-output')).toContainText('"valid": true');

    await page.getByTestId('export-xml').click();
    const xml = await page.getByTestId('xml-output').textContent();
    expect(xml?.match(/Check system status/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(xml?.match(/<para>1<\/para>/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  test('overlay selection and resize loop writes colwidth back to XML', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('load-proced').click();

    const editor = page.getByTestId('editor');
    const table = editor.getByTestId('s1000d-table');
    await table.hover();

    await expect(page.getByTestId('s1000d-overlay')).toBeVisible();

    const rowHandle = page.getByTestId('s1000d-row-handle').first();
    await rowHandle.click();
    await expect(page.getByTestId('selection-output')).toContainText('Rows 0-0');

    const resizeHandle = page.getByTestId('s1000d-resize-handle').first();
    const handleBox = await resizeHandle.boundingBox();
    expect(handleBox).toBeTruthy();

    await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(handleBox!.x + handleBox!.width / 2 + 36, handleBox!.y + handleBox!.height / 2);
    await page.mouse.up();

    await page.getByTestId('export-xml').click();
    await expect(page.getByTestId('xml-output')).toContainText('colwidth=');
  });

  test('hovering row and column handles paints row and column feedback', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('load-proced').click();

    const table = page.getByTestId('editor').getByTestId('s1000d-table');
    await table.hover();
    await expect(page.getByTestId('s1000d-overlay')).toBeVisible();

    const rowHandle = page.getByTestId('s1000d-row-handle').first();
    await rowHandle.hover();
    await expect(page.getByTestId('s1000d-hover-row-band')).toBeVisible();

    const columnHandle = page.getByTestId('s1000d-column-handle').first();
    await columnHandle.hover();
    await expect(page.getByTestId('s1000d-hover-column-band')).toBeVisible();
  });

  test('hovering a cell shows cell feedback and drag selects a cell range', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('load-extended').click();

    const table = page.getByTestId('editor').getByTestId('s1000d-table');
    const bodyRows = table.locator('tbody[data-s1000d="tbody"] tr');
    const firstCell = bodyRows.first().locator('td').first();
    const secondRowSecondCell = bodyRows.nth(1).locator('td').nth(1);

    const firstBox = await firstCell.boundingBox();
    const lastBox = await secondRowSecondCell.boundingBox();
    expect(firstBox).toBeTruthy();
    expect(lastBox).toBeTruthy();

    await table.hover();
    await page.mouse.move(firstBox!.x + (firstBox!.width / 2), firstBox!.y + (firstBox!.height / 2));
    await expect(page.getByTestId('s1000d-hover-cell-fill')).toBeVisible();

    await page.mouse.move(firstBox!.x + (firstBox!.width / 2), firstBox!.y + (firstBox!.height / 2));
    await page.mouse.down();
    await page.mouse.move(lastBox!.x + (lastBox!.width / 2), lastBox!.y + (lastBox!.height / 2), { steps: 6 });
    await page.mouse.up();

    await expect(page.getByTestId('selection-output')).toContainText('Rows 2-3');
    await expect(page.getByTestId('selection-output')).toContainText('Columns 0-1');
    await expect(page.getByTestId('selection-output')).not.toContainText('Cell selection: false');
    await expect(page.getByTestId('s1000d-selection-cell-fill')).toBeVisible();
  });

  test('overlay stays aligned after page scroll and viewport resize', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('load-proced').click();

    const table = page.getByTestId('editor').getByTestId('s1000d-table');
    await table.hover();

    const overlay = page.getByTestId('s1000d-overlay');
    const rowHandle = page.getByTestId('s1000d-row-handle').first();

    const initialOverlayBox = await overlay.boundingBox();
    const initialHandleBox = await rowHandle.boundingBox();
    expect(initialOverlayBox).toBeTruthy();
    expect(initialHandleBox).toBeTruthy();

    await page.mouse.wheel(0, 500);
    await expect(overlay).toBeVisible();
    const scrolledHandleBox = await rowHandle.boundingBox();
    expect(scrolledHandleBox).toBeTruthy();

    await page.setViewportSize({ width: 1100, height: 720 });
    await expect(overlay).toBeVisible();
    const resizedHandleBox = await rowHandle.boundingBox();
    expect(resizedHandleBox).toBeTruthy();

    expect(Math.abs((scrolledHandleBox?.y ?? 0) - (initialHandleBox?.y ?? 0))).toBeLessThan(600);
    expect(Math.abs((resizedHandleBox?.x ?? 0) - (initialHandleBox?.x ?? 0))).toBeLessThan(120);
  });
});
