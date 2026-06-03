import { describe, expect, it } from 'vitest';

import { defaultHtmlTableTiptapOptions } from './options.js';

describe('defaultHtmlTableTiptapOptions', () => {
  it('matches the shipped interaction defaults', () => {
    expect(defaultHtmlTableTiptapOptions).toMatchObject({
      resizable: true,
      renderWrapper: true,
      handleWidth: 1,
      cellMinWidth: 120,
      lastColumnResizable: true,
      allowTableNodeSelection: true,
    });
  });
});
