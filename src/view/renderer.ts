import type { Lang } from '../i18n';
import type { InstrumentDef } from '../music/instruments';
import { keyForFret } from '../music/keymap';
import { noteName } from '../music/notes';
import type { Player } from '../player';
import { type Geometry, cellCenter, computeGeometry, stopPosition, toXY } from './geometry';

export interface ViewOptions {
  lang: Lang;
  showKeys: boolean;
  showNotes: boolean;
}

interface Vibration {
  amp: number;
  start: number;
}

const MARKERS = [5, 7, 10, 12];
const DECAY_S = 0.9;

/** Draws the instrument on a canvas and animates the strings after each pluck. */
export class Renderer {
  geometry: Geometry;
  private readonly ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private readonly vib: Vibration[] = [];
  private frame = 0;
  private dirty = true;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly player: Player,
    private opts: ViewOptions,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not supported');
    this.ctx = ctx;
    this.geometry = computeGeometry(1, 1, 4, 12);
    player.onPluck((e) => {
      const ms = e.delay * 1000;
      const kick = (): void => {
        this.vib[e.course] = { amp: 2 + 6 * e.velocity, start: performance.now() };
        this.invalidate();
      };
      if (ms > 1) setTimeout(kick, ms);
      else kick();
    });
    player.onChange(() => this.invalidate());
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }

  setOptions(opts: ViewOptions): void {
    this.opts = opts;
    this.invalidate();
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
    this.relayout();
  }

  relayout(): void {
    const rect = this.canvas.getBoundingClientRect();
    const inst = this.player.inst;
    this.geometry = computeGeometry(rect.width, rect.height, inst.courses.length, inst.visibleFrets);
    this.invalidate();
  }

  invalidate(): void {
    this.dirty = true;
    if (!this.frame) this.frame = requestAnimationFrame(() => this.tick());
  }

  private tick(): void {
    this.frame = 0;
    const now = performance.now();
    const vibrating = this.vib.some((v) => v && (now - v.start) / 1000 < DECAY_S * 4);
    if (this.dirty || vibrating) this.draw(now);
    this.dirty = false;
    if (vibrating) this.frame = requestAnimationFrame(() => this.tick());
  }

  private draw(now: number): void {
    const { ctx, geometry: g } = this;
    const inst = this.player.inst;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, g.width, g.height);
    this.drawBody(inst);
    this.drawNeck();
    this.drawStrings(inst, now);
    this.drawMarks(inst);
  }

  private rect(a0: number, a1: number, c0: number, c1: number): [number, number, number, number] {
    const [x0, y0] = toXY(this.geometry, a0, c0);
    const [x1, y1] = toXY(this.geometry, a1, c1);
    return [Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0)];
  }

  /** A gradient across the strings (from cross c0 to c1). */
  private gradient(a: number, c0: number, c1: number, stops: [number, string][]): CanvasGradient {
    const g = this.geometry;
    const [x0, y0] = toXY(g, a, c0);
    const [x1, y1] = toXY(g, a, c1);
    const grad = this.ctx.createLinearGradient(x0, y0, x1, y1);
    for (const [o, col] of stops) grad.addColorStop(o, col);
    return grad;
  }

  private drawBody(inst: InstrumentDef): void {
    const { ctx, geometry: g } = this;
    const a0 = g.strumStart - g.spacing * 0.6;
    const a1 = g.strumEnd;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(...this.rect(a0, a1, g.bodyMin, g.bodyMax), Math.min(60, (g.bodyMax - g.bodyMin) * 0.35));
    ctx.fillStyle = this.gradient(a0, g.bodyMin, g.bodyMax, [
      [0, shade(inst.bodyColor, 0.75)],
      [0.5, inst.bodyColor],
      [1, shade(inst.bodyColor, 0.7)],
    ]);
    ctx.fill();
    ctx.strokeStyle = 'rgba(30, 15, 5, 0.6)';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Sound hole(s), between the neck and the bridge.
    const holeAlong = g.strumStart + (g.bridge - g.strumStart) * 0.42;
    const mid = (g.neckMin + g.neckMax) / 2;
    const r = Math.min((g.neckMax - g.neckMin) * 0.36, (g.bridge - g.strumStart) * 0.32);
    ctx.fillStyle = '#1b0f08';
    if (inst.soundHole === 'round') {
      const [x, y] = toXY(g, holeAlong, mid);
      for (const [rr, col] of [
        [r + 9, '#3a2412'],
        [r + 5, '#e8d4a8'],
        [r + 3, '#2b1a0c'],
      ] as const) {
        ctx.beginPath();
        ctx.arc(x, y, rr, 0, Math.PI * 2);
        ctx.fillStyle = col;
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = '#1b0f08';
      ctx.fill();
    } else if (inst.soundHole === 'holes') {
      const small = Math.max(3, r * 0.2);
      const pts = [[0, 0], ...Array.from({ length: 6 }, (_, i) => [Math.cos((i * Math.PI) / 3), Math.sin((i * Math.PI) / 3)])];
      for (const [u, v] of pts) {
        const [x, y] = toXY(g, holeAlong + (u ?? 0) * r * 0.6, mid + (v ?? 0) * r * 0.6);
        ctx.beginPath();
        ctx.arc(x, y, small, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      for (const side of [-1, 1]) {
        const c = mid + side * (g.neckMax - g.neckMin) * 0.62;
        const [x, y] = toXY(g, holeAlong, c);
        const [rx, ry] = g.orientation === 'h' ? [r * 0.9, 4] : [4, r * 0.9];
        ctx.beginPath();
        ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Bridge.
    ctx.fillStyle = '#2a170b';
    ctx.beginPath();
    ctx.roundRect(...this.rect(g.bridge - 4, g.bridge + 6, g.neckMin + 4, g.neckMax - 4), 3);
    ctx.fill();
    ctx.fillStyle = '#efe3c8';
    ctx.fillRect(...this.rect(g.bridge - 1, g.bridge + 1, g.neckMin + 6, g.neckMax - 6));
    ctx.restore();
  }

  private drawNeck(): void {
    const { ctx, geometry: g } = this;
    // Head.
    ctx.fillStyle = this.gradient(g.headStart, g.neckMin, g.neckMax, [
      [0, '#3b2414'],
      [0.5, '#5a3820'],
      [1, '#3b2414'],
    ]);
    ctx.beginPath();
    ctx.roundRect(...this.rect(g.headStart, g.nut, g.neckMin - 6, g.neckMax + 6), 10);
    ctx.fill();
    // Fingerboard.
    ctx.fillStyle = this.gradient(g.nut, g.neckMin, g.neckMax, [
      [0, '#24140b'],
      [0.5, '#3a2213'],
      [1, '#24140b'],
    ]);
    ctx.fillRect(...this.rect(g.nut, g.strumStart, g.neckMin, g.neckMax));
    // Nut.
    ctx.fillStyle = '#efe6d2';
    ctx.fillRect(...this.rect(g.nut - 3, g.nut + 3, g.neckMin, g.neckMax));
    // Fret markers.
    const mid = (g.neckMin + g.neckMax) / 2;
    ctx.fillStyle = 'rgba(240, 230, 210, 0.55)';
    for (const m of MARKERS) {
      if (m > g.frets.length) continue;
      const a = cellCenter(g, m);
      const offsets = m === 12 ? [-g.spacing, g.spacing] : [0];
      for (const o of offsets) {
        const [x, y] = toXY(g, a, mid + o);
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Fret wires and numbers.
    ctx.font = '600 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    g.frets.forEach((p, i) => {
      ctx.fillStyle = '#b9b4ab';
      ctx.fillRect(...this.rect(p - 1.5, p + 1.5, g.neckMin, g.neckMax));
      ctx.fillStyle = 'rgba(240, 230, 210, 0.45)';
      const [x, y] = toXY(g, cellCenter(g, i + 1), g.neckMin - 8);
      if (g.neckMin > 14) ctx.fillText(String(i + 1), x, y);
    });
  }

  private drawStrings(inst: InstrumentDef, now: number): void {
    const g = this.geometry;
    const n = inst.courses.length;
    inst.courses.forEach((course, i) => {
      const cross = g.strings[i] ?? 0;
      const fret = this.player.fretFor(i) ?? 0;
      const stop = stopPosition(g, fret);
      const v = this.vib[i];
      const age = v ? (now - v.start) / 1000 : Infinity;
      const amp = v && age < DECAY_S * 4 ? v.amp * Math.exp(-age / DECAY_S) : 0;
      const width = 1.2 + ((n - 1 - i) / Math.max(1, n - 1)) * 2.2 + (inst.id === 'berde' ? 1.5 : 0);
      const wound = i < n - 1 || inst.id === 'berde';
      const color = wound ? '#d4b483' : '#e6e8ea';
      const offsets = course.doubled ? [-2.6, 2.6] : [0];

      for (const off of offsets) {
        // Dead part of the string between the head and the stopping point.
        this.line(g.headStart + 6, stop, cross + off, 0, Math.max(1, width * 0.8), 'rgba(200, 190, 170, 0.35)');
        const phase = Math.sin(now * 0.09 * (1 + i * 0.13) + off);
        this.line(stop, g.bridge, cross + off, amp * phase, course.doubled ? width * 0.85 : width, color);
      }
    });
  }

  /** A string segment along the neck; `disp` bends it into half a sine (vibration). */
  private line(a0: number, a1: number, cross: number, disp: number, width: number, color: string): void {
    const { ctx, geometry: g } = this;
    ctx.beginPath();
    const steps = Math.abs(disp) > 0.2 ? 16 : 1;
    for (let s = 0; s <= steps; s++) {
      const u = s / steps;
      const [x, y] = toXY(g, a0 + (a1 - a0) * u, cross + disp * Math.sin(Math.PI * u));
      if (s === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  private drawMarks(inst: InstrumentDef): void {
    const { ctx, geometry: g } = this;
    const { lang, showKeys, showNotes } = this.opts;
    const r = Math.max(10, Math.min(17, g.spacing * 0.26));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (showKeys) {
      ctx.font = '600 10px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(250, 240, 220, 0.5)';
      inst.courses.forEach((_, i) => {
        for (let f = 0; f <= g.frets.length; f++) {
          const label = keyForFret(i, f);
          if (!label) continue;
          const [x, y] = toXY(g, cellCenter(g, f), (g.strings[i] ?? 0) + g.spacing * 0.3);
          ctx.fillText(label, x, y);
        }
      });
    }

    inst.courses.forEach((course, i) => {
      const cross = g.strings[i] ?? 0;
      const fret = this.player.fretFor(i);
      const held = this.player.isHeld(i);
      const [x, y] = toXY(g, cellCenter(g, fret ?? 0), cross);
      if (fret === null) {
        ctx.font = '700 16px system-ui, sans-serif';
        ctx.fillStyle = '#e46a4f';
        ctx.fillText('×', x, y);
        return;
      }
      const isOpen = fret === 0;
      ctx.beginPath();
      ctx.arc(x, y, isOpen ? r * 0.85 : r, 0, Math.PI * 2);
      if (isOpen && !held) {
        ctx.fillStyle = 'rgba(20, 10, 4, 0.75)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(240, 220, 180, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else {
        ctx.fillStyle = held ? '#e46a4f' : '#f2d27a';
        ctx.fill();
      }
      if (showNotes || isOpen) {
        ctx.font = `700 ${Math.round(r * 0.75)}px system-ui, sans-serif`;
        ctx.fillStyle = isOpen && !held ? '#f3e6cc' : '#2a1608';
        ctx.fillText(noteName(course.midi + fret, lang), x, y + 0.5);
      }
    });
  }
}

/** Multiplies a #rrggbb colour's channels by k. */
function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s: number): number => Math.min(255, Math.round(((n >> s) & 255) * k));
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}
