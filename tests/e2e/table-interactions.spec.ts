import { expect, test, type Locator, type Page } from '@playwright/test';

async function gotoDemo(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('pmht-editor')).toBeVisible();
  await expect(page.getByTestId('pmht-table')).toBeVisible();
}

function table(page: Page) {
  return page.getByTestId('pmht-table').first();
}

function tableWrapper(page: Page) {
  return page.getByTestId('pmht-table-wrapper').first();
}

function rowHandle(page: Page, index: number) {
  return page.getByTestId('pmht-row-handle').nth(index);
}

function columnHandle(page: Page, index: number) {
  return page.getByTestId('pmht-column-handle').nth(index);
}

function rowSelectionBand(page: Page) {
  return page.getByTestId('pmht-selection-band-row');
}

function columnSelectionBand(page: Page) {
  return page.getByTestId('pmht-selection-band-column');
}

function contextMenu(page: Page) {
  return page.getByTestId('pmht-context-menu');
}

function contextSubmenu(page: Page) {
  return page.getByTestId('pmht-context-submenu');
}

function contextMenuAction(page: Page, label: string) {
  return page
    .getByTestId('pmht-context-menu-action')
    .filter({ hasText: new RegExp(`^${escapeRegExp(label)}$`) })
    .first();
}

function firstBodyCell(page: Page) {
  return table(page).locator('tbody tr').first().locator('td,th').first();
}

function secondBodyCell(page: Page) {
  return table(page).locator('tbody tr').first().locator('td,th').nth(1);
}

async function openRowMenu(page: Page, rowIndex: number) {
  await clickCenter(page, rowHandle(page, rowIndex));
  await expect(rowSelectionBand(page)).toBeVisible();
  await expect(contextMenu(page)).toBeVisible();
}

async function openColumnMenu(page: Page, columnIndex: number) {
  await clickCenter(page, columnHandle(page, columnIndex));
  await expect(columnSelectionBand(page)).toBeVisible();
  await expect(contextMenu(page)).toBeVisible();
}

async function dragBetweenCells(page: Page, start: Locator, end: Locator) {
  const startBox = await start.boundingBox();
  const endBox = await end.boundingBox();
  if (!startBox || !endBox) {
    throw new Error('Could not resolve cell bounding boxes for drag selection.');
  }

  await page.mouse.move(startBox.x + startBox.width / 2, startBox.y + startBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(endBox.x + endBox.width / 2, endBox.y + endBox.height / 2, { steps: 8 });
  await page.mouse.up();
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

async function activateMenuAction(page: Page, label: string) {
  const action = contextMenuAction(page, label);
  await action.evaluate((element) => {
    element.scrollIntoView({ block: 'center', inline: 'nearest' });
  });
  await action.dispatchEvent('mousedown');
}

async function openCellSubmenu(page: Page, label: string) {
  await activateMenuAction(page, label);
  await expect(contextSubmenu(page)).toBeVisible();
}

test.describe('table interactions', () => {
  test('row handle hover, select, open menu, and add row after', async ({ page }) => {
    await gotoDemo(page);
    await firstBodyCell(page).hover();

    await expect(rowHandle(page, 1)).toBeVisible();

    const initialRowCount = await table(page).locator('tbody tr').count();
    await openRowMenu(page, 1);
    await expect(contextMenuAction(page, 'Add row after')).toBeEnabled();

    await activateMenuAction(page, 'Add row after');

    await expect(contextMenu(page)).toBeHidden();
    await expect(table(page).locator('tbody tr')).toHaveCount(initialRowCount + 1);
  });

  test('column handle hover, select, open menu, add and delete columns', async ({ page }) => {
    await gotoDemo(page);
    await firstBodyCell(page).hover();

    await expect(columnHandle(page, 0)).toBeVisible();

    const headerCells = table(page).locator('thead tr').first().locator('th,td');
    const initialColumnCount = await headerCells.count();

    await openColumnMenu(page, 0);
    await expect(contextMenuAction(page, 'Add column after')).toBeEnabled();
    await activateMenuAction(page, 'Add column after');

    await expect(contextMenu(page)).toBeHidden();
    await expect(headerCells).toHaveCount(initialColumnCount + 1);

    await firstBodyCell(page).hover();
    await openColumnMenu(page, 0);
    await expect(contextMenuAction(page, 'Delete column')).toBeEnabled();
    await activateMenuAction(page, 'Delete column');

    await expect(contextMenu(page)).toBeHidden();
    await expect(headerCells).toHaveCount(initialColumnCount);
  });

  test('cell range selection, cell handle, and merge or split action', async ({ page }) => {
    await gotoDemo(page);

    await dragBetweenCells(page, firstBodyCell(page), secondBodyCell(page));

    await expect(page.getByTestId('pmht-selected-cell')).toHaveCount(2);
    await expect(page.getByTestId('pmht-cell-handle')).toBeVisible();

    const beforeMergeCellCount = await table(page).locator('tbody tr').first().locator('td,th').count();
    await page.getByTestId('pmht-cell-handle').click();
    await expect(contextMenu(page)).toBeVisible();
    await openCellSubmenu(page, 'Structure');
    await expect(contextMenuAction(page, 'Merge or split cells')).toBeEnabled();
    await activateMenuAction(page, 'Merge or split cells');

    await expect(contextMenu(page)).toBeHidden();
    await expect(table(page).locator('tbody tr').first().locator('td,th')).toHaveCount(beforeMergeCellCount - 1);
    await expect(table(page).locator('tbody tr').first().locator('[colspan="2"]')).toHaveCount(1);

    await page.getByTestId('pmht-cell-handle').click();
    await expect(contextMenu(page)).toBeVisible();
    await openCellSubmenu(page, 'Structure');
    await activateMenuAction(page, 'Merge or split cells');

    await expect(contextMenu(page)).toBeHidden();
    await expect(table(page).locator('tbody tr').first().locator('td,th')).toHaveCount(beforeMergeCellCount);
  });

  test('cell submenu opens as a right-side flyout without inline back navigation', async ({ page }) => {
    await gotoDemo(page);

    await dragBetweenCells(page, firstBodyCell(page), secondBodyCell(page));
    await page.getByTestId('pmht-cell-handle').click();
    await expect(contextMenu(page)).toBeVisible();
    await expect(contextMenu(page)).not.toContainText('Cell actions');
    await expect(contextMenu(page)).not.toContainText('Clear selected cells');

    await openCellSubmenu(page, 'Color');
    await expect(page.getByText(/^Back to /)).toHaveCount(0);

    const menuBox = await contextMenu(page).boundingBox();
    const submenuBox = await contextSubmenu(page).boundingBox();
    if (!menuBox || !submenuBox) {
      throw new Error('Could not resolve flyout submenu geometry.');
    }

    expect(submenuBox.x).toBeGreaterThanOrEqual(menuBox.x + menuBox.width - 8);
  });

  test('menus close on Escape and outside click, but not on non-action inside clicks', async ({ page }) => {
    await gotoDemo(page);
    await firstBodyCell(page).hover();
    await openRowMenu(page, 1);

    await contextMenu(page).click({ position: { x: 3, y: 3 } });
    await expect(contextMenu(page)).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(contextMenu(page)).toBeHidden();

    await openRowMenu(page, 1);
    await page.locator('.hero').click();
    await expect(contextMenu(page)).toBeHidden();
  });

  test('resize changes column width without opening menus or triggering axis selection', async ({ page }) => {
    await gotoDemo(page);
    await firstBodyCell(page).hover();

    const resizeHandle = page.getByTestId('pmht-resize-handle').first();
    await expect(resizeHandle).toBeVisible();

    const beforeWidth = await table(page).locator('col').first().getAttribute('width');
    const box = await resizeHandle.boundingBox();
    if (!box) {
      throw new Error('Could not resolve resize handle bounding box.');
    }

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 48, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();

    const afterWidth = await table(page).locator('col').first().getAttribute('width');
    expect(afterWidth).not.toBe(beforeWidth);
    await expect(contextMenu(page)).toBeHidden();
    await expect(rowSelectionBand(page)).toBeHidden();
    await expect(columnSelectionBand(page)).toBeHidden();
  });

  test('after horizontal scroll, menus stay aligned to the visible handle instead of clipping to the wrapper', async ({ page }) => {
    await gotoDemo(page);

    for (let index = 0; index < 5; index += 1) {
      await firstBodyCell(page).hover();
      await openColumnMenu(page, 0);
      await activateMenuAction(page, 'Add column after');
      await expect(contextMenu(page)).toBeHidden();
    }

    await expect.poll(async () => {
      return page.evaluate(() => {
        const wrapper = document.querySelector('[data-testid="pmht-table-wrapper"]') as HTMLElement | null;
        return wrapper ? wrapper.scrollWidth > wrapper.clientWidth : false;
      });
    }).toBe(true);

    await page.evaluate(() => {
      const wrapper = document.querySelector('[data-testid="pmht-table-wrapper"]') as HTMLElement | null;
      if (wrapper) {
        wrapper.scrollLeft = wrapper.scrollWidth;
      }
    });

    const lastCell = table(page).locator('tbody tr').first().locator('td,th').last();
    await lastCell.hover();

    const lastColumnIndex = await table(page).locator('thead tr').first().locator('th,td').count() - 1;
    await expect(columnHandle(page, lastColumnIndex)).toBeVisible();
    await openColumnMenu(page, lastColumnIndex);

    const wrapperBox = await tableWrapper(page).boundingBox();
    const handleBox = await columnHandle(page, lastColumnIndex).boundingBox();
    const menuBox = await contextMenu(page).boundingBox();
    const viewport = page.viewportSize();
    if (!wrapperBox || !handleBox || !menuBox || !viewport) {
      throw new Error('Could not resolve wrapper/handle/menu geometry after scroll.');
    }

    const handleCenterX = handleBox.x + handleBox.width / 2;
    const menuCenterX = menuBox.x + menuBox.width / 2;

    expect(Math.abs(menuCenterX - handleCenterX)).toBeLessThan(40);
    expect(menuBox.x).toBeGreaterThanOrEqual(0);
    expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(viewport.width);
    expect(menuBox.y).toBeGreaterThanOrEqual(0);
    expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(viewport.height);
  });
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
