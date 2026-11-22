import type { InstrumentDef, InstrumentId } from '../music/instruments';
import { type Geometry, cellCenter, toXY } from './geometry';

/**
 * Paints the parts of the instrument that never move (body, sound holes, pickguard,
 * neck, frets, head, bridge, tailpiece) onto a canvas. The renderer caches the result and
 * only draws strings and finger marks on top each frame.
 *
 * Shapes follow photos of Srijem instruments: the prim and bas-prim are pears that taper
 * into the neck, the kontra is guitar-shaped, the berde is shaped like a double bass.
 */

export const INK = '#1d1712';
export const CREAM = '#fbf3e4';
export const VEZ_RED = '#b3221b';

type Profile = readonly (readonly [number, number])[];

interface Art {
  /** Body outline: half-width (share of the widest point) along the body, neck → tail. */
  profile: Profile;
  pickguard: 'shield' | 'guitar' | 'none';
  /** Tailpiece: a dark cover (pear tamburas), nickel plate (kontra) or ebony (berde). */
  tailpiece: 'cover' | 'metal' | 'ebony';
  /** Fret markers: pearl diamonds, or dots. */
  markers: 'diamond' | 'dot';
  /** Where the strings meet the tailpiece, as a share of their spread at the bridge. */
  tailSpread: number;
}

const ART: Record<InstrumentId, Art> = {
  // A pear: it grows out of the neck with concave sides and is widest low on the body.
  prim: {
    profile: [
      [0, 0],
      [0.08, 0.42],
      [0.2, 0.6],
      [0.38, 0.8],
      [0.58, 0.95],
      [0.74, 1],
      [0.86, 0.94],
      [0.94, 0.76],
      [0.985, 0.45],
      [1, 0],
    ],
    pickguard: 'shield',
    tailpiece: 'cover',
    markers: 'diamond',
    tailSpread: 0.55,
  },
  basprim: {
    profile: [
      [0, 0],
      [0.07, 0.46],
      [0.2, 0.66],
      [0.38, 0.84],
      [0.58, 0.97],
      [0.74, 1],
      [0.86, 0.95],
      [0.94, 0.78],
      [0.985, 0.47],
      [1, 0],
    ],
    pickguard: 'none',
    tailpiece: 'cover',
    markers: 'diamond',
    tailSpread: 0.55,
  },
  // A guitar: upper bout, waist, larger lower bout.
  kontra: {
    profile: [
      [0, 0],
      [0.03, 0.6],
      [0.1, 0.8],
      [0.22, 0.85],
      [0.36, 0.72],
      [0.47, 0.66],
      [0.6, 0.84],
      [0.78, 1],
      [0.91, 0.94],
      [0.975, 0.66],
      [1, 0],
    ],
    pickguard: 'guitar',
    tailpiece: 'metal',
    markers: 'diamond',
    tailSpread: 0.7,
  },
  // A double bass: sloping shoulders, C-bouts, wide lower bout.
  berde: {
    profile: [
      [0, 0],
      [0.06, 0.42],
      [0.17, 0.66],
      [0.28, 0.76],
      [0.38, 0.7],
      [0.46, 0.6],
      [0.55, 0.66],
      [0.68, 0.9],
      [0.83, 1],
      [0.94, 0.9],
      [0.99, 0.5],
      [1, 0],
    ],
    pickguard: 'none',
    tailpiece: 'ebony',
    markers: 'dot',
    tailSpread: 0.45,
  },
};

export interface BodyFrame {
  start: number;
  end: number;
  mid: number;
  half: number;
  neckHalf: number;
}

export function bodyFrame(g: Geometry): BodyFrame {
  return {
    start: g.bodyStart,
    end: g.bodyEnd,
    mid: (g.neckMin + g.neckMax) / 2,
    half: (g.bodyMax - g.bodyMin) / 2,
    neckHalf: (g.neckMax - g.neckMin) / 2,
  };
}

/** Catmull-Rom through the profile points. */
function profileAt(points: Profile, t: number): number {
  let i = 0;
  while (i < points.length - 2 && t > points[i + 1]![0]) i++;
  const p0 = points[Math.max(0, i - 1)]!;
  const p1 = points[i]!;
  const p2 = points[i + 1]!;
  const p3 = points[Math.min(points.length - 1, i + 2)]!;
  const u = (t - p1[0]) / Math.max(1e-6, p2[0] - p1[0]);
  const m1 = ((p2[1] - p0[1]) / Math.max(1e-6, p2[0] - p0[0])) * (p2[0] - p1[0]);
  const m2 = ((p3[1] - p1[1]) / Math.max(1e-6, p3[0] - p1[0])) * (p2[0] - p1[0]);
  const u2 = u * u;
  const u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p1[1] + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * p2[1] + (u3 - u2) * m2;
}

/**
 * The body outline. Where it meets the neck it is never narrower than the neck, so the
 * pear flows into the neck heel without a step.
 */
export function bodyPath(g: Geometry, inst: InstrumentDef): Path2D {
  const f = bodyFrame(g);
  const profile = ART[inst.id].profile;
  const steps = 160;
  const upper: [number, number][] = [];
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    const neck = t < 0.5 ? f.neckHalf / f.half : 0;
    const s = Math.max(neck, Math.min(1.02, profileAt(profile, t)));
    upper.push([f.start + (f.end - f.start) * t, s * f.half]);
  }
  const path = new Path2D();
  upper.forEach(([a, w], k) => {
    const [x, y] = toXY(g, a, f.mid - w);
    if (k === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  });
  for (let k = upper.length - 1; k >= 0; k--) {
    const [a, w] = upper[k]!;
    const [x, y] = toXY(g, a, f.mid + w);
    path.lineTo(x, y);
  }
  path.closePath();
  return path;
}

/** Along position where the strings are fastened, and how far apart they are there. */
export function tailAnchor(g: Geometry, inst: InstrumentDef): { along: number; spread: number } {
  return { along: g.bridge + (g.bodyEnd - g.bridge) * 0.42, spread: ART[inst.id].tailSpread };
}

/** Deterministic random numbers, so the wood grain doesn't change between redraws. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rect(g: Geometry, a0: number, a1: number, c0: number, c1: number): [number, number, number, number] {
  const [x0, y0] = toXY(g, a0, c0);
  const [x1, y1] = toXY(g, a1, c1);
  return [Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0)];
}

/** A closed, smooth path through points given in (along, cross), mirrored about `mid`. */
function mirroredPath(g: Geometry, mid: number, half: readonly (readonly [number, number])[]): Path2D {
  const pts: [number, number][] = [
    ...half.map(([a, c]) => toXY(g, a, mid - c)),
    ...[...half].reverse().map(([a, c]) => toXY(g, a, mid + c)),
  ];
  return smoothClosed(pts);
}

/** Closed curve through points (quadratic curves between midpoints). */
function smoothClosed(pts: readonly [number, number][]): Path2D {
  const path = new Path2D();
  const n = pts.length;
  const midOf = (i: number): [number, number] => {
    const p = pts[i % n]!;
    const q = pts[(i + 1) % n]!;
    return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  };
  path.moveTo(...midOf(0));
  for (let i = 1; i <= n; i++) {
    const p = pts[i % n]!;
    path.quadraticCurveTo(p[0], p[1], ...midOf(i));
  }
  path.closePath();
  return path;
}

/** Grain lines running with the strings, clipped to whatever path is current. */
function grain(ctx: CanvasRenderingContext2D, g: Geometry, a0: number, a1: number, c0: number, c1: number, color: string, seed: number, gap = 3.4): void {
  const rand = seeded(seed);
  ctx.lineCap = 'round';
  for (let c = c0; c < c1; c += 1.2 + rand() * gap) {
    ctx.beginPath();
    const wave = 0.3 + rand() * 0.6;
    const freq = 0.01 + rand() * 0.02;
    for (let a = a0; a <= a1; a += 12) {
      const [x, y] = toXY(g, a, c + Math.sin(a * freq + c) * wave);
      if (a === a0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.globalAlpha = 0.04 + rand() * 0.1;
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.4 + rand() * 0.9;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

export function paintInstrument(ctx: CanvasRenderingContext2D, g: Geometry, inst: InstrumentDef): void {
  const f = bodyFrame(g);
  const body = bodyPath(g, inst);
  const art = ART[inst.id];

  // Body with a soft shadow on the linen.
  ctx.save();
  ctx.shadowColor = 'rgba(70, 40, 15, 0.38)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = inst.bodyEdge;
  ctx.fill(body);
  ctx.restore();

  // Spruce top: light in the middle, toned towards the edges (sunburst), fine grain.
  const [cx, cy] = toXY(g, f.start + (f.end - f.start) * 0.62, f.mid);
  const radius = Math.max(f.end - f.start, f.half * 2) * 0.68;
  const top = ctx.createRadialGradient(cx, cy, radius * 0.1, cx, cy, radius);
  top.addColorStop(0, inst.bodyColor);
  top.addColorStop(0.6, inst.bodyColor);
  top.addColorStop(0.9, mix(inst.bodyColor, inst.bodyEdge, 0.4));
  top.addColorStop(1.0, mix(inst.bodyColor, inst.bodyEdge, 0.75));
  ctx.save();
  ctx.clip(body);
  ctx.fillStyle = top;
  ctx.fill(body);
  grain(ctx, g, f.start, f.end, f.mid - f.half, f.mid + f.half, '#5a3412', inst.id.length * 97, 2.6);
  // Purfling inside the edge (each stroke shows half its width inside the clip), from
  // the inside out: black, cream, black, the cream celluloid binding, a dark edge.
  for (const [width, color] of [
    [17, '#1c120b'],
    [14.6, '#efe3c8'],
    [12.6, '#1c120b'],
    [10.4, '#f1e6cc'],
    [3.2, '#2b1a10'],
  ] as const) {
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.stroke(body);
  }
  ctx.restore();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(43, 26, 16, 0.85)';
  ctx.lineWidth = 1;
  ctx.stroke(body);

  if (art.pickguard === 'shield') paintShieldGuard(ctx, g, f, inst);
  paintSoundHoles(ctx, g, inst, f);
  if (art.pickguard === 'guitar') paintGuitarGuard(ctx, g, f);
  paintTailpiece(ctx, g, inst, f);
  paintBridge(ctx, g, inst);
  paintNeck(ctx, g, inst);
}

/** Centre of a round sound hole: between the end of the fingerboard and the bridge. */
function holeCenter(g: Geometry): number {
  return g.boardEnd + (g.bridge - g.boardEnd) * 0.34;
}

function holeRadius(g: Geometry, f: BodyFrame): number {
  return Math.min(f.neckHalf * 0.72, (g.bridge - g.boardEnd) * 0.25);
}

/** Tortoiseshell: a dark base with amber blotches, clipped to the given path. */
function tortoise(ctx: CanvasRenderingContext2D, path: Path2D, x0: number, y0: number, w: number, h: number, seed: number): void {
  ctx.save();
  ctx.shadowColor = 'rgba(30, 15, 5, 0.35)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 1.5;
  ctx.fillStyle = '#2a1209';
  ctx.fill(path);
  ctx.restore();
  ctx.save();
  ctx.clip(path);
  const rand = seeded(seed);
  for (let i = 0; i < 60; i++) {
    const x = x0 + rand() * w;
    const y = y0 + rand() * h;
    const r = 3 + rand() * Math.max(6, Math.min(w, h) * 0.12);
    const blob = ctx.createRadialGradient(x, y, 0, x, y, r);
    const tone = rand() < 0.6 ? '150, 70, 20' : '90, 35, 12';
    blob.addColorStop(0, `rgba(${tone}, ${0.35 + rand() * 0.35})`);
    blob.addColorStop(1, `rgba(${tone}, 0)`);
    ctx.fillStyle = blob;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // A soft sheen.
  const sheen = ctx.createLinearGradient(x0, y0, x0 + w, y0 + h);
  sheen.addColorStop(0, 'rgba(255, 230, 190, 0.12)');
  sheen.addColorStop(0.5, 'rgba(255, 230, 190, 0)');
  ctx.fillStyle = sheen;
  ctx.fill(path);
  ctx.restore();
  ctx.strokeStyle = 'rgba(20, 8, 3, 0.8)';
  ctx.lineWidth = 1;
  ctx.stroke(path);
}

function pathBounds(g: Geometry, a0: number, a1: number, c0: number, c1: number): [number, number, number, number] {
  return rect(g, a0, a1, c0, c1);
}

function shieldWidth(f: BodyFrame): number {
  return Math.min(f.half * 0.48, f.neckHalf * 1.05);
}

/**
 * The prim's large lobed pickguard, from the end of the fingerboard towards the bridge,
 * under the strings where the plectrum strikes.
 */
function paintShieldGuard(ctx: CanvasRenderingContext2D, g: Geometry, f: BodyFrame, inst: InstrumentDef): void {
  const a0 = g.boardEnd - 6;
  const a1 = g.bridge - (g.bridge - g.boardEnd) * 0.18;
  const len = a1 - a0;
  if (len < 20) return;
  const w = shieldWidth(f);
  const at = (u: number, v: number): readonly [number, number] => [a0 + len * u, w * v];
  // Carved lobes, as on the celluloid guards of Srijem prims.
  const half = [
    at(0, 0.55),
    at(0.1, 0.8),
    at(0.2, 0.68),
    at(0.32, 0.98),
    at(0.46, 0.84),
    at(0.6, 1),
    at(0.76, 0.82),
    at(0.88, 0.55),
    at(0.97, 0.3),
    at(1, 0.08),
  ];
  const path = mirroredPath(g, f.mid, half);
  tortoise(ctx, path, ...pathBounds(g, a0, a1, f.mid - w, f.mid + w), inst.id.length * 13);
}

/** A guitar-style teardrop pickguard beside the sound hole, on the treble side. */
function paintGuitarGuard(ctx: CanvasRenderingContext2D, g: Geometry, f: BodyFrame): void {
  const a = holeCenter(g);
  const R = holeRadius(g, f);
  const c = f.mid + R * 0.9;
  const pts: [number, number][] = [
    toXY(g, a - R * 0.6, c + R * 0.25),
    toXY(g, a - R * 0.2, c + R * 0.75),
    toXY(g, a + R * 0.9, c + R * 1.05),
    toXY(g, a + R * 2.1, c + R * 0.8),
    toXY(g, a + R * 2.5, c + R * 0.2),
    toXY(g, a + R * 1.6, c - R * 0.15),
    toXY(g, a + R * 0.7, c - R * 0.05),
  ];
  const path = smoothClosed(pts);
  tortoise(ctx, path, ...pathBounds(g, a - R, a + R * 2.6, c - R * 0.3, c + R * 1.1), 41);
}

/** A ring of small tiles, like the wood mosaic of a rosette. */
function mosaicRing(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, size: number): void {
  const n = Math.max(12, Math.floor((2 * Math.PI * r) / (size * 1.25)));
  const pattern = [VEZ_RED, CREAM, INK, CREAM, '#3f6b3a', CREAM, INK, CREAM];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    ctx.save();
    ctx.translate(x + Math.cos(t) * r, y + Math.sin(t) * r);
    ctx.rotate(t + Math.PI / 4);
    ctx.fillStyle = pattern[i % pattern.length]!;
    ctx.fillRect(-size / 2, -size / 2, size, size);
    ctx.restore();
  }
}

function paintSoundHoles(ctx: CanvasRenderingContext2D, g: Geometry, inst: InstrumentDef, f: BodyFrame): void {
  if (inst.soundHole === 'f-holes') return paintFHoles(ctx, g, f);
  if (inst.soundHole === 'holes') return paintSmallHoles(ctx, g, f);

  // One round hole with a rosette: purfling rings around a mosaic band.
  const a = holeCenter(g);
  const R = holeRadius(g, f);
  const [x, y] = toXY(g, a, f.mid);
  const ring = (r: number, color: string, width: number): void => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  };
  const band = Math.max(3, R * 0.1);
  ring(R + band * 2.9, '#1c120b', 1.4);
  ring(R + band * 2.5, '#efe3c8', 1);
  mosaicRing(ctx, x, y, R + band * 1.6, band);
  ring(R + band * 0.7, '#efe3c8', 1);
  ring(R + band * 0.35, '#1c120b', 1.4);
  const inside = ctx.createRadialGradient(x, y, R * 0.2, x, y, R);
  inside.addColorStop(0, '#0e0703');
  inside.addColorStop(1, '#2a170c');
  ctx.beginPath();
  ctx.arc(x, y, R, 0, Math.PI * 2);
  ctx.fillStyle = inside;
  ctx.fill();
  // The top's thickness shows at the far edge of the hole.
  ctx.beginPath();
  ctx.arc(x, y, R - 0.8, Math.PI * 0.1, Math.PI * 0.9);
  ctx.strokeStyle = 'rgba(240, 210, 160, 0.35)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

/**
 * The Srijem prim has no single sound hole: rows of small holes run in an arc on each
 * side of the pickguard.
 */
function paintSmallHoles(ctx: CanvasRenderingContext2D, g: Geometry, f: BodyFrame): void {
  const a0 = g.boardEnd;
  const a1 = g.bridge - 10;
  const len = a1 - a0;
  const shieldW = shieldWidth(f);
  const hole = Math.max(2.2, Math.min(4.2, f.half * 0.022));
  for (const side of [-1, 1]) {
    for (const [row, count, start, end] of [
      [1.2, 9, 0.02, 0.8],
      [1.42, 7, 0.1, 0.68],
    ] as const) {
      for (let i = 0; i < count; i++) {
        const u = start + ((end - start) * i) / (count - 1);
        // Follow the pickguard's outline: widest in the middle.
        const v = shieldW * row * (0.72 + 0.28 * Math.sin(Math.PI * Math.min(1, u * 1.2)));
        const [hx, hy] = toXY(g, a0 + len * u, f.mid + side * v);
        ctx.beginPath();
        ctx.arc(hx, hy, hole, 0, Math.PI * 2);
        ctx.fillStyle = '#150c06';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(hx, hy, hole, Math.PI * 0.15, Math.PI * 0.85);
        ctx.strokeStyle = 'rgba(255, 240, 210, 0.5)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    }
  }
}

/** Two violin-style f-holes, as on a double bass. */
function paintFHoles(ctx: CanvasRenderingContext2D, g: Geometry, f: BodyFrame): void {
  // On a double bass the bridge stands level with the nicks of the f-holes; here the
  // tail is short, so they sit a little towards the neck to stay on the top.
  const len = Math.min((g.bridge - g.boardEnd) * 0.75, f.half * 0.55);
  const a = g.bridge - len * 0.2;
  for (const side of [-1, 1]) {
    const c = f.mid + side * Math.min(f.half * 0.62, Math.max(f.neckHalf * 1.3, f.half * 0.45));
    const pt = (u: number, v: number): [number, number] => toXY(g, a + u * len, c + v * side * len);
    ctx.strokeStyle = '#120904';
    ctx.fillStyle = '#120904';
    ctx.lineCap = 'round';
    // The S-shaped stem: thin at the ends, broader in the middle.
    ctx.lineWidth = Math.max(2, len * 0.035);
    ctx.beginPath();
    ctx.moveTo(...pt(-0.5, -0.07));
    ctx.bezierCurveTo(...pt(-0.2, 0.1), ...pt(0.2, -0.1), ...pt(0.5, 0.07));
    ctx.stroke();
    // Round eyes at both ends.
    for (const [u, v] of [
      [-0.5, -0.07],
      [0.5, 0.07],
    ] as const) {
      ctx.beginPath();
      ctx.arc(...pt(u, v), Math.max(2.5, len * 0.045), 0, Math.PI * 2);
      ctx.fill();
    }
    // The nicks in the middle.
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(...pt(0, -0.05));
    ctx.lineTo(...pt(0, 0.05));
    ctx.stroke();
  }
}

function paintTailpiece(ctx: CanvasRenderingContext2D, g: Geometry, inst: InstrumentDef, f: BodyFrame): void {
  const art = ART[inst.id];
  const { along } = tailAnchor(g, inst);
  const pins = f.neckHalf * art.tailSpread;
  const a0 = along - 6;
  const a1 = g.bodyEnd - Math.max(6, (g.bodyEnd - g.bridge) * 0.12);

  if (art.tailpiece === 'cover') {
    // A dark triangular cover over the string ends, with a cream border.
    const path = new Path2D();
    path.moveTo(...toXY(g, a0, f.mid - pins - 6));
    path.lineTo(...toXY(g, a0, f.mid + pins + 6));
    path.lineTo(...toXY(g, a1, f.mid + pins * 0.55));
    path.quadraticCurveTo(...toXY(g, a1 + 4, f.mid), ...toXY(g, a1, f.mid - pins * 0.55));
    path.closePath();
    ctx.save();
    ctx.shadowColor = 'rgba(30, 15, 5, 0.4)';
    ctx.shadowBlur = 5;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = '#1a100a';
    ctx.fill(path);
    ctx.restore();
    ctx.strokeStyle = 'rgba(239, 227, 200, 0.7)';
    ctx.lineWidth = 1;
    ctx.stroke(path);
    return;
  }

  if (art.tailpiece === 'metal') {
    // A nickel trapeze plate with engraved lines.
    const path = new Path2D();
    path.moveTo(...toXY(g, a0, f.mid - pins - 5));
    path.lineTo(...toXY(g, a0, f.mid + pins + 5));
    path.lineTo(...toXY(g, a1, f.mid + pins * 0.6));
    path.lineTo(...toXY(g, a1, f.mid - pins * 0.6));
    path.closePath();
    const plate = ctx.createLinearGradient(...toXY(g, a0, f.mid - pins), ...toXY(g, a0, f.mid + pins));
    plate.addColorStop(0, '#8f8a80');
    plate.addColorStop(0.45, '#f1eee6');
    plate.addColorStop(1, '#7d786f');
    ctx.save();
    ctx.shadowColor = 'rgba(30, 15, 5, 0.35)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = plate;
    ctx.fill(path);
    ctx.restore();
    ctx.strokeStyle = 'rgba(60, 55, 48, 0.55)';
    ctx.lineWidth = 0.8;
    for (const k of [0.35, 0.65]) {
      ctx.beginPath();
      ctx.moveTo(...toXY(g, a0 + (a1 - a0) * k, f.mid - pins * (1 - 0.4 * k)));
      ctx.lineTo(...toXY(g, a0 + (a1 - a0) * k, f.mid + pins * (1 - 0.4 * k)));
      ctx.stroke();
    }
    return;
  }

  // Ebony tailpiece of a double bass: wide at the strings, narrowing to the end pin.
  const path = new Path2D();
  path.moveTo(...toXY(g, a0 - 4, f.mid - pins - 7));
  path.quadraticCurveTo(...toXY(g, a0 - 10, f.mid), ...toXY(g, a0 - 4, f.mid + pins + 7));
  path.lineTo(...toXY(g, a1, f.mid + pins * 0.45));
  path.lineTo(...toXY(g, a1, f.mid - pins * 0.45));
  path.closePath();
  ctx.save();
  ctx.shadowColor = 'rgba(30, 15, 5, 0.45)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = '#17100b';
  ctx.fill(path);
  ctx.restore();
  ctx.strokeStyle = 'rgba(255, 240, 220, 0.15)';
  ctx.lineWidth = 1;
  ctx.stroke(path);
}

function paintBridge(ctx: CanvasRenderingContext2D, g: Geometry, inst: InstrumentDef): void {
  const pad = inst.id === 'berde' ? 4 : 10;
  const c0 = g.neckMin - pad;
  const c1 = g.neckMax + pad;
  ctx.save();
  ctx.shadowColor = 'rgba(40, 20, 5, 0.45)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 3;
  if (inst.id === 'berde') {
    // A double-bass bridge from above: two feet and a thin maple crown.
    ctx.fillStyle = '#c99a5b';
    for (const c of [c0 + 8, c1 - 22]) ctx.fillRect(...rect(g, g.bridge - 7, g.bridge + 7, c, c + 14));
    ctx.fillStyle = '#e2c08a';
    ctx.fillRect(...rect(g, g.bridge - 2.5, g.bridge + 2.5, c0, c1));
  } else {
    // A low maple bridge with rounded ends.
    ctx.fillStyle = '#d9b57c';
    ctx.beginPath();
    ctx.roundRect(...rect(g, g.bridge - 4, g.bridge + 4, c0, c1), 4);
    ctx.fill();
  }
  ctx.restore();
  // Bone saddle where the strings cross.
  ctx.fillStyle = '#f6efdf';
  ctx.fillRect(...rect(g, g.bridge - 0.8, g.bridge + 0.8, g.neckMin + 2, g.neckMax - 2));
  ctx.fillStyle = 'rgba(90, 55, 20, 0.35)';
  ctx.fillRect(...rect(g, g.bridge + 2.2, g.bridge + 4, c0 + 3, c1 - 3));
}

function paintNeck(ctx: CanvasRenderingContext2D, g: Geometry, inst: InstrumentDef): void {
  const mid = (g.neckMin + g.neckMax) / 2;
  const art = ART[inst.id];

  paintHead(ctx, g, inst);

  // Fingerboard (ebony-like), running onto the body and ending in a rounded point.
  const tip = Math.min(g.spacing * 0.9, (g.boardEnd - g.strumStart) * 0.9);
  const board = new Path2D();
  board.moveTo(...toXY(g, g.nut, g.neckMin));
  board.lineTo(...toXY(g, g.boardEnd - tip, g.neckMin));
  board.quadraticCurveTo(...toXY(g, g.boardEnd, g.neckMin + 2), ...toXY(g, g.boardEnd, mid));
  board.quadraticCurveTo(...toXY(g, g.boardEnd, g.neckMax - 2), ...toXY(g, g.boardEnd - tip, g.neckMax));
  board.lineTo(...toXY(g, g.nut, g.neckMax));
  board.closePath();
  ctx.save();
  ctx.shadowColor = 'rgba(40, 20, 5, 0.35)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = '#241710';
  ctx.fill(board);
  ctx.restore();
  ctx.save();
  ctx.clip(board);
  grain(ctx, g, g.nut, g.boardEnd, g.neckMin, g.neckMax, '#000000', 7);
  ctx.restore();
  // Cream binding along both edges.
  ctx.strokeStyle = '#efe2c4';
  ctx.lineWidth = 1.6;
  ctx.stroke(board);

  // Mother-of-pearl markers: diamonds on the tamburas, dots on the berde.
  for (const m of [5, 7, 10, 12]) {
    if (m > g.frets.length) continue;
    const a = cellCenter(g, m);
    const offsets = m === 12 ? [-g.spacing, g.spacing] : [0];
    for (const o of offsets) {
      const [x, y] = toXY(g, a, mid + o);
      const pearl = ctx.createRadialGradient(x - 1.5, y - 1.5, 0.5, x, y, 7);
      pearl.addColorStop(0, '#ffffff');
      pearl.addColorStop(0.55, '#e3ece9');
      pearl.addColorStop(1, '#d9c3d0');
      ctx.fillStyle = pearl;
      ctx.beginPath();
      if (art.markers === 'diamond') {
        const r = 6.5;
        const along = Math.min(r, (g.spacing / 2) * 0.5);
        const [ax, ay] = g.orientation === 'h' ? [along, r] : [r, along];
        ctx.moveTo(x - ax, y);
        ctx.lineTo(x, y - ay);
        ctx.lineTo(x + ax, y);
        ctx.lineTo(x, y + ay);
        ctx.closePath();
      } else {
        ctx.arc(x, y, 5.5, 0, Math.PI * 2);
      }
      ctx.fill();
    }
  }

  // Fret wires: nickel silver with a highlight.
  g.frets.forEach((p) => {
    ctx.fillStyle = '#8f8b83';
    ctx.fillRect(...rect(g, p - 1.6, p + 1.6, g.neckMin + 0.8, g.neckMax - 0.8));
    ctx.fillStyle = '#f4f2ec';
    ctx.fillRect(...rect(g, p - 1.2, p - 0.2, g.neckMin + 0.8, g.neckMax - 0.8));
  });

  // Bone nut.
  ctx.fillStyle = '#efe6d2';
  ctx.fillRect(...rect(g, g.nut - 3, g.nut + 3, g.neckMin - 1, g.neckMax + 1));
  ctx.fillStyle = 'rgba(120, 100, 70, 0.4)';
  ctx.fillRect(...rect(g, g.nut + 2, g.nut + 3, g.neckMin - 1, g.neckMax + 1));

  // Fret numbers on the linen beside the neck, where there is room.
  const room = g.neckMin - 2;
  if (room > 16) {
    ctx.font = '500 11px "Fraunces", Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(29, 23, 18, 0.45)';
    g.frets.forEach((p, i) => {
      // Over the body the numbers would sit on the wood: skip those.
      if (p > g.bodyStart + 4) return;
      const [x, y] = toXY(g, cellCenter(g, i + 1), g.neckMin - Math.min(14, room / 2 + 4));
      ctx.fillText(String(i + 1), x, y);
    });
  }
}

/**
 * The head: a flat plate a little wider than the neck with a carved crest at the end,
 * tuning machines along both sides (pearl buttons sticking out) and the string posts.
 */
function paintHead(ctx: CanvasRenderingContext2D, g: Geometry, inst: InstrumentDef): void {
  const mid = (g.neckMin + g.neckMax) / 2;
  const half = (g.neckMax - g.neckMin) / 2 + 6;
  const a0 = g.headStart;
  const a1 = g.nut + 2;
  const len = a1 - a0;
  const crest = Math.min(14, len * 0.3);

  const head = new Path2D();
  head.moveTo(...toXY(g, a1, mid - half + 3));
  head.lineTo(...toXY(g, a0 + crest, mid - half - 2));
  // The carved crest: a curl into the middle on each side.
  head.quadraticCurveTo(...toXY(g, a0 - 2, mid - half), ...toXY(g, a0 + crest * 0.3, mid - half * 0.45));
  head.quadraticCurveTo(...toXY(g, a0 + crest * 0.9, mid - half * 0.2), ...toXY(g, a0, mid));
  head.quadraticCurveTo(...toXY(g, a0 + crest * 0.9, mid + half * 0.2), ...toXY(g, a0 + crest * 0.3, mid + half * 0.45));
  head.quadraticCurveTo(...toXY(g, a0 - 2, mid + half), ...toXY(g, a0 + crest, mid + half + 2));
  head.lineTo(...toXY(g, a1, mid + half - 3));
  head.closePath();

  // Tuning machines first, so the plate covers their shafts.
  const strings = inst.courses.flatMap((c, i) => (c.doubled ? [i, i] : [i]));
  const top = Math.ceil(strings.length / 2);
  const gap = (len - crest - 10) / Math.max(1, top);
  const button = (along: number, side: -1 | 1): void => {
    const edge = mid + side * (half + 1);
    const out = mid + side * (half + 11);
    ctx.strokeStyle = '#b9b4a9';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(...toXY(g, along, edge));
    ctx.lineTo(...toXY(g, along, out - side * 4));
    ctx.stroke();
    const [x, y] = toXY(g, along, out);
    const r = Math.max(3, Math.min(6.4, gap * 0.55));
    const rx = g.orientation === 'h' ? r * 0.7 : r;
    const ry = g.orientation === 'h' ? r : r * 0.7;
    const pearl = ctx.createRadialGradient(x - 1, y - 1, 0.5, x, y, 6);
    pearl.addColorStop(0, '#ffffff');
    pearl.addColorStop(1, '#ddd3c2');
    ctx.fillStyle = pearl;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(60, 45, 30, 0.45)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  };
  const slots = (n: number): number[] =>
    Array.from({ length: n }, (_, i) => a0 + crest + 4 + ((len - crest - 10) * (i + 0.5)) / Math.max(1, n));
  slots(top).forEach((a) => button(a, -1));
  slots(strings.length - top).forEach((a) => button(a, 1));

  ctx.save();
  ctx.shadowColor = 'rgba(70, 40, 15, 0.3)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 5;
  ctx.fillStyle = '#3a2416';
  ctx.fill(head);
  ctx.restore();
  ctx.save();
  ctx.clip(head);
  grain(ctx, g, a0 - 4, a1, mid - half - 4, mid + half + 4, '#000000', 11);
  ctx.restore();
  ctx.strokeStyle = 'rgba(241, 228, 198, 0.55)';
  ctx.lineWidth = 1;
  ctx.stroke(head);

  // String posts where each string ends on the head.
  inst.courses.forEach((c, i) => {
    const cross = g.strings[i] ?? mid;
    const offsets = c.doubled ? [-2.6, 2.6] : [0];
    for (const off of offsets) {
      const [x, y] = toXY(g, g.headStart + 7, cross + off);
      ctx.beginPath();
      ctx.arc(x, y, 2.6, 0, Math.PI * 2);
      ctx.fillStyle = '#d8d3c8';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
  });
}

/** Blends two #rrggbb colours. */
function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number): number => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}
