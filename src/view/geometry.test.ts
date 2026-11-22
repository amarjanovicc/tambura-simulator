import { describe, expect, it } from 'vitest';
import { cellCenter, computeGeometry, crossedStrings, hitTest } from './geometry';

describe('geometry', () => {
  it('lays out horizontally on wide screens and vertically on phones', () => {
    expect(computeGeometry(1200, 500, 4, 12).orientation).toBe('h');
    expect(computeGeometry(320, 400, 4, 12).orientation).toBe('v');
  });

  it('shows fewer frets on short screens but never fewer than five', () => {
    expect(computeGeometry(1400, 500, 4, 12).frets).toHaveLength(12);
    expect(computeGeometry(320, 300, 4, 12).frets).toHaveLength(5);
  });

  it('hit-tests frets and the strum zone', () => {
    const g = computeGeometry(1200, 500, 4, 12);
    const y = g.strings[2]!;
    expect(hitTest(g, cellCenter(g, 3), y)).toEqual({ zone: 'neck', course: 2, fret: 3 });
    expect(hitTest(g, cellCenter(g, 0), y)).toEqual({ zone: 'neck', course: 2, fret: 0 });
    expect(hitTest(g, g.strumStart + 20, y)).toEqual({ zone: 'strum' });
  });

  it('reports crossed strings in crossing order', () => {
    const g = computeGeometry(1200, 500, 4, 12);
    const down = crossedStrings(g, 0, 500).map((h) => h.course);
    const up = crossedStrings(g, 500, 0).map((h) => h.course);
    expect(down).toEqual([0, 1, 2, 3]);
    expect(up).toEqual([3, 2, 1, 0]);
  });

  it('neck view widens the strings and lets the body run off the canvas', () => {
    const full = computeGeometry(375, 520, 4, 12);
    const neck = computeGeometry(375, 520, 4, 12, { neckOnly: true });
    expect(neck.spacing).toBeGreaterThan(full.spacing);
    expect(neck.bodyEnd).toBeGreaterThan(neck.height);
    expect(neck.bridge).toBeGreaterThan(neck.height);
    // The strumming area is still on screen.
    const x = neck.strings[1]!;
    expect(hitTest(neck, x, neck.strumStart + 10)).toEqual({ zone: 'strum' });
    expect(neck.strumEnd).toBeLessThanOrEqual(neck.height);
  });
});
