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
  /** Along position where the body begins: the high frets lie over it, as on a real prim. */
  bodyStart: number;
  /** Along position where the fingerboard ends, a little way into the strumming area. */
  boardEnd: number;
  /** Along position of the tail of the body: past the edge of the canvas in neck view. */
  bodyEnd: number;
}

export interface LayoutOptions {
  /**
   * Neck view: the neck fills the screen and the body is cut off by the edge, as in a
   * close-up photo. Wider strings and bigger frets, for small screens.
   */
  neckOnly?: boolean;
}

export type Hit = { zone: 'neck'; course: number; fret: number } | { zone: 'strum' } | null;

/** Every chord shape fits in the first five frets, so never show fewer. */
export const MIN_FRETS = 5;
/** Average fret cell length (px) we aim for, so a fingertip can hit it. */
const MIN_CELL = 40;
/** In neck view the frets get more room. */
const MIN_CELL_NECK = 50;

export function computeGeometry(
  width: number,
  height: number,
  courses: number,
  maxFrets: number,
  options: LayoutOptions = {},
): Geometry {
  const neckOnly = options.neckOnly ?? false;
  const orientation: Orientation = width > height ? 'h' : 'v';
  const L = orientation === 'h' ? width : height;
  const W = orientation === 'h' ? height : width;
  const pad = 8;

  const headStart = pad;
  const nut = headStart + clamp(L * 0.075, 40, 84);
  // Neck view keeps a shorter strumming area at the start of the body.
  const strumLen = neckOnly ? clamp(L * 0.2, 90, 240) : clamp(L * 0.3, 110, 380);
  const strumEnd = L - pad;
  const strumStart = strumEnd - strumLen;
  // Short screens show fewer frets rather than frets too small to touch.
  const minCell = neckOnly ? MIN_CELL_NECK : MIN_CELL;
  const fretCount = clamp(Math.floor((strumStart - nut) / minCell), Math.min(MIN_FRETS, maxFrets), maxFrets);

  // Real fret spacing shrinks towards the body; blend with even spacing so high frets
  // stay big enough for a fingertip.
  const total = 1 - 2 ** (-fretCount / 12);
  const frets: number[] = [];
  for (let i = 1; i <= fretCount; i++) {
    const real = (1 - 2 ** (-i / 12)) / total;
    const p = 0.55 * real + 0.45 * (i / fretCount);
    frets.push(nut + p * (strumStart - nut));
  }

  // Strings far enough apart for a fingertip, but a neck narrow enough that the body
  // shows clearly wider than it, as on a real tambura.
  // On a phone that means about 48 px per string, still above the 44 px touch minimum.
  // Bigger screens get a bigger instrument: up to 84 px per string.
  // Neck view: as wide as the screen allows, since the body no longer has to fit.
  const fit = ((W - pad * 2) / courses) * 0.84;
  const maxSpacing = clamp(W * 0.095, 56, 84);
  const spacing = neckOnly ? Math.min(84, fit) : Math.min(maxSpacing, fit, Math.max(46, (W * 0.52) / courses));
  const neckWidth = spacing * courses;
  const neckMin = (W - neckWidth) / 2;
  const strings = Array.from({ length: courses }, (_, i) => neckMin + spacing * (i + 0.5));

  // The body. In neck view it is drawn at its full size and runs off the canvas, so only
  // the shoulders where it meets the neck show.
  const bodyWidth = neckOnly ? neckWidth * 2.6 : Math.min(W - 10, neckWidth * 2.6);
  const bodyStart = neckOnly
    ? strumStart - strumLen * 0.5
    : Math.max(nut + (strumStart - nut) * 0.45, strumStart - strumLen * 0.85);
  const bodyEnd = neckOnly ? bodyStart + bodyWidth * 1.35 : strumEnd;
  // Room behind the bridge for the tail of the body and the string pins.
  const bridge = neckOnly ? bodyStart + (bodyEnd - bodyStart) * 0.82 : strumEnd - strumLen * 0.22;

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
    bodyStart,
    boardEnd: strumStart + strumLen * (neckOnly ? 0.35 : 0.13),
    bodyEnd,
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
