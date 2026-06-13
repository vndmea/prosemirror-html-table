import { expect, test } from '@playwright/test';

test.describe('S1000D React demo', () => {
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
    await page.getByTestId('select-cell').click();
    await page.getByTestId('add-row-after').click();
    await page.getByTestId('export-xml').click();

    const xml = await page.getByTestId('xml-output').textContent();
    expect((xml?.match(/<row\b/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  test('column command updates rendered html', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('load-proced').click();
    await page.getByTestId('select-cell').click();
    await page.getByTestId('add-column-after').click();
    await page.getByTestId('render-html').click();

    const html = await page.getByTestId('html-output').textContent();
    expect((html?.match(/<col\b/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  test('move commands keep the table valid', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('load-proced').click();
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

    await expect(page.getByTestId('editor-dom-output')).toContainText('true');
    await expect(page.getByTestId('html-output')).not.toContainText('data-s1000d');
  });

  test('clipboard MVP copy and paste path works', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('load-proced').click();
    await page.getByTestId('select-cell').click();
    await page.getByTestId('copy-selection').click();

    await expect(page.getByTestId('clipboard-html-length')).not.toContainText('0');
    await page.getByTestId('paste-tsv').click();
    await page.getByTestId('validate').click();

    await expect(page.getByTestId('clipboard-text-output')).toContainText('1');
    await expect(page.getByTestId('validation-output')).toContainText('"valid": true');
  });
});
