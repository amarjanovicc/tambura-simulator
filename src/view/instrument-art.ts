import type { InstrumentDef, InstrumentId } from '../music/instruments';
import { type Geometry, cellCenter, toXY } from './geometry';

/**
 * Paints the parts of the instrument that never move (body, rosette, neck, frets, head,
 * bridge) onto a canvas. The renderer caches the result and only draws strings and finger
 * marks on top each frame.
 */

export const INK = '#1d1712';
export const CREAM = '#fbf3e4';
export const VEZ_RED = '#b3221b';

/** Body outline: half-width (share of the widest point) along the body, neck joint → tail. */
const PROFILES: Record<InstrumentId, readonly (readonly [number, number])[]> = {
  // Srijem prim: a small pear, widest low on the body.
  prim: [
    [0, 0.6],
    [0.18, 0.7],
    [0.42, 0.88],
    [0.66, 1],
    [0.84, 0.93],
    [0.95, 0.68],
    [0.99, 0.32],
    [1, 0],
  ],
  // Bas-prim and kontra: guitar-shaped, with a waist.
  basprim: [
    [0, 0.62],
    [0.12, 0.8],
    [0.26, 0.84],
    [0.42, 0.68],
    [0.5, 0.66],
    [0.64, 0.86],
    [0.8, 1],
    [0.92, 0.92],
    [0.98, 0.58],
    [1, 0],
  ],
  kontra: [
    [0, 0.58],
    [0.12, 0.8],
    [0.25, 0.86],
    [0.4, 0.66],
    [0.5, 0.63],
    [0.63, 0.86],
    [0.8, 1],
    [0.92, 0.93],
    [0.98, 0.6],
    [1, 0],
  ],
  // Berde: sloping upper bouts like a double bass.
  berde: [
    [0, 0.5],
    [0.14, 0.7],
    [0.3, 0.8],
    [0.43, 0.64],
    [0.53, 0.62],
    [0.66, 0.88],
    [0.83, 1],
    [0.94, 0.9],
    [0.99, 0.45],
    [1, 0],
  ],
};

export interface BodyFrame {
  start: number;
  end: number;
  mid: number;
  half: number;
  neckHalf: number;
}

export function bodyFrame(g: Geometry): BodyFrame {
  const len = g.strumEnd - g.strumStart;
  const mid = (g.neckMin + g.neckMax) / 2;
  return {
    start: g.strumStart - len * 0.45,
    end: g.strumEnd,
    mid,
    half: (g.bodyMax - g.bodyMin) / 2,
    neckHalf: (g.neckMax - g.neckMin) / 2,
  };
}

/** Catmull-Rom through the profile points. */
function profileAt(points: readonly (readonly [number, number])[], t: number): number {
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

export function bodyPath(g: Geometry, inst: InstrumentDef): Path2D {
  const f = bodyFrame(g);
  const pts = PROFILES[inst.id].map(([t, s], i) => [t, i === 0 ? Math.max(s, f.neckHalf / f.half) : s] as const);
  const steps = 120;
  const upper: [number, number][] = [];
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    // Round the tail: the last few percent close like a circle.
    const s = Math.max(0, Math.min(1.02, profileAt(pts, t)));
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

/** Grain lines running with the strings, clipped to whatever path is current. */
function grain(ctx: CanvasRenderingContext2D, g: Geometry, a0: number, a1: number, c0: number, c1: number, color: string, seed: number): void {
  const rand = seeded(seed);
  ctx.lineCap = 'round';
  for (let c = c0; c < c1; c += 1.6 + rand() * 3.4) {
    ctx.beginPath();
    const wave = 0.4 + rand() * 0.8;
    const freq = 0.01 + rand() * 0.02;
    for (let a = a0; a <= a1; a += 12) {
      const [x, y] = toXY(g, a, c + Math.sin(a * freq + c) * wave);
      if (a === a0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.globalAlpha = 0.04 + rand() * 0.1;
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.5 + rand() * 0.9;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

export function paintInstrument(ctx: CanvasRenderingContext2D, g: Geometry, inst: InstrumentDef): void {
  const f = bodyFrame(g);
  const body = bodyPath(g, inst);

  // Body with a soft shadow on the linen.
  ctx.save();
  ctx.shadowColor = 'rgba(70, 40, 15, 0.35)';
  ctx.shadowBlur = 28;
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = inst.bodyEdge;
  ctx.fill(body);
  ctx.restore();

  // Spruce top: light in the middle, toned towards the edges (sunburst), grain on top.
  const [cx, cy] = toXY(g, (f.start + f.end) / 2 + (f.end - f.start) * 0.08, f.mid);
  const radius = Math.max(f.end - f.start, f.half * 2) * 0.62;
  const top = ctx.createRadialGradient(cx, cy, radius * 0.1, cx, cy, radius);
  top.addColorStop(0, inst.bodyColor);
  top.addColorStop(0.5, inst.bodyColor);
  top.addColorStop(0.82, mix(inst.bodyColor, inst.bodyEdge, 0.55));
  top.addColorStop(1, inst.bodyEdge);
  ctx.save();
  ctx.clip(body);
  ctx.fillStyle = top;
  ctx.fill(body);
  grain(ctx, g, f.start, f.end, f.mid - f.half, f.mid + f.half, '#5a3412', inst.id.length * 97);
  ctx.restore();

  // Binding: a dark edge with a thin cream line.
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#2b1a10';
  ctx.lineWidth = 5;
  ctx.stroke(body);
  ctx.strokeStyle = 'rgba(241, 228, 198, 0.9)';
  ctx.lineWidth = 1.2;
  ctx.stroke(body);

  paintSoundHole(ctx, g, inst, f);
  paintBridge(ctx, g, f);
  paintNeck(ctx, g, inst);
}

function holeCenter(g: Geometry): number {
  return g.strumStart + (g.bridge - g.strumStart) * 0.4;
}

/** A ring of small squares in the red/black of Slavonian embroidery (vez). */
function vezRing(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, size: number): void {
  const n = Math.max(12, Math.floor((2 * Math.PI * r) / (size * 1.35)));
  const pattern = [VEZ_RED, VEZ_RED, INK, CREAM];
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

function paintSoundHole(ctx: CanvasRenderingContext2D, g: Geometry, inst: InstrumentDef, f: BodyFrame): void {
  const a = holeCenter(g);
  const R = Math.min(f.neckHalf * 0.62, (g.bridge - g.strumStart) * 0.3);
  const [x, y] = toXY(g, a, f.mid);

  if (inst.soundHole === 'f-holes') {
    const len = (g.bridge - g.strumStart) * 0.62;
    for (const side of [-1, 1]) {
      const c = f.mid + side * f.half * 0.5;
      const pt = (u: number, v: number): [number, number] => toXY(g, a + u, c + v * side);
      ctx.strokeStyle = '#140b06';
      ctx.lineCap = 'round';
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(...pt(-len / 2, -5));
      ctx.bezierCurveTo(...pt(-len / 6, 6), ...pt(len / 6, -6), ...pt(len / 2, 5));
      ctx.stroke();
      ctx.fillStyle = '#140b06';
      for (const [u, v] of [
        [-len / 2, -5],
        [len / 2, 5],
      ] as const) {
        ctx.beginPath();
        ctx.arc(...pt(u, v), 4, 0, Math.PI * 2);
        ctx.fill();
      }
      // The notches in the middle of an f-hole.
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(...pt(0, -6));
      ctx.lineTo(...pt(0, 6));
      ctx.stroke();
    }
    return;
  }

  if (inst.soundHole === 'holes') {
    // The Srijem prim has about 20 small holes instead of one sound hole: 1 + 6 + 12.
    vezRing(ctx, x, y, R * 1.08, Math.max(2.5, R * 0.07));
    const hole = Math.max(2.5, R * 0.11);
    const rings: [number, number][] = [
      [0, 1],
      [0.42, 6],
      [0.8, 12],
    ];
    for (const [rr, n] of rings) {
      for (let i = 0; i < n; i++) {
        const t = (i / n) * Math.PI * 2 + (n === 12 ? Math.PI / 12 : 0);
        const hx = x + Math.cos(t) * R * rr;
        const hy = y + Math.sin(t) * R * rr;
        ctx.beginPath();
        ctx.arc(hx, hy, hole, 0, Math.PI * 2);
        ctx.fillStyle = '#150c06';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(hx, hy, hole, Math.PI * 0.15, Math.PI * 0.85);
        ctx.strokeStyle = 'rgba(255, 240, 210, 0.45)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    }
    return;
  }

  // One round hole with a rosette: dark ring, embroidery band, cream line.
  const ring = (r: number, color: string, width: number): void => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  };
  ring(R + 13, '#2b1a10', 2);
  vezRing(ctx, x, y, R + 8.5, 3.6);
  ring(R + 4, '#2b1a10', 1.5);
  ring(R + 2, 'rgba(241, 228, 198, 0.9)', 1.2);
  const inside = ctx.createRadialGradient(x, y, R * 0.2, x, y, R);
  inside.addColorStop(0, '#0e0703');
  inside.addColorStop(1, '#2a170c');
  ctx.beginPath();
  ctx.arc(x, y, R, 0, Math.PI * 2);
  ctx.fillStyle = inside;
  ctx.fill();
}

function paintBridge(ctx: CanvasRenderingContext2D, g: Geometry, f: BodyFrame): void {
  // Tailpiece where the strings are pinned, near the end of the body.
  const tail = g.strumEnd - (g.strumEnd - g.bridge) * 0.35;
  const tw = f.neckHalf * 0.7;
  const plate = ctx.createLinearGradient(...toXY(g, tail, f.mid - tw), ...toXY(g, tail, f.mid + tw));
  plate.addColorStop(0, '#8f8a80');
  plate.addColorStop(0.5, '#e9e5dc');
  plate.addColorStop(1, '#8f8a80');
  ctx.fillStyle = plate;
  ctx.beginPath();
  ctx.roundRect(...rect(g, tail - 5, tail + 5, f.mid - tw, f.mid + tw), 4);
  ctx.fill();

  // Ebony bridge with a bone saddle, casting a small shadow.
  ctx.save();
  ctx.shadowColor = 'rgba(40, 20, 5, 0.45)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = '#20140c';
  ctx.beginPath();
  ctx.roundRect(...rect(g, g.bridge - 6, g.bridge + 7, g.neckMin + 2, g.neckMax - 2), 3);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#efe6cf';
  ctx.fillRect(...rect(g, g.bridge - 1, g.bridge + 1, g.neckMin + 4, g.neckMax - 4));
}

function paintNeck(ctx: CanvasRenderingContext2D, g: Geometry, inst: InstrumentDef): void {
  const mid = (g.neckMin + g.neckMax) / 2;
  const boardEnd = g.strumStart + 4;

  // Head: dark wood with a cream inlay line, slightly wider than the neck.
  ctx.save();
  ctx.shadowColor = 'rgba(70, 40, 15, 0.3)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = '#3a2416';
  ctx.beginPath();
  ctx.roundRect(...rect(g, g.headStart, g.nut + 2, g.neckMin - 7, g.neckMax + 7), 14);
  ctx.fill();
  // Fingerboard (ebony-like).
  ctx.fillStyle = '#2a1b13';
  ctx.fillRect(...rect(g, g.nut, boardEnd, g.neckMin, g.neckMax));
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.rect(...rect(g, g.nut, boardEnd, g.neckMin, g.neckMax));
  ctx.clip();
  grain(ctx, g, g.nut, boardEnd, g.neckMin, g.neckMax, '#000000', 7);
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(...rect(g, g.headStart, g.nut + 2, g.neckMin - 7, g.neckMax + 7), 14);
  ctx.clip();
  grain(ctx, g, g.headStart, g.nut, g.neckMin - 7, g.neckMax + 7, '#000000', 11);
  ctx.restore();
  ctx.strokeStyle = 'rgba(241, 228, 198, 0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(...rect(g, g.headStart + 4, g.nut - 3, g.neckMin - 3, g.neckMax + 3), 10);
  ctx.stroke();

  // Cream binding along both edges of the fingerboard.
  ctx.fillStyle = '#efe2c4';
  ctx.fillRect(...rect(g, g.nut, boardEnd, g.neckMin - 1.5, g.neckMin));
  ctx.fillRect(...rect(g, g.nut, boardEnd, g.neckMax, g.neckMax + 1.5));

  // Mother-of-pearl markers.
  for (const m of [5, 7, 10, 12]) {
    if (m > g.frets.length) continue;
    const a = cellCenter(g, m);
    const offsets = m === 12 ? [-g.spacing, g.spacing] : [0];
    for (const o of offsets) {
      const [x, y] = toXY(g, a, mid + o);
      const pearl = ctx.createRadialGradient(x - 1.5, y - 1.5, 0.5, x, y, 6);
      pearl.addColorStop(0, '#ffffff');
      pearl.addColorStop(0.55, '#e3ece9');
      pearl.addColorStop(1, '#d9c3d0');
      ctx.fillStyle = pearl;
      ctx.beginPath();
      ctx.arc(x, y, 5.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Fret wires: nickel silver with a highlight.
  g.frets.forEach((p) => {
    ctx.fillStyle = '#8f8b83';
    ctx.fillRect(...rect(g, p - 1.6, p + 1.6, g.neckMin, g.neckMax));
    ctx.fillStyle = '#f4f2ec';
    ctx.fillRect(...rect(g, p - 1.2, p - 0.2, g.neckMin, g.neckMax));
  });

  // Bone nut.
  ctx.fillStyle = '#efe6d2';
  ctx.fillRect(...rect(g, g.nut - 3, g.nut + 3, g.neckMin - 1.5, g.neckMax + 1.5));
  ctx.fillStyle = 'rgba(120, 100, 70, 0.4)';
  ctx.fillRect(...rect(g, g.nut + 2, g.nut + 3, g.neckMin - 1.5, g.neckMax + 1.5));

  // Tuning pegs where each string ends on the head.
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

  // Fret numbers on the linen beside the neck, where there is room.
  const room = g.neckMin - 2;
  if (room > 16) {
    ctx.font = '500 11px "Fraunces", Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(29, 23, 18, 0.45)';
    g.frets.forEach((_, i) => {
      const [x, y] = toXY(g, cellCenter(g, i + 1), g.neckMin - Math.min(14, room / 2 + 4));
      ctx.fillText(String(i + 1), x, y);
    });
  }
}

/** Blends two #rrggbb colours. */
function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number): number => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}
