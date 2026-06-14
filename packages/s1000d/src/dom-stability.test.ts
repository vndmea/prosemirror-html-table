import { chromium } from '@playwright/test';
import { describe, expect, it } from 'vitest';

describe('S1000D editor DOM stability', () => {
  it('confirms browsers normalize nested table sections out of the tgroup wrapper', { timeout: 15000 }, async () => {
    const browser = await chromium.launch({ headless: true });

    try {
      const page = await browser.newPage();
      await page.setContent(
        '<table id="s1000d-dom-check"><tbody data-s1000d="tgroup"><thead data-s1000d="thead"><tr><td>H</td></tr></thead><tbody data-s1000d="tbody"><tr><td>B</td></tr></tbody></tbody></table>',
      );

      const result = await page.evaluate(() => {
        const table = document.querySelector('#s1000d-dom-check');
        return {
          childTags: Array.from(table?.children ?? []).map((element) => ({
            tag: element.tagName.toLowerCase(),
            data: element.getAttribute('data-s1000d'),
          })),
          nestedTheadUnderTgroup: table?.querySelector('tbody[data-s1000d="tgroup"] > thead[data-s1000d="thead"]') !== null,
          nestedBodyUnderTgroup: table?.querySelector('tbody[data-s1000d="tgroup"] > tbody[data-s1000d="tbody"]') !== null,
        };
      });

      expect(result.childTags).toEqual([
        { tag: 'tbody', data: 'tgroup' },
        { tag: 'thead', data: 'thead' },
        { tag: 'tbody', data: 'tbody' },
      ]);
      expect(result.nestedTheadUnderTgroup).toBe(false);
      expect(result.nestedBodyUnderTgroup).toBe(false);
    } finally {
      await browser.close();
    }
  });
});
