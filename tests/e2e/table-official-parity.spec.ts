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

function tableHandle(page: Page) {
  return page.getByTestId('pmht-table-handle');
}

function rowHandle(page: Page, index: number) {
  return page.getByTestId('pmht-row-handle').nth(index);
}

function columnHandle(page: Page, index: number) {
  return page.getByTestId('pmht-column-handle').nth(index);
}

function addRowButton(page: Page) {
  return page.getByTestId('pmht-extend-row');
}

function addColumnButton(page: Page) {
  return page.getByTestId('pmht-extend-column');
}

function rowSelectionBand(page: Page) {
  return page.getByTestId('pmht-selection-band-row');
}

function columnSelectionBand(page: Page) {
  return page.getByTestId('pmht-selection-band-column');
}

function selectedCells(page: Page) {
  return page.getByTestId('pmht-selected-cell');
}

function cellHandle(page: Page) {
  return page.getByTestId('pmht-cell-handle');
}

function contextMenu(page: Page) {
  return page.getByTestId('pmht-context-menu');
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

async function clickCenter(page: Page, target: Locator) {
  const box = await target.boundingBox();
  if (!box) {
    throw new Error('Could not resolve target bounding box for pointer click.');
  }

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.up();
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

async function openColumnMenu(page: Page, index: number) {
  await clickCenter(page, columnHandle(page, index));
  await expect(columnSelectionBand(page)).toBeVisible();
  if (await contextMenu(page).isHidden()) {
    await clickCenter(page, columnHandle(page, index));
  }
  await expect(contextMenu(page)).toBeVisible();
}

async function clickMenuAction(page: Page, label: string) {
  await clickCenter(page, contextMenuAction(page, label));
}

test.describe('official table parity', () => {
  test('table handle stays table-scoped when selecting the table', async ({ page }) => {
    await gotoDemo(page);
    await firstBodyCell(page).hover();

    await expect(tableHandle(page)).toBeVisible();

    const handleBox = await tableHandle(page).boundingBox();
    const tableBox = await table(page).boundingBox();
    if (!handleBox || !tableBox) {
      throw new Error('Could not resolve table handle geometry.');
    }

    expect(Math.abs(handleBox.x + handleBox.width / 2 - tableBox.x)).toBeLessThan(24);
    expect(Math.abs(handleBox.y + handleBox.height / 2 - tableBox.y)).toBeLessThan(24);

    await clickCenter(page, tableHandle(page));

    await expect(rowSelectionBand(page)).toBeHidden();
    await expect(columnSelectionBand(page)).toBeHidden();
    await expect(selectedCells(page)).toHaveCount(0);

    await clickCenter(page, tableHandle(page));
    await expect(contextMenu(page)).toBeVisible();
    await expect(contextMenu(page)).toHaveAttribute('data-scope', 'table');
  });

  test('column handle selects the whole column and keeps the menu aligned after scroll', async ({ page }) => {
    await page.setViewportSize({ width: 780, height: 900 });
    await gotoDemo(page);

    for (let index = 0; index < 5; index += 1) {
      await firstBodyCell(page).hover();
      await openColumnMenu(page, 0);
      await clickMenuAction(page, 'Add column after');
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

    const lastColumnIndex = await table(page).locator('thead tr').first().locator('th,td').count() - 1;
    const totalRowCount = await table(page).locator('thead tr, tbody tr, tfoot tr').count();
    const lastCell = table(page).locator('tbody tr').first().locator('td,th').last();

    await lastCell.hover();
    await expect(columnHandle(page, lastColumnIndex)).toBeVisible();
    await clickCenter(page, columnHandle(page, lastColumnIndex));

    await expect(columnSelectionBand(page)).toBeVisible();
    await expect(selectedCells(page)).toHaveCount(totalRowCount);

    await clickCenter(page, columnHandle(page, lastColumnIndex));
    await expect(contextMenu(page)).toBeVisible();
    await expect(contextMenu(page)).toHaveAttribute('data-scope', 'column');

    const handleBox = await columnHandle(page, lastColumnIndex).boundingBox();
    const menuBox = await contextMenu(page).boundingBox();
    if (!handleBox || !menuBox) {
      throw new Error('Could not resolve column menu geometry.');
    }

    const handleCenterX = handleBox.x + handleBox.width / 2;
    const menuCenterX = menuBox.x + menuBox.width / 2;
    expect(Math.abs(menuCenterX - handleCenterX)).toBeLessThan(40);
  });

  test('cell menu actions keep the rectangular selection active', async ({ page }) => {
    await gotoDemo(page);

    await dragBetweenCells(page, firstBodyCell(page), secondBodyCell(page));
    await expect(selectedCells(page)).toHaveCount(2);

    await clickCenter(page, cellHandle(page));
    await expect(contextMenu(page)).toBeVisible();
    await expect(contextMenu(page)).toHaveAttribute('data-scope', 'cell');

    await clickMenuAction(page, 'Align center');

    await expect(contextMenu(page)).toBeHidden();
    await expect(selectedCells(page)).toHaveCount(2);
    await expect(table(page).locator('tbody tr').first().locator('td,th').nth(0)).toHaveCSS('text-align', 'center');
    await expect(table(page).locator('tbody tr').first().locator('td,th').nth(1)).toHaveCSS('text-align', 'center');
  });

  test('extend buttons stay anchored to the table edges without creating vertical overflow', async ({ page }) => {
    await gotoDemo(page);
    await firstBodyCell(page).hover();

    await expect(addRowButton(page)).toBeVisible();
    await expect(addColumnButton(page)).toBeVisible();

    const wrapperBox = await tableWrapper(page).boundingBox();
    const tableBox = await table(page).boundingBox();
    const rowButtonBox = await addRowButton(page).boundingBox();
    const columnButtonBox = await addColumnButton(page).boundingBox();
    if (!wrapperBox || !tableBox || !rowButtonBox || !columnButtonBox) {
      throw new Error('Could not resolve extend button geometry.');
    }

    expect(Math.abs(rowButtonBox.y + rowButtonBox.height / 2 - tableBox.y - tableBox.height)).toBeLessThan(24);
    expect(Math.abs(columnButtonBox.x + columnButtonBox.width / 2 - tableBox.x - tableBox.width)).toBeLessThan(24);

    const overflowState = await page.evaluate(() => {
      const wrapper = document.querySelector('[data-testid="pmht-table-wrapper"]') as HTMLElement | null;
      if (!wrapper) {
        return null;
      }

      return {
        clientHeight: wrapper.clientHeight,
        scrollHeight: wrapper.scrollHeight,
      };
    });

    expect(overflowState).not.toBeNull();
    expect((overflowState?.scrollHeight ?? 0) - (overflowState?.clientHeight ?? 0)).toBeLessThanOrEqual(1);
    expect(wrapperBox.height).toBeGreaterThan(tableBox.height);

    const initialRowCount = await table(page).locator('tbody tr').count();
    const initialColumnCount = await table(page).locator('thead tr').first().locator('th,td').count();

    await clickCenter(page, addRowButton(page));
    await expect(table(page).locator('tbody tr')).toHaveCount(initialRowCount + 1);

    await clickCenter(page, addColumnButton(page));
    await expect(table(page).locator('thead tr').first().locator('th,td')).toHaveCount(initialColumnCount + 1);
  });
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
