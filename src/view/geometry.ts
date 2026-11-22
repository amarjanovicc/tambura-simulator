export type Orientation = 'h' | 'v';

/**
 * Layout in two abstract axes so one drawing/hit-test path serves both orientations:
 * "along" runs from the head over the frets to the bridge, "cross" runs across the
 * strings (lowest string first). Horizontal: along = x, cross = y (lowest string on top,
 * as the player sees it). Vertical (phones): along = y, cross = x (lowest string left).
 */
export interface Geometry {
  width: number;
  height: number;
  orientation: Orientation;
  headStart: number;
  nut: number;
  /** Along position of fret wire 1..F (index 0 = fret wire 1). */
  frets: number[];
  strumStart: number;
  strumEnd: number;
  bridge: number;
  /** Cross position of each course, low to high. */
  strings: number[];
  spacing: number;
  neckMin: number;
  neckMax: number;
  bodyMin: number;
  bodyMax: number;
}

export type Hit = { zone: 'neck'; course: number; fret: number } | { zone: 'strum' } | null;

/** Every chord shape fits in the first five frets, so never show fewer. */
export const MIN_FRETS = 5;
/** Average fret cell length (px) we aim for, so a fingertip can hit it. */
const MIN_CELL = 40;

export function computeGeometry(width: number, height: number, courses: number, maxFrets: number): Geometry {
  const orientation: Orientation = width > height ? 'h' : 'v';
  const L = orientation === 'h' ? width : height;
  const W = orientation === 'h' ? height : width;
  const pad = 8;

  const headStart = pad;
  const nut = headStart + clamp(L * 0.07, 34, 72);
  const strumLen = clamp(L * 0.28, 100, 340);
  const strumEnd = L - pad;
  const strumStart = strumEnd - strumLen;
  const bridge = strumEnd - Math.min(34, strumLen * 0.16);
  // Short screens show fewer frets rather than frets too small to touch.
  const fretCount = clamp(Math.floor((strumStart - nut) / MIN_CELL), Math.min(MIN_FRETS, maxFrets), maxFrets);

  // Real fret spacing shrinks towards the body; blend with even spacing so high frets
  // stay big enough for a fingertip.
  const total = 1 - 2 ** (-fretCount / 12);
  const frets: number[] = [];
  for (let i = 1; i <= fretCount; i++) {
    const real = (1 - 2 ** (-i / 12)) / total;
    const p = 0.55 * real + 0.45 * (i / fretCount);
    frets.push(nut + p * (strumStart - nut));
  }

  const spacing = Math.min(84, (W - pad * 2) / courses);
  const neckWidth = spacing * courses;
  const neckMin = (W - neckWidth) / 2;
  const strings = Array.from({ length: courses }, (_, i) => neckMin + spacing * (i + 0.5));
  const bodyWidth = Math.min(W - 4, neckWidth * 1.6);

  return {
    width,
    height,
    orientation,
    headStart,
    nut,
    frets,
    strumStart,
    strumEnd,
    bridge,
    strings,
    spacing,
    neckMin,
    neckMax: neckMin + neckWidth,
    bodyMin: (W - bodyWidth) / 2,
    bodyMax: (W + bodyWidth) / 2,
  };
}

export function toXY(g: Geometry, along: number, cross: number): [number, number] {
  return g.orientation === 'h' ? [along, cross] : [cross, along];
}

export function toAlongCross(g: Geometry, x: number, y: number): { along: number; cross: number } {
  return g.orientation === 'h' ? { along: x, cross: y } : { along: y, cross: x };
}

/** Along position where a course is stopped: the nut for open strings, else the fret wire. */
export function stopPosition(g: Geometry, fret: number): number {
  return fret <= 0 ? g.nut : (g.frets[fret - 1] ?? g.nut);
}

/** Along position of the centre of the cell where a finger presses a fret. */
export function cellCenter(g: Geometry, fret: number): number {
  if (fret <= 0) return (g.headStart + g.nut) / 2;
  const a = fret === 1 ? g.nut : (g.frets[fret - 2] ?? g.nut);
  const b = g.frets[fret - 1] ?? a;
  return (a + b) / 2;
}

export function hitTest(g: Geometry, x: number, y: number): Hit {
  const { along, cross } = toAlongCross(g, x, y);
  if (along >= g.strumStart) return { zone: 'strum' };
  if (along < g.headStart - 12) return null;
  if (cross < g.neckMin - g.spacing * 0.25 || cross > g.neckMax + g.spacing * 0.25) return null;
  const course = clamp(Math.floor((cross - g.neckMin) / g.spacing), 0, g.strings.length - 1);
  if (along < g.nut) return { zone: 'neck', course, fret: 0 };
  let fret = g.frets.findIndex((p) => along <= p) + 1;
  if (fret === 0) fret = g.frets.length;
  return { zone: 'neck', course, fret };
}

/** Courses whose string lies between two cross positions, in the order they are crossed. */
export function crossedStrings(g: Geometry, from: number, to: number): { course: number; t: number }[] {
  const hits: { course: number; t: number }[] = [];
  if (from === to) return hits;
  g.strings.forEach((s, course) => {
    const crossed = from < to ? from < s && s <= to : to <= s && s < from;
    if (crossed) hits.push({ course, t: (s - from) / (to - from) });
  });
  return hits.sort((a, b) => a.t - b.t);
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}
