import { describe, expect, it } from 'vitest';

import { defaultHtmlTableTiptapOptions } from './options.js';

describe('defaultHtmlTableTiptapOptions', () => {
  it('keeps legacy controls enabled during the PR1 transition', () => {
    expect(defaultHtmlTableTiptapOptions.renderLegacyControls).toBe(true);
  });
});
