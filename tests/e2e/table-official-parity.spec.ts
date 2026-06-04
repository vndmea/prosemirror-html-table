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

function firstBodyRow(page: Page) {
  return bodyRows(page).first();
}

function headerCells(page: Page) {
  return table(page).locator('thead tr').first().locator('th,td');
}

function bodyRows(page: Page) {
  return table(page).locator('tbody tr');
}

function bodyRowCell(page: Page, rowIndex: number, columnIndex: number) {
  return bodyRows(page).nth(rowIndex).locator('td,th').nth(columnIndex);
}

function footerRows(page: Page) {
  return table(page).locator('tfoot tr');
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
  await expect(contextMenu(page)).toBeVisible();
}

async function openRowMenu(page: Page, index: number) {
  await clickCenter(page, rowHandle(page, index));
  await expect(rowSelectionBand(page)).toBeVisible();
  await expect(contextMenu(page)).toBeVisible();
}

async function clickMenuAction(page: Page, label: string) {
  await clickCenter(page, contextMenuAction(page, label));
}

async function openCellSubmenu(page: Page, label: string) {
  await clickMenuAction(page, label);
  await expect(contextSubmenu(page)).toBeVisible();
}

async function openTableMenu(page: Page) {
  await firstBodyCell(page).hover();
  await clickCenter(page, tableHandle(page));
  await expect(contextMenu(page)).toBeVisible();
}

async function expandTableForHorizontalScroll(page: Page, columnsToAdd = 5) {
  for (let index = 0; index < columnsToAdd; index += 1) {
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

    await expect(contextMenu(page)).toBeVisible();
    await expect(contextMenu(page)).toHaveAttribute('data-scope', 'table');
    await expect(rowSelectionBand(page)).toBeHidden();
    await expect(columnSelectionBand(page)).toBeHidden();
    await expect(selectedCells(page)).toHaveCount(0);

    const initialCaptionCount = await table(page).locator('caption').count();
    await clickMenuAction(page, initialCaptionCount > 0 ? 'Remove caption' : 'Add caption');

    await expect(contextMenu(page)).toBeHidden();
    await expect(table(page).locator('caption')).toHaveCount(initialCaptionCount === 0 ? 1 : 0);
    await expect(rowSelectionBand(page)).toBeHidden();
    await expect(columnSelectionBand(page)).toBeHidden();
  });

  test('selected table handle stays visible after mouse leave', async ({ page }) => {
    await gotoDemo(page);
    await firstBodyCell(page).hover();

    await clickCenter(page, tableHandle(page));
    await page.locator('.hero').hover();

    await expect(tableHandle(page)).toBeVisible();
    await expect(rowSelectionBand(page)).toBeHidden();
    await expect(columnSelectionBand(page)).toBeHidden();
  });

  test('table menu toggles footer section while keeping table-scoped behavior', async ({ page }) => {
    await gotoDemo(page);
    await firstBodyCell(page).hover();

    await clickCenter(page, tableHandle(page));
    await expect(contextMenu(page)).toBeVisible();
    await expect(contextMenu(page)).toHaveAttribute('data-scope', 'table');

    const initialFootCount = await table(page).locator('tfoot').count();
    await clickMenuAction(page, initialFootCount > 0 ? 'Remove footer section' : 'Add footer section');

    await expect(contextMenu(page)).toBeHidden();
    await expect(table(page).locator('tfoot')).toHaveCount(initialFootCount === 0 ? 1 : 0);
    await expect(rowSelectionBand(page)).toBeHidden();
    await expect(columnSelectionBand(page)).toBeHidden();
  });

  test('table menu toggles colgroup while keeping table-scoped behavior', async ({ page }) => {
    await gotoDemo(page);
    await firstBodyCell(page).hover();

    await clickCenter(page, tableHandle(page));
    await expect(contextMenu(page)).toBeVisible();
    await expect(contextMenu(page)).toHaveAttribute('data-scope', 'table');

    const initialColgroupCount = await table(page).locator('colgroup').count();
    await clickMenuAction(page, initialColgroupCount > 0 ? 'Remove colgroup' : 'Add colgroup');

    await expect(contextMenu(page)).toBeHidden();
    await expect(table(page).locator('colgroup')).toHaveCount(initialColgroupCount === 0 ? 1 : 0);
    await expect(rowSelectionBand(page)).toBeHidden();
    await expect(columnSelectionBand(page)).toBeHidden();
  });

  test('table menu toggles header section while keeping table-scoped behavior', async ({ page }) => {
    await gotoDemo(page);
    await firstBodyCell(page).hover();

    await clickCenter(page, tableHandle(page));
    await expect(contextMenu(page)).toBeVisible();
    await expect(contextMenu(page)).toHaveAttribute('data-scope', 'table');

    const initialHeadCount = await table(page).locator('thead').count();
    await clickMenuAction(page, initialHeadCount > 0 ? 'Remove header section' : 'Add header section');

    await expect(contextMenu(page)).toBeHidden();
    await expect(table(page).locator('thead')).toHaveCount(initialHeadCount === 0 ? 1 : 0);
    await expect(rowSelectionBand(page)).toBeHidden();
    await expect(columnSelectionBand(page)).toBeHidden();
  });

  test('table menu lifecycle keeps table scope stable across inside click, Escape, and outside click', async ({ page }) => {
    await gotoDemo(page);
    await firstBodyCell(page).hover();

    await clickCenter(page, tableHandle(page));
    await expect(contextMenu(page)).toBeVisible();
    await expect(contextMenu(page)).toHaveAttribute('data-scope', 'table');
    await expect(rowSelectionBand(page)).toBeHidden();
    await expect(columnSelectionBand(page)).toBeHidden();

    await contextMenu(page).click({ position: { x: 3, y: 3 } });
    await expect(contextMenu(page)).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(contextMenu(page)).toBeHidden();

    await clickCenter(page, tableHandle(page));
    await expect(contextMenu(page)).toBeVisible();
    await page.locator('.hero').click();
    await expect(contextMenu(page)).toBeHidden();
  });

  test('table delete action removes the table and closes the menu', async ({ page }) => {
    await gotoDemo(page);
    await openTableMenu(page);
    await expect(contextMenu(page)).toHaveAttribute('data-scope', 'table');

    await clickMenuAction(page, 'Delete table');

    await expect(contextMenu(page)).toBeHidden();
    await expect(page.getByTestId('pmht-table')).toHaveCount(0);
    await expect(page.getByTestId('pmht-table-handle')).toHaveCount(0);
  });

  test('after horizontal scroll, table handle stays anchored to the visible table origin', async ({ page }) => {
    await page.setViewportSize({ width: 780, height: 900 });
    await gotoDemo(page);

    await expandTableForHorizontalScroll(page);

    await page.evaluate(() => {
      const wrapper = document.querySelector('[data-testid="pmht-table-wrapper"]') as HTMLElement | null;
      if (wrapper) {
        wrapper.scrollLeft = wrapper.scrollWidth;
      }
    });

    await table(page).locator('tbody tr').first().locator('td,th').last().hover();
    await expect(tableHandle(page)).toBeVisible();

    const handleBox = await tableHandle(page).boundingBox();
    const wrapperBox = await tableWrapper(page).boundingBox();
    const tableBox = await table(page).boundingBox();
    if (!handleBox || !wrapperBox || !tableBox) {
      throw new Error('Could not resolve scrolled table handle geometry.');
    }

    expect(Math.abs(handleBox.x + handleBox.width / 2 - wrapperBox.x)).toBeLessThan(24);
    expect(Math.abs(handleBox.y + handleBox.height / 2 - tableBox.y)).toBeLessThan(24);
  });

  test('horizontal scroll remeasures an already visible table handle without extra hover', async ({ page }) => {
    await page.setViewportSize({ width: 780, height: 900 });
    await gotoDemo(page);

    await firstBodyCell(page).hover();
    await expect(tableHandle(page)).toBeVisible();
    const beforeScrollBox = await tableHandle(page).boundingBox();
    if (!beforeScrollBox) {
      throw new Error('Could not resolve table handle geometry before scroll remeasure.');
    }

    await expandTableForHorizontalScroll(page);
    await page.evaluate(() => {
      const wrapper = document.querySelector('[data-testid="pmht-table-wrapper"]') as HTMLElement | null;
      if (wrapper) {
        wrapper.scrollLeft = wrapper.scrollWidth;
      }
    });

    const wrapperBox = await tableWrapper(page).boundingBox();
    await expect.poll(async () => {
      const box = await tableHandle(page).boundingBox();
      return box ? box.x + box.width / 2 : null;
    }).not.toBeNull();

    const afterScrollBox = await tableHandle(page).boundingBox();
    if (!wrapperBox || !afterScrollBox) {
      throw new Error('Could not resolve table handle geometry after scroll remeasure.');
    }

    expect(afterScrollBox.x + afterScrollBox.width / 2).toBeLessThanOrEqual(
      beforeScrollBox.x + beforeScrollBox.width / 2,
    );
    expect(Math.abs(afterScrollBox.x + afterScrollBox.width / 2 - wrapperBox.x)).toBeLessThan(24);
  });

  test('row handle keeps row scope explicit through selection and menu actions', async ({ page }) => {
    await gotoDemo(page);

    const firstBodyRow = table(page).locator('tbody tr').first();
    const initialBodyRowCount = await table(page).locator('tbody tr').count();
    const rowCellCount = await firstBodyRow.locator('td,th').count();

    await firstBodyCell(page).hover();
    await expect(rowHandle(page, 1)).toBeVisible();

    await clickCenter(page, rowHandle(page, 1));
    await expect(rowSelectionBand(page)).toBeVisible();
    await expect(columnSelectionBand(page)).toBeHidden();
    await expect(selectedCells(page)).toHaveCount(rowCellCount);
    await expect(contextMenu(page)).toBeVisible();
    await expect(contextMenu(page)).toHaveAttribute('data-scope', 'row');

    await clickMenuAction(page, 'Duplicate row');

    await expect(contextMenu(page)).toBeHidden();
    await expect(table(page).locator('tbody tr')).toHaveCount(initialBodyRowCount + 1);
    await expect(columnSelectionBand(page)).toBeHidden();
  });

  test('row handle stays aligned to the hovered body row and keeps sibling handles hidden', async ({ page }) => {
    await gotoDemo(page);

    const hoveredRow = bodyRows(page).nth(1);
    await bodyRowCell(page, 1, 0).hover();

    await expect(rowHandle(page, 2)).toBeVisible();
    await expect(rowHandle(page, 0)).toBeHidden();
    await expect(rowHandle(page, 1)).toBeHidden();

    const handleBox = await rowHandle(page, 2).boundingBox();
    const rowBox = await hoveredRow.boundingBox();
    const tableBox = await table(page).boundingBox();
    if (!handleBox || !rowBox || !tableBox) {
      throw new Error('Could not resolve row handle geometry.');
    }

    expect(Math.abs(handleBox.y + handleBox.height / 2 - rowBox.y - rowBox.height / 2)).toBeLessThan(20);
    expect(Math.abs(handleBox.x + handleBox.width / 2 - tableBox.x)).toBeLessThan(24);
  });

  test('selected row handle stays visible after mouse leave', async ({ page }) => {
    await gotoDemo(page);
    await bodyRowCell(page, 1, 0).hover();

    await clickCenter(page, rowHandle(page, 2));
    await expect(rowSelectionBand(page)).toBeVisible();
    await expect(contextMenu(page)).toBeVisible();

    await page.locator('.hero').hover();
    await expect(rowHandle(page, 2)).toBeVisible();
    await expect(rowHandle(page, 0)).toBeHidden();
    await expect(rowHandle(page, 1)).toBeHidden();
  });

  test('hovered row handle takes priority over an older selected row handle', async ({ page }) => {
    await gotoDemo(page);
    await bodyRowCell(page, 1, 0).hover();

    await clickCenter(page, rowHandle(page, 2));
    await expect(rowSelectionBand(page)).toBeVisible();
    await expect(rowHandle(page, 2)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(contextMenu(page)).toBeHidden();

    await firstBodyCell(page).hover();
    await expect(rowHandle(page, 1)).toBeVisible();
    await expect(rowHandle(page, 2)).toBeHidden();
  });

  test('row add-after action targets the captured row snapshot', async ({ page }) => {
    await gotoDemo(page);
    await firstBodyCell(page).hover();

    const initialBodyRowCount = await bodyRows(page).count();
    await openRowMenu(page, 1);
    await expect(contextMenu(page)).toHaveAttribute('data-scope', 'row');

    await clickMenuAction(page, 'Add row after');

    await expect(contextMenu(page)).toBeHidden();
    await expect(bodyRows(page)).toHaveCount(initialBodyRowCount + 1);
    await expect(bodyRowCell(page, 0, 0)).toHaveText('Open panel');
    await expect(bodyRowCell(page, 1, 0)).toHaveText('');
    await expect(bodyRowCell(page, 2, 0)).toHaveText('Inspect connector');
  });

  test('row menu actions target the captured row snapshot', async ({ page }) => {
    await gotoDemo(page);
    await firstBodyCell(page).hover();

    await openRowMenu(page, 1);
    await expect(contextMenu(page)).toHaveAttribute('data-scope', 'row');

    await clickMenuAction(page, 'Move row down');

    await expect(contextMenu(page)).toBeHidden();
    await expect(bodyRowCell(page, 0, 0)).toHaveText('Inspect connector');
    await expect(bodyRowCell(page, 1, 0)).toHaveText('Open panel');
    await expect(columnSelectionBand(page)).toBeHidden();
  });

  test('row move-up action targets the captured row snapshot', async ({ page }) => {
    await gotoDemo(page);
    await bodyRowCell(page, 1, 0).hover();

    await openRowMenu(page, 2);
    await expect(contextMenu(page)).toHaveAttribute('data-scope', 'row');

    await clickMenuAction(page, 'Move row up');

    await expect(contextMenu(page)).toBeHidden();
    await expect(bodyRowCell(page, 0, 0)).toHaveText('Inspect connector');
    await expect(bodyRowCell(page, 1, 0)).toHaveText('Open panel');
  });

  test('row delete action targets the captured row snapshot', async ({ page }) => {
    await gotoDemo(page);
    await firstBodyCell(page).hover();

    const initialBodyRowCount = await bodyRows(page).count();
    await openRowMenu(page, 1);
    await expect(contextMenu(page)).toHaveAttribute('data-scope', 'row');

    await clickMenuAction(page, 'Delete row');

    await expect(contextMenu(page)).toBeHidden();
    await expect(bodyRows(page)).toHaveCount(initialBodyRowCount - 1);
    await expect(bodyRowCell(page, 0, 0)).toHaveText('Inspect connector');
    await expect(columnSelectionBand(page)).toBeHidden();
  });

  test('row move-to-footer action targets the captured row snapshot', async ({ page }) => {
    await gotoDemo(page);
    await firstBodyCell(page).hover();

    const initialBodyRowCount = await bodyRows(page).count();
    const initialFootRowCount = await footerRows(page).count();
    await openRowMenu(page, 1);
    await expect(contextMenu(page)).toHaveAttribute('data-scope', 'row');

    await clickMenuAction(page, 'Move row to footer');

    await expect(contextMenu(page)).toBeHidden();
    await expect(bodyRows(page)).toHaveCount(initialBodyRowCount - 1);
    await expect(footerRows(page)).toHaveCount(initialFootRowCount + 1);
    await expect(bodyRowCell(page, 0, 0)).toHaveText('Inspect connector');
    await expect(table(page).locator('tfoot').locator('td,th').filter({ hasText: /^Open panel$/ })).toHaveCount(1);
  });

  test('after horizontal scroll, row handle stays aligned to the hovered visible row', async ({ page }) => {
    await page.setViewportSize({ width: 780, height: 900 });
    await gotoDemo(page);

    await expandTableForHorizontalScroll(page);

    await page.evaluate(() => {
      const wrapper = document.querySelector('[data-testid="pmht-table-wrapper"]') as HTMLElement | null;
      if (wrapper) {
        wrapper.scrollLeft = wrapper.scrollWidth;
      }
    });

    const hoveredCell = table(page).locator('tbody tr').nth(1).locator('td,th').last();
    const hoveredRow = bodyRows(page).nth(1);
    await hoveredCell.hover();

    await expect(rowHandle(page, 2)).toBeVisible();

    const handleBox = await rowHandle(page, 2).boundingBox();
    const rowBox = await hoveredRow.boundingBox();
    const wrapperBox = await tableWrapper(page).boundingBox();
    if (!handleBox || !rowBox || !wrapperBox) {
      throw new Error('Could not resolve scrolled row handle geometry.');
    }

    expect(Math.abs(handleBox.x + handleBox.width / 2 - wrapperBox.x)).toBeLessThan(24);
    expect(Math.abs(handleBox.y + handleBox.height / 2 - rowBox.y - rowBox.height / 2)).toBeLessThan(20);
  });

  test('row menu lifecycle keeps row scope stable across inside click, Escape, and outside click', async ({ page }) => {
    await gotoDemo(page);
    await firstBodyCell(page).hover();

    await openRowMenu(page, 1);
    await expect(contextMenu(page)).toHaveAttribute('data-scope', 'row');
    await expect(rowSelectionBand(page)).toBeVisible();
    await expect(columnSelectionBand(page)).toBeHidden();

    await contextMenu(page).click({ position: { x: 3, y: 3 } });
    await expect(contextMenu(page)).toBeVisible();
    await expect(rowSelectionBand(page)).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(contextMenu(page)).toBeHidden();
    await expect(rowSelectionBand(page)).toBeVisible();

    await openRowMenu(page, 1);
    await expect(contextMenu(page)).toBeVisible();
    await page.locator('.hero').click();
    await expect(contextMenu(page)).toBeHidden();
  });

  test('row menu exposes flyout formatting submenus and applies row color', async ({ page }) => {
    await gotoDemo(page);
    await firstBodyCell(page).hover();

    await openRowMenu(page, 1);
    await clickMenuAction(page, 'Color');
    await expect(contextSubmenu(page)).toBeVisible();
    await expect(page.getByText(/^Back to /)).toHaveCount(0);
    await clickMenuAction(page, 'Background blue');

    await expect(contextMenu(page)).toBeHidden();
    await expect(bodyRowCell(page, 0, 0)).toHaveCSS('background-color', 'rgb(219, 234, 254)');
    await expect(bodyRowCell(page, 0, 1)).toHaveCSS('background-color', 'rgb(219, 234, 254)');
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

  test('column handle stays aligned to the hovered column and keeps sibling handles hidden', async ({ page }) => {
    await gotoDemo(page);
    await secondBodyCell(page).hover();

    await expect(columnHandle(page, 1)).toBeVisible();
    await expect(columnHandle(page, 0)).toBeHidden();

    const handleBox = await columnHandle(page, 1).boundingBox();
    const cellBox = await secondBodyCell(page).boundingBox();
    const tableBox = await table(page).boundingBox();
    if (!handleBox || !cellBox || !tableBox) {
      throw new Error('Could not resolve column handle geometry.');
    }

    expect(Math.abs(handleBox.x + handleBox.width / 2 - cellBox.x - cellBox.width / 2)).toBeLessThan(20);
    expect(Math.abs(handleBox.y + handleBox.height / 2 - tableBox.y)).toBeLessThan(24);
  });

  test('selected column handle stays visible after mouse leave', async ({ page }) => {
    await gotoDemo(page);
    await secondBodyCell(page).hover();

    await clickCenter(page, columnHandle(page, 1));
    await expect(columnSelectionBand(page)).toBeVisible();
    await expect(contextMenu(page)).toBeVisible();

    await page.locator('.hero').hover();
    await expect(columnHandle(page, 1)).toBeVisible();
    await expect(columnHandle(page, 0)).toBeHidden();
  });

  test('hovered column handle takes priority over an older selected column handle', async ({ page }) => {
    await gotoDemo(page);
    await secondBodyCell(page).hover();

    await clickCenter(page, columnHandle(page, 1));
    await expect(columnSelectionBand(page)).toBeVisible();
    await expect(columnHandle(page, 1)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(contextMenu(page)).toBeHidden();

    await firstBodyCell(page).hover();
    await expect(columnHandle(page, 0)).toBeVisible();
    await expect(columnHandle(page, 1)).toBeHidden();
  });

  test('column selection uses hidden native selection painting', async ({ page }) => {
    await gotoDemo(page);
    await secondBodyCell(page).hover();

    await clickCenter(page, columnHandle(page, 1));

    await expect(columnSelectionBand(page)).toBeVisible();
    await expect(page.locator('.ProseMirror').first()).toHaveClass(/ProseMirror-hideselection/);
  });

  test('column add-after action targets the captured column snapshot', async ({ page }) => {
    await gotoDemo(page);
    await firstBodyCell(page).hover();

    const initialColumnCount = await headerCells(page).count();
    await openColumnMenu(page, 0);
    await expect(contextMenu(page)).toHaveAttribute('data-scope', 'column');

    await clickMenuAction(page, 'Add column after');

    await expect(contextMenu(page)).toBeHidden();
    await expect(headerCells(page)).toHaveCount(initialColumnCount + 1);
    await expect(headerCells(page).nth(0)).toHaveText('Task');
    await expect(headerCells(page).nth(2)).toHaveText('Status');
    await expect(bodyRowCell(page, 0, 0)).toHaveText('Open panel');
    await expect(bodyRowCell(page, 0, 2)).toHaveText('Done');
  });

  test('column menu actions target the captured column snapshot', async ({ page }) => {
    await gotoDemo(page);
    await firstBodyCell(page).hover();

    await openColumnMenu(page, 0);
    await expect(contextMenu(page)).toHaveAttribute('data-scope', 'column');

    await clickMenuAction(page, 'Sort column A-Z');

    await expect(contextMenu(page)).toBeHidden();
    await expect(bodyRowCell(page, 0, 0)).toHaveText('Inspect connector');
    await expect(bodyRowCell(page, 1, 0)).toHaveText('Open panel');
    await expect(rowSelectionBand(page)).toBeHidden();
  });

  test('column reorder action targets the captured column snapshot', async ({ page }) => {
    await gotoDemo(page);
    await firstBodyCell(page).hover();

    await openColumnMenu(page, 0);
    await expect(contextMenu(page)).toHaveAttribute('data-scope', 'column');

    await clickMenuAction(page, 'Move column right');

    await expect(contextMenu(page)).toBeHidden();
    await expect(table(page).locator('thead tr').first().locator('th,td').nth(0)).toHaveText('Status');
    await expect(table(page).locator('thead tr').first().locator('th,td').nth(1)).toHaveText('Task');
    await expect(bodyRowCell(page, 0, 0)).toHaveText('Done');
    await expect(bodyRowCell(page, 0, 1)).toHaveText('Open panel');
    await expect(rowSelectionBand(page)).toBeHidden();
  });

  test('column duplicate action targets the captured column snapshot', async ({ page }) => {
    await gotoDemo(page);
    await firstBodyCell(page).hover();

    const initialColumnCount = await table(page).locator('thead tr').first().locator('th,td').count();
    await openColumnMenu(page, 0);
    await expect(contextMenu(page)).toHaveAttribute('data-scope', 'column');

    await clickMenuAction(page, 'Duplicate column');

    await expect(contextMenu(page)).toBeHidden();
    await expect(table(page).locator('thead tr').first().locator('th,td')).toHaveCount(initialColumnCount + 1);
    await expect(table(page).locator('thead tr').first().locator('th,td').nth(0)).toHaveText('Task');
    await expect(table(page).locator('thead tr').first().locator('th,td').nth(1)).toHaveText('Task');
    await expect(bodyRowCell(page, 0, 0)).toHaveText('Open panel');
    await expect(bodyRowCell(page, 0, 1)).toHaveText('Open panel');
  });

  test('column delete action targets the captured column snapshot', async ({ page }) => {
    await gotoDemo(page);
    await firstBodyCell(page).hover();

    const initialColumnCount = await table(page).locator('thead tr').first().locator('th,td').count();
    await openColumnMenu(page, 0);
    await expect(contextMenu(page)).toHaveAttribute('data-scope', 'column');

    await clickMenuAction(page, 'Delete column');

    await expect(contextMenu(page)).toBeHidden();
    await expect(table(page).locator('thead tr').first().locator('th,td')).toHaveCount(initialColumnCount - 1);
    await expect(table(page).locator('thead tr').first().locator('th,td').nth(0)).toHaveText('Status');
    await expect(bodyRowCell(page, 0, 0)).toHaveText('Done');
  });

  test('column move-left action targets the captured column snapshot', async ({ page }) => {
    await gotoDemo(page);
    await secondBodyCell(page).hover();

    await openColumnMenu(page, 1);
    await expect(contextMenu(page)).toHaveAttribute('data-scope', 'column');

    await clickMenuAction(page, 'Move column left');

    await expect(contextMenu(page)).toBeHidden();
    await expect(headerCells(page).nth(0)).toHaveText('Status');
    await expect(headerCells(page).nth(1)).toHaveText('Task');
    await expect(bodyRowCell(page, 0, 0)).toHaveText('Done');
    await expect(bodyRowCell(page, 0, 1)).toHaveText('Open panel');
  });

  test('column sort-descending action targets the captured column snapshot', async ({ page }) => {
    await gotoDemo(page);
    await secondBodyCell(page).hover();

    await openColumnMenu(page, 1);
    await expect(contextMenu(page)).toHaveAttribute('data-scope', 'column');

    await clickMenuAction(page, 'Sort column Z-A');

    await expect(contextMenu(page)).toBeHidden();
    await expect(bodyRowCell(page, 0, 0)).toHaveText('Inspect connector');
    await expect(bodyRowCell(page, 1, 0)).toHaveText('Open panel');
  });

  test('column menu lifecycle keeps column scope stable across inside click, Escape, and outside click', async ({ page }) => {
    await gotoDemo(page);
    await firstBodyCell(page).hover();

    await openColumnMenu(page, 0);
    await expect(contextMenu(page)).toHaveAttribute('data-scope', 'column');
    await expect(columnSelectionBand(page)).toBeVisible();
    await expect(rowSelectionBand(page)).toBeHidden();

    await contextMenu(page).click({ position: { x: 3, y: 3 } });
    await expect(contextMenu(page)).toBeVisible();
    await expect(columnSelectionBand(page)).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(contextMenu(page)).toBeHidden();
    await expect(columnSelectionBand(page)).toBeVisible();

    await openColumnMenu(page, 0);
    await expect(contextMenu(page)).toBeVisible();
    await page.locator('.hero').click();
    await expect(contextMenu(page)).toBeHidden();
  });

  test('column menu exposes flyout formatting submenus and applies column alignment', async ({ page }) => {
    await gotoDemo(page);
    await firstBodyCell(page).hover();

    await openColumnMenu(page, 0);
    await clickMenuAction(page, 'Alignment');
    await expect(contextSubmenu(page)).toBeVisible();
    await expect(page.getByText(/^Back to /)).toHaveCount(0);
    await clickMenuAction(page, 'Align center');

    await expect(contextMenu(page)).toBeHidden();
    await expect(bodyRowCell(page, 0, 0)).toHaveCSS('text-align', 'center');
    await expect(bodyRowCell(page, 1, 0)).toHaveCSS('text-align', 'center');
  });

  test('cell menu actions keep the rectangular selection active', async ({ page }) => {
    await gotoDemo(page);

    await dragBetweenCells(page, firstBodyCell(page), secondBodyCell(page));
    await expect(selectedCells(page)).toHaveCount(2);

    await clickCenter(page, cellHandle(page));
    await expect(contextMenu(page)).toBeVisible();
    await expect(contextMenu(page)).toHaveAttribute('data-scope', 'cell');

    await openCellSubmenu(page, 'Alignment');
    await clickMenuAction(page, 'Align center');

    await expect(contextMenu(page)).toBeHidden();
    await expect(selectedCells(page)).toHaveCount(2);
    await expect(table(page).locator('tbody tr').first().locator('td,th').nth(0)).toHaveCSS('text-align', 'center');
    await expect(table(page).locator('tbody tr').first().locator('td,th').nth(1)).toHaveCSS('text-align', 'center');
  });

  test('single-cell selection stays cell-scoped without triggering axis selection', async ({ page }) => {
    await gotoDemo(page);

    await clickCenter(page, firstBodyCell(page));

    await expect(selectedCells(page)).toHaveCount(1);
    await expect(rowSelectionBand(page)).toBeHidden();
    await expect(columnSelectionBand(page)).toBeHidden();
    await expect(cellHandle(page)).toBeVisible();

    await clickCenter(page, cellHandle(page));
    await expect(contextMenu(page)).toBeVisible();
    await expect(contextMenu(page)).toHaveAttribute('data-scope', 'cell');
  });

  test('rectangular drag selection stays bounded to the dragged body range', async ({ page }) => {
    await gotoDemo(page);

    const bottomRightCell = bodyRowCell(page, 1, 1);
    await dragBetweenCells(page, firstBodyCell(page), bottomRightCell);

    await expect(selectedCells(page)).toHaveCount(4);
    await expect(rowSelectionBand(page)).toBeHidden();
    await expect(columnSelectionBand(page)).toBeHidden();
    await expect(cellHandle(page)).toBeVisible();

    const handleBox = await cellHandle(page).boundingBox();
    const selectionStartBox = await firstBodyCell(page).boundingBox();
    const selectionEndBox = await bottomRightCell.boundingBox();
    if (!handleBox || !selectionStartBox || !selectionEndBox) {
      throw new Error('Could not resolve rectangular cell selection geometry.');
    }

    const handleCenterX = handleBox.x + handleBox.width / 2;
    const handleCenterY = handleBox.y + handleBox.height / 2;
    const selectionRight = selectionEndBox.x + selectionEndBox.width;
    const selectionTop = selectionStartBox.y;
    const selectionBottom = selectionEndBox.y + selectionEndBox.height;

    expect(Math.abs(handleCenterX - selectionRight)).toBeLessThan(24);
    expect(handleCenterY).toBeGreaterThanOrEqual(selectionTop - 8);
    expect(handleCenterY).toBeLessThanOrEqual(selectionBottom + 8);
  });

  test('cell menu can toggle a body cell into a header cell while keeping cell scope', async ({ page }) => {
    await gotoDemo(page);

    await clickCenter(page, firstBodyCell(page));
    await expect(selectedCells(page)).toHaveCount(1);

    await clickCenter(page, cellHandle(page));
    await expect(contextMenu(page)).toBeVisible();
    await expect(contextMenu(page)).toHaveAttribute('data-scope', 'cell');

    await openCellSubmenu(page, 'Structure');
    await clickMenuAction(page, 'Set header cell');

    await expect(contextMenu(page)).toBeHidden();
    await expect(firstBodyRow(page).locator('th').first()).toHaveText('Open panel');
    await expect(selectedCells(page)).toHaveCount(1);
  });

  test('cell menu applies and clears background while keeping the selected range active', async ({ page }) => {
    await gotoDemo(page);

    await dragBetweenCells(page, firstBodyCell(page), secondBodyCell(page));
    await expect(selectedCells(page)).toHaveCount(2);

    await clickCenter(page, cellHandle(page));
    await expect(contextMenu(page)).toBeVisible();
    await openCellSubmenu(page, 'Color');
    await clickMenuAction(page, 'Background blue');

    await expect(contextMenu(page)).toBeHidden();
    await expect(selectedCells(page)).toHaveCount(2);
    await expect(firstBodyRow(page).locator('td,th').nth(0)).toHaveCSS('background-color', 'rgb(219, 234, 254)');
    await expect(firstBodyRow(page).locator('td,th').nth(1)).toHaveCSS('background-color', 'rgb(219, 234, 254)');

    await clickCenter(page, cellHandle(page));
    await expect(contextMenu(page)).toBeVisible();
    await openCellSubmenu(page, 'Color');
    await clickMenuAction(page, 'Clear color');

    await expect(contextMenu(page)).toBeHidden();
    await expect(selectedCells(page)).toHaveCount(2);
    await expect(firstBodyRow(page).locator('td,th').nth(0)).not.toHaveCSS('background-color', 'rgb(219, 234, 254)');
    await expect(firstBodyRow(page).locator('td,th').nth(1)).not.toHaveCSS('background-color', 'rgb(219, 234, 254)');
  });

  test('cell menu applies horizontal alignment variants while keeping the selected range active', async ({ page }) => {
    await gotoDemo(page);

    await dragBetweenCells(page, firstBodyCell(page), secondBodyCell(page));
    await expect(selectedCells(page)).toHaveCount(2);

    await clickCenter(page, cellHandle(page));
    await expect(contextMenu(page)).toBeVisible();
    await openCellSubmenu(page, 'Alignment');
    await clickMenuAction(page, 'Align right');

    await expect(contextMenu(page)).toBeHidden();
    await expect(selectedCells(page)).toHaveCount(2);
    await expect(firstBodyRow(page).locator('td,th').nth(0)).toHaveCSS('text-align', 'right');
    await expect(firstBodyRow(page).locator('td,th').nth(1)).toHaveCSS('text-align', 'right');

    await clickCenter(page, cellHandle(page));
    await expect(contextMenu(page)).toBeVisible();
    await openCellSubmenu(page, 'Alignment');
    await clickMenuAction(page, 'Align left');

    await expect(contextMenu(page)).toBeHidden();
    await expect(selectedCells(page)).toHaveCount(2);
    await expect(firstBodyRow(page).locator('td,th').nth(0)).toHaveCSS('text-align', 'left');
    await expect(firstBodyRow(page).locator('td,th').nth(1)).toHaveCSS('text-align', 'left');
  });

  test('cell menu applies vertical alignment while keeping the selected range active', async ({ page }) => {
    await gotoDemo(page);

    await dragBetweenCells(page, firstBodyCell(page), secondBodyCell(page));
    await expect(selectedCells(page)).toHaveCount(2);

    await clickCenter(page, cellHandle(page));
    await expect(contextMenu(page)).toBeVisible();
    await openCellSubmenu(page, 'Alignment');
    await clickMenuAction(page, 'Align middle');

    await expect(contextMenu(page)).toBeHidden();
    await expect(selectedCells(page)).toHaveCount(2);
    await expect(firstBodyRow(page).locator('td,th').nth(0)).toHaveCSS('vertical-align', 'middle');
    await expect(firstBodyRow(page).locator('td,th').nth(1)).toHaveCSS('vertical-align', 'middle');
  });

  test('cell menu applies vertical alignment edge variants while keeping the selected range active', async ({ page }) => {
    await gotoDemo(page);

    await dragBetweenCells(page, firstBodyCell(page), secondBodyCell(page));
    await expect(selectedCells(page)).toHaveCount(2);

    await clickCenter(page, cellHandle(page));
    await expect(contextMenu(page)).toBeVisible();
    await openCellSubmenu(page, 'Alignment');
    await clickMenuAction(page, 'Align bottom');

    await expect(contextMenu(page)).toBeHidden();
    await expect(selectedCells(page)).toHaveCount(2);
    await expect(firstBodyRow(page).locator('td,th').nth(0)).toHaveCSS('vertical-align', 'bottom');
    await expect(firstBodyRow(page).locator('td,th').nth(1)).toHaveCSS('vertical-align', 'bottom');

    await clickCenter(page, cellHandle(page));
    await expect(contextMenu(page)).toBeVisible();
    await openCellSubmenu(page, 'Alignment');
    await clickMenuAction(page, 'Align top');

    await expect(contextMenu(page)).toBeHidden();
    await expect(selectedCells(page)).toHaveCount(2);
    await expect(firstBodyRow(page).locator('td,th').nth(0)).toHaveCSS('vertical-align', 'top');
    await expect(firstBodyRow(page).locator('td,th').nth(1)).toHaveCSS('vertical-align', 'top');
  });

  test('cell menu clears selected cell contents without removing structure', async ({ page }) => {
    await gotoDemo(page);

    const initialCellCount = await firstBodyRow(page).locator('td,th').count();
    await dragBetweenCells(page, firstBodyCell(page), secondBodyCell(page));
    await expect(selectedCells(page)).toHaveCount(2);

    await clickCenter(page, cellHandle(page));
    await expect(contextMenu(page)).toBeVisible();
    await clickMenuAction(page, 'Clear contents');

    await expect(contextMenu(page)).toBeHidden();
    await expect(firstBodyRow(page).locator('td,th')).toHaveCount(initialCellCount);
    await expect(selectedCells(page)).toHaveCount(2);
    await expect(firstBodyRow(page).locator('td,th').nth(0)).toHaveText('');
    await expect(firstBodyRow(page).locator('td,th').nth(1)).toHaveText('');
  });

  test('cell merge-or-split action keeps selection focus inside the split range', async ({ page }) => {
    await gotoDemo(page);

    const initialCellCount = await firstBodyRow(page).locator('td,th').count();
    await dragBetweenCells(page, firstBodyCell(page), secondBodyCell(page));
    await expect(selectedCells(page)).toHaveCount(2);

    await clickCenter(page, cellHandle(page));
    await expect(contextMenu(page)).toBeVisible();
    await expect(contextMenu(page)).toHaveAttribute('data-scope', 'cell');

    await openCellSubmenu(page, 'Structure');
    await clickMenuAction(page, 'Merge or split cells');

    await expect(contextMenu(page)).toBeHidden();
    await expect(firstBodyRow(page).locator('td,th')).toHaveCount(initialCellCount - 1);
    await expect(firstBodyRow(page).locator('[colspan="2"]')).toHaveCount(1);
    await expect(selectedCells(page)).toHaveCount(1);

    await clickCenter(page, cellHandle(page));
    await expect(contextMenu(page)).toBeVisible();
    await openCellSubmenu(page, 'Structure');
    await clickMenuAction(page, 'Merge or split cells');

    await expect(contextMenu(page)).toBeHidden();
    await expect(firstBodyRow(page).locator('td,th')).toHaveCount(initialCellCount);
    await expect(selectedCells(page)).toHaveCount(1);
    await expect(cellHandle(page)).toBeVisible();
    await expect(firstBodyRow(page).locator('td,th').nth(0)).toContainText('Open panel');
  });

  test('cell menu lifecycle keeps selection stable across inside click, Escape, and outside click', async ({ page }) => {
    await gotoDemo(page);

    await dragBetweenCells(page, firstBodyCell(page), secondBodyCell(page));
    await expect(selectedCells(page)).toHaveCount(2);

    await clickCenter(page, cellHandle(page));
    await expect(contextMenu(page)).toBeVisible();
    await expect(contextMenu(page)).toHaveAttribute('data-scope', 'cell');

    await contextMenu(page).click({ position: { x: 3, y: 3 } });
    await expect(contextMenu(page)).toBeVisible();
    await expect(selectedCells(page)).toHaveCount(2);

    await page.keyboard.press('Escape');
    await expect(contextMenu(page)).toBeHidden();
    await expect(selectedCells(page)).toHaveCount(2);

    await clickCenter(page, cellHandle(page));
    await expect(contextMenu(page)).toBeVisible();
    await page.locator('.hero').click();
    await expect(contextMenu(page)).toBeHidden();
    await expect(selectedCells(page)).toHaveCount(2);
  });

  test('resize updates widths without opening menus or leaving axis selection behind', async ({ page }) => {
    await gotoDemo(page);
    await firstBodyCell(page).hover();

    const resizeHandle = page.getByTestId('pmht-resize-handle').first();
    await expect(resizeHandle).toBeVisible();

    const beforeWidth = await table(page).locator('col').first().getAttribute('width');
    const beforeHandleBox = await columnHandle(page, 0).boundingBox();
    const resizeBox = await resizeHandle.boundingBox();
    if (!beforeHandleBox || !resizeBox) {
      throw new Error('Could not resolve resize geometry.');
    }

    await page.mouse.move(resizeBox.x + resizeBox.width / 2, resizeBox.y + resizeBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(resizeBox.x + resizeBox.width / 2 + 48, resizeBox.y + resizeBox.height / 2, { steps: 8 });
    await page.mouse.up();

    const afterWidth = await table(page).locator('col').first().getAttribute('width');
    await firstBodyCell(page).hover();
    const afterHandleBox = await columnHandle(page, 0).boundingBox();
    if (!afterHandleBox) {
      throw new Error('Could not resolve column handle geometry after resize.');
    }

    expect(afterWidth).not.toBe(beforeWidth);
    expect(afterHandleBox.x + afterHandleBox.width / 2).toBeGreaterThan(beforeHandleBox.x + beforeHandleBox.width / 2);
    await expect(contextMenu(page)).toBeHidden();
    await expect(rowSelectionBand(page)).toBeHidden();
    await expect(columnSelectionBand(page)).toBeHidden();
  });

  test('resize handle stays on the column boundary and committed widths stay aligned', async ({ page }) => {
    await gotoDemo(page);
    await firstBodyCell(page).hover();

    const resizeHandle = page.getByTestId('pmht-resize-handle').first();
    await expect(resizeHandle).toBeVisible();

    const beforeCellBox = await headerCells(page).nth(0).boundingBox();
    const beforeResizeBox = await resizeHandle.boundingBox();
    if (!beforeCellBox || !beforeResizeBox) {
      throw new Error('Could not resolve initial resize geometry.');
    }

    const beforeBoundary = beforeCellBox.x + beforeCellBox.width;
    const beforeHandleCenter = beforeResizeBox.x + beforeResizeBox.width / 2;
    expect(Math.abs(beforeHandleCenter - beforeBoundary)).toBeLessThan(12);

    await page.mouse.move(beforeHandleCenter, beforeResizeBox.y + beforeResizeBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(beforeHandleCenter + 48, beforeResizeBox.y + beforeResizeBox.height / 2, { steps: 8 });
    await page.mouse.up();

    await firstBodyCell(page).hover();

    const afterCellBox = await headerCells(page).nth(0).boundingBox();
    const afterResizeBox = await resizeHandle.boundingBox();
    const committedWidth = await table(page).locator('col').first().getAttribute('width');
    if (!afterCellBox || !afterResizeBox || !committedWidth) {
      throw new Error('Could not resolve committed resize geometry.');
    }

    const afterBoundary = afterCellBox.x + afterCellBox.width;
    const afterHandleCenter = afterResizeBox.x + afterResizeBox.width / 2;
    expect(Math.abs(afterHandleCenter - afterBoundary)).toBeLessThan(12);
    expect(Math.abs(Number(committedWidth) - afterCellBox.width)).toBeLessThanOrEqual(4);
  });

  test('after horizontal scroll, cell handle stays aligned to the visible selected cell', async ({ page }) => {
    await page.setViewportSize({ width: 780, height: 900 });
    await gotoDemo(page);

    await expandTableForHorizontalScroll(page);

    await page.evaluate(() => {
      const wrapper = document.querySelector('[data-testid="pmht-table-wrapper"]') as HTMLElement | null;
      if (wrapper) {
        wrapper.scrollLeft = wrapper.scrollWidth;
      }
    });

    const bodyCellLocator = table(page).locator('tbody tr').first().locator('td,th');
    const totalColumns = await bodyCellLocator.count();
    const lastCell = bodyCellLocator.nth(totalColumns - 1);

    await clickCenter(page, lastCell);
    await expect(selectedCells(page)).toHaveCount(1);
    await expect(cellHandle(page)).toBeVisible();

    const handleBox = await cellHandle(page).boundingBox();
    const lastBox = await lastCell.boundingBox();
    if (!handleBox || !lastBox) {
      throw new Error('Could not resolve selected cell handle geometry after scroll.');
    }

    const selectionTop = lastBox.y;
    const selectionBottom = lastBox.y + lastBox.height;
    const selectionRight = lastBox.x + lastBox.width;
    const handleCenterY = handleBox.y + handleBox.height / 2;
    const handleCenterX = handleBox.x + handleBox.width / 2;

    expect(Math.abs(handleCenterX - selectionRight)).toBeLessThan(24);
    expect(handleCenterY).toBeGreaterThanOrEqual(selectionTop - 8);
    expect(handleCenterY).toBeLessThanOrEqual(selectionBottom + 8);
  });

  test('horizontal scroll remeasures an existing cell selection handle without reselection', async ({ page }) => {
    await page.setViewportSize({ width: 780, height: 900 });
    await gotoDemo(page);

    await expandTableForHorizontalScroll(page);

    await page.evaluate(() => {
      const wrapper = document.querySelector('[data-testid="pmht-table-wrapper"]') as HTMLElement | null;
      if (wrapper) {
        wrapper.scrollLeft = wrapper.scrollWidth;
      }
    });

    const bodyCellLocator = table(page).locator('tbody tr').first().locator('td,th');
    const totalColumns = await bodyCellLocator.count();
    const selectedCell = bodyCellLocator.nth(totalColumns - 1);

    await clickCenter(page, selectedCell);
    await expect(cellHandle(page)).toBeVisible();

    const beforeScrollBox = await cellHandle(page).boundingBox();
    if (!beforeScrollBox) {
      throw new Error('Could not resolve cell handle geometry before secondary scroll.');
    }

    await page.evaluate(() => {
      const wrapper = document.querySelector('[data-testid="pmht-table-wrapper"]') as HTMLElement | null;
      if (wrapper) {
        wrapper.scrollLeft = Math.max(0, wrapper.scrollLeft - 120);
      }
    });

    const wrapperBox = await tableWrapper(page).boundingBox();
    const afterScrollBox = await cellHandle(page).boundingBox();
    if (!wrapperBox || !afterScrollBox) {
      throw new Error('Could not resolve cell handle geometry after secondary scroll.');
    }

    expect(afterScrollBox.x + afterScrollBox.width / 2).toBeGreaterThan(beforeScrollBox.x + beforeScrollBox.width / 2);
    expect(Math.abs(afterScrollBox.x + afterScrollBox.width / 2 - (wrapperBox.x + wrapperBox.width))).toBeLessThan(24);
  });

  test('after horizontal scroll, column selection band stays aligned to the visible selected column', async ({ page }) => {
    await page.setViewportSize({ width: 780, height: 900 });
    await gotoDemo(page);

    await expandTableForHorizontalScroll(page);

    await page.evaluate(() => {
      const wrapper = document.querySelector('[data-testid="pmht-table-wrapper"]') as HTMLElement | null;
      if (wrapper) {
        wrapper.scrollLeft = wrapper.scrollWidth;
      }
    });

    const bodyCellLocator = table(page).locator('tbody tr').first().locator('td,th');
    const totalColumns = await bodyCellLocator.count();
    const lastColumnIndex = totalColumns - 1;
    const lastCell = bodyCellLocator.nth(lastColumnIndex);

    await lastCell.hover();
    await clickCenter(page, columnHandle(page, lastColumnIndex));
    await expect(columnSelectionBand(page)).toBeVisible();

    const bandBox = await columnSelectionBand(page).boundingBox();
    const cellBox = await lastCell.boundingBox();
    const tableBox = await table(page).boundingBox();
    if (!bandBox || !cellBox || !tableBox) {
      throw new Error('Could not resolve column selection band geometry after scroll.');
    }

    expect(Math.abs(bandBox.x + bandBox.width / 2 - cellBox.x - cellBox.width / 2)).toBeLessThan(24);
    expect(Math.abs(bandBox.width - cellBox.width)).toBeLessThan(24);
    expect(bandBox.y).toBeGreaterThanOrEqual(tableBox.y - 8);
    expect(bandBox.y + bandBox.height).toBeLessThanOrEqual(tableBox.y + tableBox.height + 8);
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
    await expect(rowSelectionBand(page)).toBeVisible();
    await expect(columnSelectionBand(page)).toBeHidden();
    await expect(bodyRowCell(page, initialRowCount, 0)).toHaveText('');

    const insertedRowHandleIndex = (await table(page).locator('thead tr').count()) + initialRowCount;
    await page.locator('.hero').hover();
    await expect(rowHandle(page, insertedRowHandleIndex)).toBeVisible();

    await clickCenter(page, addColumnButton(page));
    await expect(table(page).locator('thead tr').first().locator('th,td')).toHaveCount(initialColumnCount + 1);
    await expect(columnSelectionBand(page)).toBeVisible();
    await expect(rowSelectionBand(page)).toBeHidden();
    await expect(bodyRowCell(page, 0, initialColumnCount)).toHaveText('');
    await page.locator('.hero').hover();
    await expect(columnHandle(page, initialColumnCount)).toBeVisible();
  });

  test('extend buttons hide while a context menu is open and return after it closes', async ({ page }) => {
    await gotoDemo(page);
    await firstBodyCell(page).hover();

    await expect(addRowButton(page)).toBeVisible();
    await expect(addColumnButton(page)).toBeVisible();

    await openTableMenu(page);
    await expect(addRowButton(page)).toBeHidden();
    await expect(addColumnButton(page)).toBeHidden();

    await page.keyboard.press('Escape');
    await expect(contextMenu(page)).toBeHidden();
    await expect(addRowButton(page)).toBeVisible();
    await expect(addColumnButton(page)).toBeVisible();
  });

  test('extend buttons hide during resize and return after resize ends', async ({ page }) => {
    await gotoDemo(page);
    await firstBodyCell(page).hover();

    const resizeHandle = page.getByTestId('pmht-resize-handle').first();
    await expect(resizeHandle).toBeVisible();

    const resizeBox = await resizeHandle.boundingBox();
    if (!resizeBox) {
      throw new Error('Could not resolve resize handle geometry for extend button lifecycle test.');
    }

    await page.mouse.move(resizeBox.x + resizeBox.width / 2, resizeBox.y + resizeBox.height / 2);
    await page.mouse.down();
    await expect(addRowButton(page)).toBeHidden();
    await expect(addColumnButton(page)).toBeHidden();

    await page.mouse.move(resizeBox.x + resizeBox.width / 2 + 32, resizeBox.y + resizeBox.height / 2, { steps: 4 });
    await page.mouse.up();

    await expect(addRowButton(page)).toBeVisible();
    await expect(addColumnButton(page)).toBeVisible();
  });

  test('resize hides other overlay handles until the drag completes', async ({ page }) => {
    await gotoDemo(page);
    await firstBodyCell(page).hover();
    await dragBetweenCells(page, firstBodyCell(page), secondBodyCell(page));

    const resizeHandle = page.getByTestId('pmht-resize-handle').first();
    await expect(tableHandle(page)).toBeVisible();
    await expect(cellHandle(page)).toBeVisible();
    await expect(resizeHandle).toBeVisible();

    const resizeBox = await resizeHandle.boundingBox();
    if (!resizeBox) {
      throw new Error('Could not resolve resize handle geometry for overlay lifecycle test.');
    }

    await page.mouse.move(resizeBox.x + resizeBox.width / 2, resizeBox.y + resizeBox.height / 2);
    await page.mouse.down();

    await expect(tableHandle(page)).toBeHidden();
    await expect(cellHandle(page)).toBeHidden();

    await page.mouse.move(resizeBox.x + resizeBox.width / 2 + 24, resizeBox.y + resizeBox.height / 2, { steps: 4 });
    await page.mouse.up();

    await expect(tableHandle(page)).toBeVisible();
    await expect(cellHandle(page)).toBeVisible();
    await expect(resizeHandle).toBeVisible();
  });
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
