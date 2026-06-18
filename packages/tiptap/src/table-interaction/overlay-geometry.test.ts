import { describe, expect, it } from 'vitest';

import {
  getTableContextSubmenuPosition,
  getTableContextSubmenuTransformOrigin,
} from './overlay-geometry.js';

describe('shared table overlay geometry', () => {
  it('positions submenus to the right when space allows', () => {
    expect(getTableContextSubmenuPosition(40, 120, 80, 100, 120, 0, 0, 400, 300)).toEqual({
      left: 126,
      top: 80,
      placement: 'right',
    });
    expect(getTableContextSubmenuTransformOrigin('right')).toBe('left top');
  });

  it('flips submenus to the left and clamps them inside viewport bounds', () => {
    expect(getTableContextSubmenuPosition(220, 300, 260, 140, 120, 12, 12, 320, 320, 6, -6)).toEqual({
      left: 74,
      top: 200,
      placement: 'left',
    });
    expect(getTableContextSubmenuTransformOrigin('left')).toBe('right top');
  });
});
