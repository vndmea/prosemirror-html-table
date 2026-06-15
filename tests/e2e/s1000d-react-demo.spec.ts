import { expect, test } from '@playwright/test';

import {
  clearDemoSelection,
  copyDemoSelection,
  expectDemoApi,
  exportDemoXml,
  getDemoEntryText,
  getDemoClipboard,
  getDemoSnapshot,
  loadDemoSample,
  loadDemoXml,
  pasteDemoHtml,
  pasteDemoSingleCell,
  pasteDemoTsv,
  renderDemoHtml,
  runDemoCommand,
  selectDemoCell,
  selectDemoColumn,
  selectDemoRange,
  selectDemoRow,
  validateDemo,
} from './s1000d-demo-api';

test.describe('S1000D React demo', () => {
  test('column actions menu stays aligned to the visible handle after horizontal scroll', async ({ page }) => {
    await page.goto('/');
    await expectDemoApi(page);
    await loadDemoSample(page, 'proced');

    for (let index = 0; index < 5; index += 1) {
      expect(await runDemoCommand(page, 'selectFirstBodyCell')).toBe(true);
      expect(await runDemoCommand(page, 'addS1000DTableColumnAfter')).toBe(true);
    }

    await page.evaluate(() => {
      const element = document.querySelector('[data-testid="s1000d-table-wrapper"]') as HTMLElement | null;
      if (element) {
        element.scrollLeft = element.scrollWidth;
      }
    });

    const table = page.getByTestId('editor').getByTestId('s1000d-table');
    const lastCell = table.locator('tbody[data-s1000d="tbody"] tr').first().locator('td').last();
    await lastCell.hover();

    const columnHandle = page.getByTestId('s1000d-column-handle').last();
    await columnHandle.click();
    await page.getByTestId('selection-actions-trigger').click();

    const handleBox = await columnHandle.boundingBox();
    const menuBox = await page.getByTestId('selection-menu').boundingBox();
    const viewport = page.viewportSize();
    expect(handleBox).toBeTruthy();
    expect(menuBox).toBeTruthy();
    expect(viewport).toBeTruthy();

    const handleCenterX = handleBox!.x + handleBox!.width / 2;
    const menuCenterX = menuBox!.x + menuBox!.width / 2;
    expect(Math.abs(menuCenterX - handleCenterX)).toBeLessThan(48);
    expect(menuBox!.x).toBeGreaterThanOrEqual(0);
    expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(viewport!.width);
  });

  test('caption stays centered for non-empty titles', async ({ page }) => {
    await page.goto('/');
    await expectDemoApi(page);
    await loadDemoSample(page, 'proced');

    const caption = page.getByTestId('editor').getByTestId('s1000d-table').locator('caption');
    await expect(caption).toBeVisible();
    await expect(caption).toHaveCSS('text-align', 'center');
  });

  test('row selection highlight remains clipped to the visible table bounds', async ({ page }) => {
    await page.goto('/');
    await expectDemoApi(page);
    await loadDemoSample(page, 'extended');

    const table = page.getByTestId('editor').getByTestId('s1000d-table');
    await table.hover();
    const rowHandle = page.getByTestId('s1000d-row-handle').nth(2);
    await rowHandle.click();

    const bandBox = await page.getByTestId('s1000d-selection-row-band').boundingBox();
    const tableBox = await table.boundingBox();
    expect(bandBox).toBeTruthy();
    expect(tableBox).toBeTruthy();

    expect(bandBox!.x).toBeGreaterThanOrEqual(tableBox!.x - 2);
    expect(bandBox!.x + bandBox!.width).toBeLessThanOrEqual(tableBox!.x + tableBox!.width + 2);
  });

  test('rectangular drag selection does not leak into intermediate unrelated cells', async ({ page }) => {
    await page.goto('/');
    await expectDemoApi(page);
    await loadDemoXml(page, `
<table id="rect-select-table">
  <tgroup cols="2">
    <tbody>
      <row><entry>1</entry><entry>2</entry></row>
      <row><entry>3</entry><entry>4</entry></row>
      <row><entry>5</entry><entry>6</entry></row>
    </tbody>
  </tgroup>
</table>
    `.trim(), 'extended');

    const table = page.getByTestId('editor').getByTestId('s1000d-table');
    const bodyRows = table.locator('tbody[data-s1000d="tbody"] tr');
    const startCell = bodyRows.nth(0).locator('td').nth(1);
    const endCell = bodyRows.nth(1).locator('td').nth(1);
    const startBox = await startCell.boundingBox();
    const endBox = await endCell.boundingBox();
    expect(startBox).toBeTruthy();
    expect(endBox).toBeTruthy();

    await table.hover();
    await page.mouse.move(startBox!.x + (startBox!.width / 2), startBox!.y + (startBox!.height / 2));
    await page.mouse.down();
    await page.mouse.move(endBox!.x + (endBox!.width / 2), endBox!.y + (endBox!.height / 2), { steps: 6 });
    await page.mouse.up();

    const snapshot = await getDemoSnapshot(page);
    expect(snapshot.selectionSummary).toContain('Rows 0-1');
    expect(snapshot.selectionSummary).toContain('Columns 1-1');
    expect(snapshot.selectionSummary).not.toContain('Columns 0-1');
  });

  test('demo loads with the required UI surface', async ({ page }) => {
    await page.goto('/');
    await expectDemoApi(page);

    await expect(page.getByTestId('s1000d-demo-title')).toHaveText('S1000D Table Demo');
    await expect(page.getByTestId('editor')).toBeVisible();

    const snapshot = await getDemoSnapshot(page);
    expect(snapshot.validation.valid).toBe(true);
    expect(snapshot.xml).toContain('<table');
    expect(snapshot.html).toContain('<table');
  });

  test('loads the proced sample and validates it', async ({ page }) => {
    await page.goto('/');
    await expectDemoApi(page);
    await loadDemoSample(page, 'proced');

    await expect(page.getByTestId('editor')).toContainText('Check system status');
    const validation = await validateDemo(page);
    expect(validation.valid).toBe(true);
  });

  test('renders final HTML without editor-only data attributes by default', async ({ page }) => {
    await page.goto('/');
    await expectDemoApi(page);
    await loadDemoSample(page, 'proced');

    const html = await renderDemoHtml(page);
    expect(html).toContain('<table');
    expect(html).toContain('<caption>');
    expect(html).toContain('<colgroup>');
    expect(html).toContain('<tbody>');
    expect(html).not.toContain('<tbody><tbody>');
    expect(html).not.toContain('data-s1000d');
  });

  test('exports XML for the current table', async ({ page }) => {
    await page.goto('/');
    await expectDemoApi(page);
    await loadDemoSample(page, 'proced');

    const xml = await exportDemoXml(page);
    expect(xml).toContain('<table');
    expect(xml).toContain('<tgroup');
    expect(xml).toContain('<tbody');
    expect(xml).toContain('<entry');
  });

  test('row command updates the XML output', async ({ page }) => {
    await page.goto('/');
    await expectDemoApi(page);
    await loadDemoSample(page, 'proced');
    await runDemoCommand(page, 'selectFirstBodyCell');
    await runDemoCommand(page, 'addS1000DTableRowAfter');

    const xml = await exportDemoXml(page);
    expect((xml.match(/<row\b/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  test('column command updates rendered html', async ({ page }) => {
    await page.goto('/');
    await expectDemoApi(page);
    await loadDemoSample(page, 'proced');
    await runDemoCommand(page, 'selectFirstBodyCell');
    await runDemoCommand(page, 'addS1000DTableColumnAfter');

    const html = await renderDemoHtml(page);
    expect((html.match(/<col\b/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  test('row handle selection plus API command updates XML', async ({ page }) => {
    await page.goto('/');
    await expectDemoApi(page);
    await loadDemoSample(page, 'proced');

    const table = page.getByTestId('editor').getByTestId('s1000d-table');
    await table.hover();
    await page.getByTestId('s1000d-row-handle').first().click();

    const before = await getDemoSnapshot(page);
    expect(before.selectionScope).toBe('row');
    expect(before.selectionSummary).toContain('Rows 0-0');

    expect(await runDemoCommand(page, 'addS1000DTableRowAfter')).toBe(true);
    await expect(page.getByTestId('editor').locator('.ProseMirror')).toBeFocused();

    const xml = await exportDemoXml(page);
    expect((xml.match(/<row\b/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  test('table handle selects the whole table and table actions remain available', async ({ page }) => {
    await page.goto('/');
    await expectDemoApi(page);
    await loadDemoSample(page, 'proced');

    const table = page.getByTestId('editor').getByTestId('s1000d-table');
    await table.hover();
    await page.getByTestId('s1000d-table-handle').click();

    const snapshot = await getDemoSnapshot(page);
    expect(snapshot.selectionScope).toBe('table');
    expect(snapshot.selectionSummary).toContain('Whole table: true');

    await page.getByTestId('selection-actions-trigger').click();
    await expect(page.getByTestId('selection-menu-item-export-xml')).toBeVisible();
    await page.getByTestId('selection-menu-item-render-html').click();

    const html = await renderDemoHtml(page);
    expect(html).toContain('<table');
  });

  test('selection context menu supports keyboard navigation and dismissal', async ({ page }) => {
    await page.goto('/');
    await expectDemoApi(page);
    await loadDemoSample(page, 'proced');

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

    const html = await renderDemoHtml(page);
    expect((html.match(/<col\b/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  test('row context menu can delete a selected row', async ({ page }) => {
    await page.goto('/');
    await expectDemoApi(page);
    await loadDemoSample(page, 'proced');

    const table = page.getByTestId('editor').getByTestId('s1000d-table');
    await table.hover();
    await page.getByTestId('s1000d-row-handle').nth(1).click();

    const beforeRows = (await exportDemoXml(page).then((xml) => xml.match(/<row\b/g)?.length ?? 0));

    await page.getByTestId('selection-actions-trigger').click();
    await page.getByTestId('selection-menu-item-delete-row').click();

    const afterRows = (await exportDemoXml(page).then((xml) => xml.match(/<row\b/g)?.length ?? 0));
    expect(afterRows).toBe(beforeRows - 1);
  });

  test('cell context menu can merge and split a keyboard-selected cell range', async ({ page }) => {
    await page.goto('/');
    await expectDemoApi(page);
    await loadDemoSample(page, 'extended');

    const table = page.getByTestId('editor').getByTestId('s1000d-table');
    const bodyRows = table.locator('tbody[data-s1000d="tbody"] tr');
    await bodyRows.nth(0).locator('td').nth(1).click();
    expect(await runDemoCommand(page, 'addS1000DTableRowAfter')).toBe(true);
    await bodyRows.nth(0).locator('td').nth(1).click();
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowDown');

    const selected = await getDemoSnapshot(page);
    expect(selected.selectionScope).toBe('multi-cell');
    expect(selected.selectionSummary).toContain('Entries');
    expect(selected.selectionSummary).toContain('Cell selection: true');

    await page.getByTestId('selection-actions-trigger').click();
    await expect(page.getByTestId('selection-menu-item-merge-cells')).toBeEnabled();
    await page.getByTestId('selection-menu-item-merge-cells').click();

    const mergedHtml = await renderDemoHtml(page);
    expect(mergedHtml).toContain('colspan=');

    await page.getByTestId('selection-actions-trigger').click();
    await page.getByTestId('selection-menu-item-split-cell').click();

    const validation = await validateDemo(page);
    expect(validation.valid).toBe(true);
  });

  test('cell selection handle appears on a selected range and opens the action menu', async ({ page }) => {
    await page.goto('/');
    await expectDemoApi(page);
    await loadDemoSample(page, 'extended');

    const table = page.getByTestId('editor').getByTestId('s1000d-table');
    const bodyRows = table.locator('tbody[data-s1000d="tbody"] tr');
    await bodyRows.nth(1).locator('td').first().click();
    await page.keyboard.press('Shift+ArrowRight');

    const cellHandle = page.getByTestId('s1000d-cell-handle');
    await expect(cellHandle).toBeVisible();
    await cellHandle.click();

    await expect(page.getByTestId('selection-menu')).toBeVisible();
    await expect(page.getByTestId('selection-menu-item-copy-selection')).toBeVisible();
  });

  test('resize writes colwidth to the active tgroup only and participates in undo/redo', async ({ page }) => {
    await page.goto('/');
    await expectDemoApi(page);

    await loadDemoXml(page, `
<table id="multi-tgroup-table">
  <title>Multi tgroup width check</title>
  <tgroup cols="2">
    <colspec colname="a1" colwidth="80px"/>
    <colspec colname="a2" colwidth="90px"/>
    <tbody>
      <row><entry>A1</entry><entry>A2</entry></row>
    </tbody>
  </tgroup>
  <tgroup cols="2">
    <colspec colname="b1" colwidth="120px"/>
    <colspec colname="b2" colwidth="140px"/>
    <tbody>
      <row><entry>B1</entry><entry>B2</entry></row>
    </tbody>
  </tgroup>
</table>
    `.trim(), 'extended');

    const table = page.getByTestId('editor').getByTestId('s1000d-table');
    await table.hover();

    const firstBodyCell = table.locator('tbody[data-s1000d="tbody"]').nth(0).locator('td').first();
    await firstBodyCell.click();

    const beforeXml = await exportDemoXml(page);
    expect(beforeXml).toContain('colname="a1" colwidth="80px"');
    expect(beforeXml).toContain('colname="b1" colwidth="120px"');

    const resizeHandle = page.getByTestId('s1000d-resize-handle').first();
    const handleBox = await resizeHandle.boundingBox();
    expect(handleBox).toBeTruthy();

    await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(handleBox!.x + handleBox!.width / 2 + 42, handleBox!.y + handleBox!.height / 2, { steps: 5 });
    await page.mouse.up();

    const resizedXml = await exportDemoXml(page);
    expect(resizedXml).not.toContain('colname="a1" colwidth="80px"');
    expect(resizedXml).toContain('colname="b1" colwidth="120px"');

    const resizedHtml = await renderDemoHtml(page);
    expect(resizedHtml).toMatch(/<col style="width: \d+px;"/);

    expect(await runDemoCommand(page, 'undo')).toBe(true);
    const undoXml = await exportDemoXml(page);
    expect(undoXml).toContain('colname="a1" colwidth="80px"');
    expect(undoXml).toContain('colname="b1" colwidth="120px"');

    expect(await runDemoCommand(page, 'redo')).toBe(true);
    const redoXml = await exportDemoXml(page);
    expect(redoXml).not.toContain('colname="a1" colwidth="80px"');
    expect(redoXml).toContain('colname="b1" colwidth="120px"');
  });

  test('toolbar structural commands participate in undo and redo', async ({ page }) => {
    await page.goto('/');
    await expectDemoApi(page);
    await loadDemoSample(page, 'proced');

    const table = page.getByTestId('editor').getByTestId('s1000d-table');
    await table.hover();
    await page.getByTestId('s1000d-row-handle').nth(1).click();

    const beforeRows = (await exportDemoXml(page).then((xml) => xml.match(/<row\b/g)?.length ?? 0));
    expect(await runDemoCommand(page, 'addS1000DTableRowAfter')).toBe(true);
    const afterRows = (await exportDemoXml(page).then((xml) => xml.match(/<row\b/g)?.length ?? 0));
    expect(afterRows).toBe(beforeRows + 1);

    await page.getByTestId('undo').click();
    const undoRows = (await exportDemoXml(page).then((xml) => xml.match(/<row\b/g)?.length ?? 0));
    expect(undoRows).toBe(beforeRows);

    await page.getByTestId('redo').click();
    const redoRows = (await exportDemoXml(page).then((xml) => xml.match(/<row\b/g)?.length ?? 0));
    expect(redoRows).toBe(beforeRows + 1);
  });

  test('tab and shift-tab navigate between neighboring cells', async ({ page }) => {
    await page.goto('/');
    await expectDemoApi(page);
    await loadDemoSample(page, 'proced');

    const table = page.getByTestId('editor').getByTestId('s1000d-table');
    const firstBodyCell = table.locator('tbody[data-s1000d="tbody"] tr').first().locator('td').first();
    await firstBodyCell.click();

    await page.keyboard.press('Tab');
    let snapshot = await getDemoSnapshot(page);
    expect(snapshot.selectionSummary).toContain('Columns 1-1');

    await page.keyboard.press('Shift+Tab');
    snapshot = await getDemoSnapshot(page);
    expect(snapshot.selectionSummary).toContain('Columns 0-0');
  });

  test('tab on the last body cell adds a new row and moves focus into it', async ({ page }) => {
    await page.goto('/');
    await expectDemoApi(page);
    await loadDemoSample(page, 'proced');

    const table = page.getByTestId('editor').getByTestId('s1000d-table');
    const lastBodyCell = table.locator('tbody[data-s1000d="tbody"] tr').last().locator('td').nth(1);
    await lastBodyCell.click();

    const beforeRows = (await exportDemoXml(page).then((xml) => xml.match(/<row\b/g)?.length ?? 0));
    await page.keyboard.press('Tab');

    const snapshot = await getDemoSnapshot(page);
    expect(snapshot.selectionSummary).toContain(`Rows ${beforeRows}-${beforeRows}`);

    const afterRows = (await exportDemoXml(page).then((xml) => xml.match(/<row\b/g)?.length ?? 0));
    expect(afterRows).toBe(beforeRows + 1);
    expect(snapshot.selectionSummary).toContain('Columns 1-1');
  });

  test('delete clears a selected cell range and escape collapses the cell selection', async ({ page }) => {
    await page.goto('/');
    await expectDemoApi(page);
    await loadDemoSample(page, 'proced');

    const table = page.getByTestId('editor').getByTestId('s1000d-table');
    const bodyRow = table.locator('tbody[data-s1000d="tbody"] tr').first();
    await bodyRow.locator('td').first().click();
    await page.keyboard.press('Shift+ArrowRight');

    let snapshot = await getDemoSnapshot(page);
    expect(snapshot.selectionSummary).toContain('Entries 2');

    await page.keyboard.press('Delete');
    const xml = await exportDemoXml(page);
    expect(xml).not.toContain('Check system status');
    expect(xml).not.toContain('1</entry>');

    await bodyRow.locator('td').first().click();
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Escape');
    snapshot = await getDemoSnapshot(page);
    expect(snapshot.selectionSummary).toContain('Cell selection: false');
  });

  test('delete removes the whole table when the table handle selection is active', async ({ page }) => {
    await page.goto('/');
    await expectDemoApi(page);
    await loadDemoSample(page, 'proced');

    const table = page.getByTestId('editor').getByTestId('s1000d-table');
    await table.hover();
    await page.getByTestId('s1000d-table-handle').click();

    const before = await getDemoSnapshot(page);
    expect(before.selectionScope).toBe('table');

    await page.keyboard.press('Delete');
    await expect(page.getByTestId('editor')).not.toContainText('Check system status');

    const validation = await validateDemo(page);
    expect(validation.issues[0]?.message).toContain('No S1000D table is loaded.');
  });

  test('move commands keep the table valid', async ({ page }) => {
    await page.goto('/');
    await expectDemoApi(page);
    await loadDemoSample(page, 'proced');
    await runDemoCommand(page, 'selectFirstBodyRow');
    expect(await runDemoCommand(page, 'moveS1000DTableRowDown')).toBe(true);

    const validation = await validateDemo(page);
    expect(validation.valid).toBe(true);
  });

  test('merged-cell row and column selections stay aligned', async ({ page }) => {
    await page.goto('/');
    await expectDemoApi(page);
    await loadDemoSample(page, 'extended');

    expect(await selectDemoRow(page, 2)).toBe(true);
    let snapshot = await getDemoSnapshot(page);
    expect(snapshot.selectionScope).toBe('row');
    expect(snapshot.selectionSummary).toContain('Rows 2-2');

    expect(await selectDemoColumn(page, 0)).toBe(true);
    snapshot = await getDemoSnapshot(page);
    expect(snapshot.selectionScope).toBe('column');
    expect(snapshot.selectionSummary).toContain('Columns 0-0');

    const validation = await validateDemo(page);
    expect(validation.valid).toBe(true);
  });

  test('merged-cell range commands stay valid after API selection', async ({ page }) => {
    await page.goto('/');
    await expectDemoApi(page);
    await loadDemoSample(page, 'extended');

    expect(await selectDemoRange(page, 3, 1, 3, 2)).toBe(true);
    const snapshot = await getDemoSnapshot(page);
    expect(snapshot.selectionScope).toBe('multi-cell');

    expect(await clearDemoSelection(page)).toBe(true);
    let xml = await exportDemoXml(page);
    expect(xml).toContain('Merged description');
    expect(xml).not.toContain('Detail note');

    expect(await runDemoCommand(page, 'undo')).toBe(true);
    expect(await selectDemoRange(page, 3, 1, 3, 2)).toBe(true);
    expect(await runDemoCommand(page, 'mergeS1000DTableCells')).toBe(true);

    const validation = await validateDemo(page);
    expect(validation.valid).toBe(true);
    xml = await exportDemoXml(page);
    expect(xml).toContain('namest=');
  });

  test('extended sample renders rowspan, colspan, and tfoot', async ({ page }) => {
    await page.goto('/');
    await expectDemoApi(page);
    await loadDemoSample(page, 'extended');

    const html = await renderDemoHtml(page);
    expect(html).toContain('colspan=');
    expect(html).toContain('rowspan=');
    expect(html).toContain('<tfoot>');
  });

  test('merge and split flow stays valid', async ({ page }) => {
    await page.goto('/');
    await expectDemoApi(page);
    await loadDemoXml(page, `
<table id="merge-flow-table">
  <tgroup cols="3">
    <tbody>
      <row id="merge-row-1"><entry>A1</entry><entry>A2</entry><entry>A3</entry></row>
      <row id="merge-row-2"><entry>B1</entry><entry>B2</entry><entry>B3</entry></row>
      <row id="merge-row-3"><entry>C1</entry><entry>C2</entry><entry>C3</entry></row>
    </tbody>
  </tgroup>
</table>
    `.trim(), 'extended');

    expect(await selectDemoRange(page, 0, 0, 1, 1)).toBe(true);
    const snapshot = await getDemoSnapshot(page);
    expect(snapshot.selectionScope).toBe('multi-cell');
    expect(await runDemoCommand(page, 'mergeS1000DTableCells')).toBe(true);

    const html = await renderDemoHtml(page);
    expect(html).toContain('colspan=');

    expect(await runDemoCommand(page, 'splitS1000DTableCell')).toBe(true);
    const validation = await validateDemo(page);
    expect(validation.valid).toBe(true);
  });

  test('unsafe attrs stay filtered in default renderer output', async ({ page }) => {
    await page.goto('/');
    await expectDemoApi(page);
    await loadDemoSample(page, 'unsafe');

    const html = await renderDemoHtml(page);
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('style=');
    expect(html).not.toContain('javascript:');
  });

  test('editor DOM and renderer output stay distinct', async ({ page }) => {
    await page.goto('/');
    await expectDemoApi(page);
    await loadDemoSample(page, 'proced');

    const snapshot = await getDemoSnapshot(page);
    expect(snapshot.editorDomContainsDataAttrs).toBe(true);
    expect(snapshot.html).not.toContain('data-s1000d');
  });

  test('clipboard MVP copy and paste path works', async ({ page }) => {
    await page.goto('/');
    await expectDemoApi(page);
    await loadDemoSample(page, 'proced');
    await runDemoCommand(page, 'selectFirstBodyCell');

    const copied = await copyDemoSelection(page);
    expect(copied.html.length).toBeGreaterThan(0);

    expect(await pasteDemoTsv(page)).toBe(true);
    const validation = await validateDemo(page);
    expect(validation.valid).toBe(true);

    const clipboard = await getDemoClipboard(page);
    expect(clipboard.text).toContain('1');
  });

  test('clipboard copy exposes TSV and html table payloads for a 2x2 range', async ({ page }) => {
    await page.goto('/');
    await expectDemoApi(page);
    await loadDemoSample(page, 'extended');

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

    const clipboard = await copyDemoSelection(page);
    expect(clipboard.text).toContain('\t');
    expect(clipboard.text).toContain('\n');
    expect(clipboard.html).toContain('<table');
    expect(clipboard.html).toContain('<tbody>');
  });

  test('clipboard html paste restores a copied range and keeps xml valid', async ({ page }) => {
    await page.goto('/');
    await expectDemoApi(page);
    await loadDemoSample(page, 'proced');

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
    await copyDemoSelection(page);

    await page.mouse.move(targetFirstBox!.x + (targetFirstBox!.width / 2), targetFirstBox!.y + (targetFirstBox!.height / 2));
    await page.mouse.down();
    await page.mouse.move(targetSecondBox!.x + (targetSecondBox!.width / 2), targetSecondBox!.y + (targetSecondBox!.height / 2), { steps: 4 });
    await page.mouse.up();

    const snapshot = await getDemoSnapshot(page);
    expect(snapshot.selectionSummary).toContain('Rows 2-2');
    expect(snapshot.selectionSummary).toContain('Columns 0-1');
    expect(snapshot.selectionSummary).toContain('Entries 2');

    expect(await clearDemoSelection(page)).toBe(true);
    const clearedXml = await exportDemoXml(page);
    expect(clearedXml).not.toContain('Record result');

    expect(await pasteDemoHtml(page)).toBe(true);
    const validation = await validateDemo(page);
    expect(validation.valid).toBe(true);

    const xml = await exportDemoXml(page);
    expect(xml.match(/Check system status/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(xml.match(/<para>1<\/para>/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  test('single-cell paste fills a multi-cell selection and stays valid', async ({ page }) => {
    await page.goto('/');
    await expectDemoApi(page);
    await loadDemoSample(page, 'proced');

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

    expect(await pasteDemoSingleCell(page)).toBe(true);
    const validation = await validateDemo(page);
    expect(validation.valid).toBe(true);

    const xml = await exportDemoXml(page);
    expect(xml.match(/<para>Alpha<\/para>/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  test('paste into a merged target is rejected and the document stays unchanged', async ({ page }) => {
    await page.goto('/');
    await expectDemoApi(page);
    await loadDemoSample(page, 'extended');

    expect(await selectDemoCell(page, 0, 1)).toBe(true);
    const beforeXml = await exportDemoXml(page);
    const beforeText = await getDemoEntryText(page, 0, 1);

    expect(await pasteDemoTsv(page, 'X\tY')).toBe(false);

    const afterXml = await exportDemoXml(page);
    const afterText = await getDemoEntryText(page, 0, 1);
    expect(afterXml).toBe(beforeXml);
    expect(afterText).toBe(beforeText);
  });

  test('API-driven multi-tgroup commands mutate only the active tgroup', async ({ page }) => {
    await page.goto('/');
    await expectDemoApi(page);

    await loadDemoXml(page, `
<table id="multi-tgroup-edit">
  <title>Multi tgroup edit</title>
  <tgroup cols="2">
    <tbody>
      <row id="tg1-row-1"><entry>A1</entry><entry>A2</entry></row>
    </tbody>
  </tgroup>
  <tgroup cols="2">
    <tbody>
      <row id="tg2-row-1"><entry>B1</entry><entry>B2</entry></row>
    </tbody>
  </tgroup>
</table>
    `.trim(), 'extended');

    expect(await selectDemoCell(page, 0, 0, 1)).toBe(true);
    expect(await runDemoCommand(page, 'addS1000DTableRowAfter')).toBe(true);

    const xml = await exportDemoXml(page);
    expect((xml.match(/tg1-row-1/g) ?? []).length).toBe(1);
    expect((xml.match(/tg2-row-1/g) ?? []).length).toBe(1);
    expect((xml.match(/<tgroup\b/g) ?? []).length).toBe(2);
    expect((xml.match(/<row\b/g) ?? []).length).toBe(3);
  });

  test('API-driven range selection can merge then clear selected cells while keeping XML valid', async ({ page }) => {
    await page.goto('/');
    await expectDemoApi(page);
    await loadDemoXml(page, `
<table id="range-clear-table">
  <tgroup cols="3">
    <tbody>
      <row id="clear-row-1"><entry>A1</entry><entry>A2</entry><entry>A3</entry></row>
      <row id="clear-row-2"><entry>B1</entry><entry>B2</entry><entry>B3</entry></row>
      <row id="clear-row-3"><entry>C1</entry><entry>C2</entry><entry>C3</entry></row>
    </tbody>
  </tgroup>
</table>
    `.trim(), 'extended');

    expect(await selectDemoRange(page, 0, 0, 1, 1)).toBe(true);
    const snapshot = await getDemoSnapshot(page);
    expect(snapshot.selectionScope).toBe('multi-cell');

    expect(await runDemoCommand(page, 'mergeS1000DTableCells')).toBe(true);
    const html = await renderDemoHtml(page);
    expect(html).toContain('colspan=');

    expect(await runDemoCommand(page, 'splitS1000DTableCell')).toBe(true);
    expect(await clearDemoSelection(page)).toBe(true);

    const validation = await validateDemo(page);
    expect(validation.valid).toBe(true);
    const xml = await exportDemoXml(page);
    expect(xml).not.toContain('A1');
    expect(xml).not.toContain('A2');
    expect(xml).not.toContain('B1');
    expect(xml).not.toContain('B2');
  });

  test('overlay selection and resize loop writes colwidth back to XML', async ({ page }) => {
    await page.goto('/');
    await expectDemoApi(page);
    await loadDemoSample(page, 'proced');

    const editor = page.getByTestId('editor');
    const table = editor.getByTestId('s1000d-table');
    await table.hover();

    await expect(page.getByTestId('s1000d-overlay')).toBeVisible();

    const rowHandle = page.getByTestId('s1000d-row-handle').first();
    await rowHandle.click();

    const before = await getDemoSnapshot(page);
    expect(before.selectionSummary).toContain('Rows 0-0');

    const resizeHandle = page.getByTestId('s1000d-resize-handle').first();
    const handleBox = await resizeHandle.boundingBox();
    expect(handleBox).toBeTruthy();

    await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(handleBox!.x + handleBox!.width / 2 + 36, handleBox!.y + handleBox!.height / 2);
    await page.mouse.up();

    const xml = await exportDemoXml(page);
    expect(xml).toContain('colwidth=');
  });

  test('remaining row and column actions stay valid and support undo redo', async ({ page }) => {
    await page.goto('/');
    await expectDemoApi(page);
    await loadDemoSample(page, 'proced');

    expect(await selectDemoRow(page, 1)).toBe(true);
    expect(await runDemoCommand(page, 'moveS1000DTableRowUp')).toBe(true);
    let xml = await exportDemoXml(page);
    expect(xml.indexOf('Check system status')).toBeLessThan(xml.indexOf('Step'));

    expect(await runDemoCommand(page, 'moveS1000DTableRowDown')).toBe(true);
    expect(await selectDemoRow(page, 2)).toBe(true);
    expect(await clearDemoSelection(page)).toBe(true);
    xml = await exportDemoXml(page);
    expect(xml).not.toContain('Record result');

    expect(await runDemoCommand(page, 'undo')).toBe(true);
    expect(await selectDemoColumn(page, 0)).toBe(true);
    expect(await runDemoCommand(page, 'moveS1000DTableColumnRight')).toBe(true);
    expect(await runDemoCommand(page, 'moveS1000DTableColumnLeft')).toBe(true);
    expect(await runDemoCommand(page, 'deleteS1000DTableColumn')).toBe(true);

    const validation = await validateDemo(page);
    expect(validation.valid).toBe(true);
    expect(await runDemoCommand(page, 'undo')).toBe(true);
    expect(await runDemoCommand(page, 'redo')).toBe(true);
  });

  test('cell alignment actions write attributes and keep renderer/xml valid', async ({ page }) => {
    await page.goto('/');
    await expectDemoApi(page);
    await loadDemoSample(page, 'extended');

    const table = page.getByTestId('editor').getByTestId('s1000d-table');
    const bodyCell = table.locator('tbody[data-s1000d="tbody"] tr').nth(1).locator('td').first();
    await bodyCell.click();

    await page.getByTestId('selection-actions-trigger').click();
    await page.getByTestId('selection-menu-item-set-align-center').click();
    await page.getByTestId('selection-actions-trigger').click();
    await page.getByTestId('selection-menu-item-set-valign-bottom').click();

    const snapshot = await getDemoSnapshot(page);
    expect(snapshot.selectionScope).toBe('cell');

    const html = await renderDemoHtml(page);
    expect(html).toContain('<table');
    const validation = await validateDemo(page);
    expect(validation.valid).toBe(true);
  });

  test('selection recovery and overlay remain stable after destructive row and column commands', async ({ page }) => {
    await page.goto('/');
    await expectDemoApi(page);
    await loadDemoSample(page, 'proced');

    const table = page.getByTestId('editor').getByTestId('s1000d-table');
    await table.hover();
    await expect(page.getByTestId('s1000d-overlay')).toBeVisible();

    expect(await selectDemoRow(page, 2)).toBe(true);
    await page.getByTestId('selection-actions-trigger').click();
    await page.getByTestId('selection-menu-item-delete-row').click();

    let snapshot = await getDemoSnapshot(page);
    expect(['row', 'cell']).toContain(snapshot.selectionScope);
    await expect(page.getByTestId('s1000d-overlay')).toBeVisible();

    expect(await selectDemoColumn(page, 1)).toBe(true);
    await page.getByTestId('selection-actions-trigger').click();
    await page.getByTestId('selection-menu-item-delete-column').click();

    snapshot = await getDemoSnapshot(page);
    expect(['column', 'cell', 'multi-cell']).toContain(snapshot.selectionScope);
    await expect(page.getByTestId('s1000d-overlay')).toBeVisible();

    const validation = await validateDemo(page);
    expect(validation.valid).toBe(true);
    const html = await renderDemoHtml(page);
    expect(html).toContain('<table');

    expect(await runDemoCommand(page, 'undo')).toBe(true);
    expect(await runDemoCommand(page, 'redo')).toBe(true);
    expect((await validateDemo(page)).valid).toBe(true);
  });

  test('hovering row and column handles paints row and column feedback', async ({ page }) => {
    await page.goto('/');
    await expectDemoApi(page);
    await loadDemoSample(page, 'proced');

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
    await expectDemoApi(page);
    await loadDemoSample(page, 'extended');

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

    const snapshot = await getDemoSnapshot(page);
    expect(snapshot.selectionSummary).toContain('Rows 2-3');
    expect(snapshot.selectionSummary).toContain('Columns 0-2');
    expect(snapshot.selectionSummary).toContain('Entries 4');
    expect(snapshot.selectionSummary).not.toContain('Cell selection: false');
    await expect(page.getByTestId('s1000d-selection-cell-fill')).toBeVisible();
  });

  test('overlay stays aligned after page scroll and viewport resize', async ({ page }) => {
    await page.goto('/');
    await expectDemoApi(page);
    await loadDemoSample(page, 'proced');

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
