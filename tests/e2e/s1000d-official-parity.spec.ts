import { expect, test, type Locator, type Page } from '@playwright/test';

import {
  expectDemoApi,
  exportDemoXml,
  getDemoSnapshot,
  loadDemoSample,
  loadDemoXml,
  runDemoCommand,
  selectDemoRange,
  selectDemoRow,
} from './s1000d-demo-api';

async function gotoDemo(page: Page, sample: 'proced' | 'extended' = 'proced') {
  await page.goto('/');
  await expectDemoApi(page);
  await loadDemoSample(page, sample);
  await expect.poll(async () => (await getDemoSnapshot(page)).profile).toBe(sample);
  await expect(page.getByTestId('editor')).toBeVisible();
  await expect(page.getByTestId('s1000d-table')).toBeVisible();
}

function table(page: Page) {
  return page.getByTestId('editor').getByTestId('s1000d-table').first();
}

function tableWrapper(page: Page) {
  return page.getByTestId('editor').getByTestId('s1000d-table-wrapper').first();
}

function bodyRows(page: Page) {
  return table(page).locator('tbody[data-s1000d="tbody"] tr');
}

function bodyRowCell(page: Page, rowIndex: number, columnIndex: number) {
  return bodyRows(page).nth(rowIndex).locator('td,th').nth(columnIndex);
}

function firstBodyCell(page: Page) {
  return bodyRowCell(page, 0, 0);
}

function secondBodyCell(page: Page) {
  return bodyRowCell(page, 0, 1);
}

function rowHandle(page: Page, index: number) {
  return page.getByTestId('s1000d-row-handle').nth(index);
}

function columnHandle(page: Page, index: number) {
  return page.getByTestId('s1000d-column-handle').nth(index);
}

function visibleRowHandle(page: Page) {
  return page.locator('[data-testid="s1000d-row-handle"]:visible');
}

function visibleColumnHandle(page: Page) {
  return page.locator('[data-testid="s1000d-column-handle"]:visible');
}

function rowSelectionBand(page: Page) {
  return page.getByTestId('s1000d-selection-row-band');
}

function columnSelectionBand(page: Page) {
  return page.getByTestId('s1000d-selection-column-band');
}

function cellHandle(page: Page) {
  return page.getByTestId('s1000d-cell-handle');
}

function contextMenu(page: Page) {
  return page.getByTestId('selection-menu');
}

function contextSubmenu(page: Page) {
  return page.getByTestId('selection-submenu');
}

function contextMenuAction(page: Page, label: string) {
  return page
    .locator('[data-testid^="selection-menu-item-"]')
    .filter({ hasText: new RegExp(`^${escapeRegExp(label)}$`) })
    .first();
}

function contextSubmenuTrigger(page: Page, label: string) {
  return page
    .locator('[data-testid^="selection-menu-submenu-"]')
    .filter({ hasText: new RegExp(`^${escapeRegExp(label)}$`) })
    .first();
}

function addRowButton(page: Page) {
  return page.getByTestId('s1000d-extend-row');
}

function addColumnButton(page: Page) {
  return page.getByTestId('s1000d-extend-column');
}

function outsideTableTarget(page: Page) {
  return page.getByTestId('s1000d-demo-title');
}

async function clickCenter(page: Page, target: Locator) {
  const box = await target.boundingBox();
  if (!box) {
    throw new Error('Could not resolve target bounding box for pointer click.');
  }

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.up();
}

async function openRowMenu(page: Page, index: number) {
  await clickCenter(page, rowHandle(page, index));
  await expect(rowSelectionBand(page)).toBeVisible();
  await expect(contextMenu(page)).toBeVisible();
}

async function openColumnMenu(page: Page, index: number) {
  await clickCenter(page, columnHandle(page, index));
  await expect(columnSelectionBand(page)).toBeVisible();
  await expect(contextMenu(page)).toBeVisible();
}

async function openSubmenu(page: Page, label: string) {
  await contextSubmenuTrigger(page, label).click();
  await expect(contextSubmenu(page)).toBeVisible();
}

async function expandTableForHorizontalScroll(page: Page, columnsToAdd = 5) {
  for (let index = 0; index < columnsToAdd; index += 1) {
    expect(await runDemoCommand(page, 'selectFirstBodyCell')).toBe(true);
    expect(await runDemoCommand(page, 'addS1000DTableColumnAfter')).toBe(true);
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test.describe('official s1000d parity', () => {
  test('row handle keeps row scope explicit through selection and exposes row actions', async ({ page }) => {
    await gotoDemo(page);

    await firstBodyCell(page).hover();
    await expect(rowHandle(page, 1)).toBeVisible();

    await openRowMenu(page, 1);
    await expect(contextMenu(page)).toHaveAttribute('data-scope', 'row');
    await expect(contextMenuAction(page, 'Add row after')).toBeVisible();
    await expect(contextMenuAction(page, 'Delete row')).toBeVisible();
    await expect(columnSelectionBand(page)).toBeHidden();
  });

  test('row handle stays aligned to the hovered row and keeps sibling handles hidden', async ({ page }) => {
    await gotoDemo(page);

    const hoveredRow = bodyRows(page).nth(1);
    await bodyRowCell(page, 1, 0).hover();

    await expect(rowHandle(page, 2)).toBeVisible();
    await expect(rowHandle(page, 0)).toBeHidden();
    await expect(rowHandle(page, 1)).toBeHidden();

    const handleBox = await rowHandle(page, 2).boundingBox();
    const rowBox = await hoveredRow.boundingBox();
    const wrapperBox = await tableWrapper(page).boundingBox();
    if (!handleBox || !rowBox || !wrapperBox) {
      throw new Error('Could not resolve row handle geometry.');
    }

    expect(Math.abs(handleBox.y + handleBox.height / 2 - rowBox.y - rowBox.height / 2)).toBeLessThan(20);
    expect(Math.abs(handleBox.x + handleBox.width / 2 - wrapperBox.x)).toBeLessThan(24);
  });

  test('selected row handle stays visible after mouse leave and hover overrides older selection', async ({ page }) => {
    await gotoDemo(page);
    await bodyRowCell(page, 1, 0).hover();

    const selectedHandle = visibleRowHandle(page);
    await selectedHandle.click();
    await expect(contextMenu(page)).toBeVisible();
    const selectedRowIndex = await selectedHandle.getAttribute('data-row-index');

    await page.mouse.move(4, 4);
    await expect(page.locator(`[data-testid="s1000d-row-handle"][data-row-index="${selectedRowIndex}"]`)).toBeVisible();

    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(contextMenu(page)).toBeHidden();

    await firstBodyCell(page).hover();
    await expect(visibleRowHandle(page)).toBeVisible();
    await expect(page.locator(`[data-testid="s1000d-row-handle"][data-row-index="${selectedRowIndex}"]`)).toBeHidden();
  });

  test('row menu lifecycle keeps row scope stable and exposes formatting flyouts', async ({ page }) => {
    await gotoDemo(page);
    await firstBodyCell(page).hover();

    await openRowMenu(page, 1);
    await expect(contextMenu(page)).toHaveAttribute('data-scope', 'row');
    await expect(rowSelectionBand(page)).toBeVisible();

    await contextSubmenuTrigger(page, 'Color').click();
    await expect(contextMenu(page)).toBeVisible();
    await expect(contextSubmenu(page)).toBeVisible();

    await outsideTableTarget(page).click();
    await expect(contextMenu(page)).toBeHidden();

    await openRowMenu(page, 1);
    await openSubmenu(page, 'Color');
    await expect(contextSubmenu(page)).toBeVisible();
    await expect(page.getByTestId('selection-menu-item-set-background-blue')).toBeVisible();
  });

  test('column handle selects the whole column and keeps the menu aligned after scroll', async ({ page }) => {
    await page.setViewportSize({ width: 780, height: 900 });
    await gotoDemo(page);
    await expandTableForHorizontalScroll(page, 8);

    await page.evaluate(() => {
      const wrapper = document.querySelector('[data-testid="s1000d-table-wrapper"]') as HTMLElement | null;
      if (wrapper) {
        wrapper.scrollLeft = wrapper.scrollWidth;
      }
    });

    const lastCell = bodyRows(page).first().locator('td,th').last();
    await lastCell.hover();

    const visibleHandle = visibleColumnHandle(page);
    await clickCenter(page, visibleHandle);

    await expect(columnSelectionBand(page)).toBeVisible();
    await expect(contextMenu(page)).toBeVisible();
    await expect(contextMenu(page)).toHaveAttribute('data-scope', 'column');

    const handleBox = await visibleHandle.boundingBox();
    const menuBox = await contextMenu(page).boundingBox();
    if (!handleBox || !menuBox) {
      throw new Error('Could not resolve column menu geometry.');
    }

    const handleCenterX = handleBox.x + handleBox.width / 2;
    const menuCenterX = menuBox.x + menuBox.width / 2;
    expect(Math.abs(menuCenterX - handleCenterX)).toBeLessThan(48);
  });

  test('column handle stays aligned to the hovered column and keeps sibling handles hidden', async ({ page }) => {
    await gotoDemo(page);
    await secondBodyCell(page).hover();

    await expect(columnHandle(page, 1)).toBeVisible();
    await expect(columnHandle(page, 0)).toBeHidden();

    const handleBox = await columnHandle(page, 1).boundingBox();
    const cellBox = await secondBodyCell(page).boundingBox();
    if (!handleBox || !cellBox) {
      throw new Error('Could not resolve column handle geometry.');
    }

    expect(Math.abs(handleBox.x + handleBox.width / 2 - cellBox.x - cellBox.width / 2)).toBeLessThan(20);
  });

  test('column menu lifecycle keeps column scope stable and exposes alignment flyouts', async ({ page }) => {
    await gotoDemo(page);
    await firstBodyCell(page).hover();

    await openColumnMenu(page, 0);
    await expect(contextMenu(page)).toHaveAttribute('data-scope', 'column');
    await expect(columnSelectionBand(page)).toBeVisible();

    await contextSubmenuTrigger(page, 'Alignment').click();
    await expect(contextMenu(page)).toBeVisible();
    await expect(contextSubmenu(page)).toBeVisible();

    await outsideTableTarget(page).click();
    await expect(contextMenu(page)).toBeHidden();

    await openColumnMenu(page, 0);
    await openSubmenu(page, 'Alignment');
    await expect(contextSubmenu(page)).toBeVisible();
  });

  test('cell menu actions keep the rectangular selection active and submenu flyouts stay anchored', async ({ page }) => {
    await gotoDemo(page);
    expect(await loadDemoXml(page, `
<table id="cell-menu-parity">
  <tgroup cols="3">
    <tbody>
      <row><entry>A1</entry><entry>A2</entry><entry>A3</entry></row>
      <row><entry>B1</entry><entry>B2</entry><entry>B3</entry></row>
    </tbody>
  </tgroup>
</table>
    `.trim(), 'extended')).toBe(true);

    expect(await selectDemoRange(page, 0, 0, 1, 1)).toBe(true);
    await expect.poll(async () => (await getDemoSnapshot(page)).selectionScope).toBe('multi-cell');
    const before = await getDemoSnapshot(page);
    expect(before.selectionSummary).toContain('Entries 4');

    await expect(cellHandle(page)).toBeVisible();
    await cellHandle(page).click();
    await expect(contextMenu(page)).toBeVisible();
    await expect(contextMenu(page)).toHaveAttribute('data-scope', 'cell');

    await openSubmenu(page, 'Color');
    const menuBox = await contextMenu(page).boundingBox();
    const submenuBox = await contextSubmenu(page).boundingBox();
    if (!menuBox || !submenuBox) {
      throw new Error('Could not resolve flyout submenu geometry.');
    }

    expect(submenuBox.x).toBeGreaterThanOrEqual(menuBox.x + menuBox.width - 12);
    await expect(contextSubmenu(page)).toBeVisible();
    await expect(page.getByTestId('selection-menu-item-set-background-blue')).toBeVisible();
  });

  test('cell structure submenu exposes merge and split actions for cell selections', async ({ page }) => {
    await gotoDemo(page);
    expect(await loadDemoXml(page, `
<table id="cell-structure-parity">
  <tgroup cols="3">
    <tbody>
      <row><entry>A1</entry><entry>A2</entry><entry>A3</entry></row>
      <row><entry>B1</entry><entry>B2</entry><entry>B3</entry></row>
    </tbody>
  </tgroup>
</table>
    `.trim(), 'extended')).toBe(true);

    expect(await selectDemoRange(page, 0, 0, 1, 1)).toBe(true);
    await expect.poll(async () => (await getDemoSnapshot(page)).selectionScope).toBe('multi-cell');
    await expect(cellHandle(page)).toBeVisible();
    await cellHandle(page).click();
    await openSubmenu(page, 'Structure');
    await expect(contextMenuAction(page, 'Merge cells')).toBeVisible();
    await expect(contextMenuAction(page, 'Split cell')).toBeVisible();
  });

  test('table handle keeps whole-table selection stable and delete lifecycle works from the keyboard', async ({ page }) => {
    await gotoDemo(page);

    await table(page).hover();
    await expect(page.locator('[data-testid="s1000d-table-handle"]:visible')).toHaveCount(0);
    expect(await runDemoCommand(page, 'selectWholeTable')).toBe(true);
    await expect(contextMenu(page)).toBeHidden();
    expect((await exportDemoXml(page)).includes('<table')).toBe(true);
    await page.keyboard.press('Delete');

    await expect(page.getByTestId('editor')).not.toContainText('Check system status');
  });

  test('overlay lifecycle hides extend buttons during menu and resize, then restores them', async ({ page }) => {
    await gotoDemo(page);

    await firstBodyCell(page).hover();
    await expect(addRowButton(page)).not.toHaveAttribute('hidden', '');
    await expect(addColumnButton(page)).not.toHaveAttribute('hidden', '');

    await clickCenter(page, visibleRowHandle(page));
    await expect(contextMenu(page)).toBeVisible();
    await expect(addRowButton(page)).toBeHidden();
    await expect(addColumnButton(page)).toBeHidden();

    await page.keyboard.press('Escape');
    await expect(contextMenu(page)).toBeHidden();
    await firstBodyCell(page).hover();
    await expect(addRowButton(page)).not.toHaveAttribute('hidden', '');
    await expect(addColumnButton(page)).not.toHaveAttribute('hidden', '');

    const resizeHandle = page.getByTestId('s1000d-resize-handle').first();
    const resizeBox = await resizeHandle.boundingBox();
    if (!resizeBox) {
      throw new Error('Could not resolve resize handle geometry.');
    }

    await page.mouse.move(resizeBox.x + resizeBox.width / 2, resizeBox.y + resizeBox.height / 2);
    await page.mouse.down();
    await expect(addRowButton(page)).toBeHidden();
    await expect(addColumnButton(page)).toBeHidden();
    await page.mouse.move(resizeBox.x + resizeBox.width / 2 + 24, resizeBox.y + resizeBox.height / 2, { steps: 4 });
    await page.mouse.up();

    await firstBodyCell(page).hover();
    await expect(addRowButton(page)).not.toHaveAttribute('hidden', '');
    await expect(addColumnButton(page)).not.toHaveAttribute('hidden', '');
  });

  test('row and column drag show drop indicators and reorder content', async ({ page }) => {
    await gotoDemo(page);

    const beforeFirstRow = await bodyRowCell(page, 0, 0).textContent();
    const beforeSecondRow = await bodyRowCell(page, 1, 0).textContent();
    await bodyRowCell(page, 1, 0).hover();

    const rowHandleBox = await visibleRowHandle(page).boundingBox();
    const targetRowBox = await bodyRowCell(page, 0, 0).boundingBox();
    if (!rowHandleBox || !targetRowBox) {
      throw new Error('Could not resolve row drag geometry.');
    }

    await page.mouse.move(rowHandleBox.x + rowHandleBox.width / 2, rowHandleBox.y + rowHandleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(targetRowBox.x + targetRowBox.width / 2, targetRowBox.y + targetRowBox.height / 2, { steps: 8 });
    await expect(page.getByTestId('s1000d-drop-indicator')).toBeVisible();
    await page.mouse.up();

    await expect(bodyRowCell(page, 0, 0)).toHaveText(beforeSecondRow ?? '');
    await expect(bodyRowCell(page, 1, 0)).toHaveText(beforeFirstRow ?? '');

    const beforeFirstColumn = await bodyRowCell(page, 0, 0).textContent();
    const beforeSecondColumn = await bodyRowCell(page, 0, 1).textContent();
    await bodyRowCell(page, 0, 1).hover();

    const columnHandleBox = await visibleColumnHandle(page).boundingBox();
    const targetColumnBox = await bodyRowCell(page, 0, 0).boundingBox();
    if (!columnHandleBox || !targetColumnBox) {
      throw new Error('Could not resolve column drag geometry.');
    }

    await page.mouse.move(columnHandleBox.x + columnHandleBox.width / 2, columnHandleBox.y + columnHandleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(targetColumnBox.x + targetColumnBox.width / 2, targetColumnBox.y + targetColumnBox.height / 2, { steps: 8 });
    await expect(page.getByTestId('s1000d-drop-indicator')).toBeVisible();
    await page.mouse.up();

    await expect(bodyRowCell(page, 0, 0)).toHaveText(beforeSecondColumn ?? '');
    await expect(bodyRowCell(page, 0, 1)).toHaveText(beforeFirstColumn ?? '');
  });

  test('keyboard parity covers tab, delete, escape, and menu arrow navigation', async ({ page }) => {
    await gotoDemo(page);

    const lastBodyCell = bodyRows(page).last().locator('td,th').last();
    await lastBodyCell.click();
    const beforeRows = (await exportDemoXml(page).then((xml) => xml.match(/<row\b/g)?.length ?? 0));
    await page.keyboard.press('Tab');
    const afterRows = (await exportDemoXml(page).then((xml) => xml.match(/<row\b/g)?.length ?? 0));
    expect(afterRows).toBe(beforeRows + 1);

    await firstBodyCell(page).click();
    await page.keyboard.press('Shift+ArrowRight');
    expect((await getDemoSnapshot(page)).selectionSummary).toContain('Entries 2');
    await page.keyboard.press('Delete');
    expect(await exportDemoXml(page)).not.toContain('Check system status');

    await firstBodyCell(page).hover();
    await openRowMenu(page, 1);
    const menuStartRows = await bodyRows(page).count();
    await contextMenuAction(page, 'Add row before').focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(contextMenu(page)).toBeHidden();
    await expect(bodyRows(page)).toHaveCount(menuStartRows + 1);

    await firstBodyCell(page).click();
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Escape');
    expect((await getDemoSnapshot(page)).selectionSummary).toContain('Cell selection: false');
  });

  test('row structure menu exposes move-to-head/body/foot actions', async ({ page }) => {
    await gotoDemo(page);
    await firstBodyCell(page).hover();

    await openRowMenu(page, 1);
    await expect(contextMenuAction(page, 'Move row to head')).toBeVisible();
    await expect(contextMenuAction(page, 'Move row to body')).toBeVisible();
    await expect(contextMenuAction(page, 'Move row to foot')).toBeVisible();
  });

  test('multi-tgroup hover and row menu stay isolated to the hovered active tgroup', async ({ page }) => {
    await page.goto('/');
    await expectDemoApi(page);
    await loadDemoXml(page, `
<table id="multi-tgroup-scope">
  <tgroup cols="2">
    <tbody>
      <row id="tg1-row"><entry>A1</entry><entry>A2</entry></row>
      <row id="tg1-row-2"><entry>A3</entry><entry>A4</entry></row>
    </tbody>
  </tgroup>
  <tgroup cols="2">
    <tbody>
      <row id="tg2-row"><entry>B1</entry><entry>B2</entry></row>
      <row id="tg2-row-2"><entry>B3</entry><entry>B4</entry></row>
    </tbody>
  </tgroup>
</table>
    `.trim(), 'extended');

    expect(await selectDemoRow(page, 0, 0)).toBe(true);
    expect((await getDemoSnapshot(page)).selectionScope).toBe('row');

    const secondTgroupCell = table(page).locator('td,th').filter({ hasText: /^B1$/ }).first();
    await secondTgroupCell.hover();

    const handleBox = await visibleRowHandle(page).boundingBox();
    const rowBox = await secondTgroupCell.locator('xpath=ancestor::tr[1]').boundingBox();
    if (!handleBox || !rowBox) {
      throw new Error('Could not resolve multi-tgroup row handle geometry.');
    }

    expect(Math.abs(handleBox.y + handleBox.height / 2 - rowBox.y - rowBox.height / 2)).toBeLessThan(20);

    await visibleRowHandle(page).click();
    await expect(contextMenu(page)).toHaveAttribute('data-scope', 'row');
    expect(await runDemoCommand(page, 'deleteS1000DTableRow')).toBe(true);

    const xml = await exportDemoXml(page);
    expect(xml).toContain('A1');
    expect(xml).toContain('A2');
    expect(xml).not.toContain('B1');
    expect(xml).not.toContain('B2');
  });
});
