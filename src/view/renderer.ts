import type { Lang } from '../i18n';
import type { InstrumentDef } from '../music/instruments';
import { keyForFret } from '../music/keymap';
import { noteName } from '../music/notes';
import type { Player } from '../player';
import { type Geometry, cellCenter, computeGeometry, stopPosition, toXY } from './geometry';
import { CREAM, INK, VEZ_RED, paintInstrument, tailAnchor } from './instrument-art';

export interface ViewOptions {
  lang: Lang;
  showKeys: boolean;
  showNotes: boolean;
}

interface Vibration {
  amp: number;
  start: number;
}

const DECAY_S = 0.9;
const SERIF = '"Fraunces", Georgia, serif';

/**
 * Draws the instrument on a canvas and animates the strings after each pluck. The parts
 * that never move are painted once into an offscreen layer; each frame only adds the
 * strings and the finger marks.
 */
export class Renderer {
  geometry: Geometry;
  private readonly ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private readonly vib: Vibration[] = [];
  private frame = 0;
  private dirty = true;
  private layer: HTMLCanvasElement | null = null;
  private layerKey = '';

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
    // Repaint once the web font has loaded (the first paint may use the fallback).
    void document.fonts?.ready.then(() => {
      this.layerKey = '';
      this.invalidate();
    });
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

  private staticLayer(inst: InstrumentDef): HTMLCanvasElement {
    const g = this.geometry;
    const key = `${inst.id}:${this.canvas.width}x${this.canvas.height}:${g.frets.length}`;
    if (this.layer && this.layerKey === key) return this.layer;
    const layer = this.layer ?? document.createElement('canvas');
    layer.width = this.canvas.width;
    layer.height = this.canvas.height;
    const lctx = layer.getContext('2d')!;
    lctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    lctx.clearRect(0, 0, g.width, g.height);
    paintInstrument(lctx, g, inst);
    this.layer = layer;
    this.layerKey = key;
    return layer;
  }

  private draw(now: number): void {
    const { ctx } = this;
    const inst = this.player.inst;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.staticLayer(inst), 0, 0);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawStrings(inst, now);
    this.drawMarks(inst);
  }

  private drawStrings(inst: InstrumentDef, now: number): void {
    const g = this.geometry;
    const { along: tail, spread } = tailAnchor(g, inst);
    const mid = (g.neckMin + g.neckMax) / 2;
    inst.courses.forEach((course, i) => {
      const cross = g.strings[i] ?? 0;
      const fret = this.player.fretFor(i) ?? 0;
      const stop = stopPosition(g, fret);
      const v = this.vib[i];
      const age = v ? (now - v.start) / 1000 : Infinity;
      const amp = v && age < DECAY_S * 4 ? v.amp * Math.exp(-age / DECAY_S) : 0;
      // Thicker strings for lower courses; the berde's are heavy.
      const width = 1 + (course.gauge / 0.9) * 1.6 * (inst.id === 'berde' ? 0.45 : 1);
      const offsets = course.doubled ? [-2.6, 2.6] : [0];

      for (const off of offsets) {
        const c = cross + off;
        const w = course.doubled ? width * 0.85 : width;
        // Head to the stopping point: static, a little dimmer.
        this.string(g.headStart + 7, stop, c, 0, w, course.wound, 0.75);
        // The vibrating length.
        const phase = Math.sin(now * 0.09 * (1 + i * 0.13) + off);
        this.string(stop, g.bridge, c, amp * phase, w, course.wound, 1);
        // Bridge to the tailpiece, where the strings close up.
        this.string(g.bridge, tail, c, 0, w, course.wound, 0.9, mid + (c - mid) * spread);
      }
    });
  }

  /** One string segment: a shadow, the steel, and a winding texture on wound strings. */
  private string(
    a0: number,
    a1: number,
    cross: number,
    disp: number,
    width: number,
    wound: boolean,
    alpha: number,
    crossEnd = cross,
  ): void {
    const { ctx, geometry: g } = this;
    const path = new Path2D();
    const steps = Math.abs(disp) > 0.2 ? 16 : 1;
    for (let s = 0; s <= steps; s++) {
      const u = s / steps;
      const [x, y] = toXY(g, a0 + (a1 - a0) * u, cross + (crossEnd - cross) * u + disp * Math.sin(Math.PI * u));
      if (s === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    }
    ctx.globalAlpha = alpha;
    ctx.lineCap = 'round';
    ctx.save();
    ctx.translate(g.orientation === 'h' ? 0 : 1.2, g.orientation === 'h' ? 1.2 : 0);
    ctx.strokeStyle = 'rgba(40, 22, 8, 0.35)';
    ctx.lineWidth = width + 0.6;
    ctx.stroke(path);
    ctx.restore();
    ctx.strokeStyle = wound ? '#bdb9b0' : '#e4e7ea';
    ctx.lineWidth = width;
    ctx.stroke(path);
    if (wound) {
      ctx.setLineDash([1, 1.6]);
      ctx.strokeStyle = '#6f6b63';
      ctx.lineWidth = width;
      ctx.stroke(path);
      ctx.setLineDash([]);
    } else {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.lineWidth = Math.max(0.5, width * 0.35);
      ctx.stroke(path);
    }
    ctx.globalAlpha = 1;
  }

  private drawMarks(inst: InstrumentDef): void {
    const { ctx, geometry: g } = this;
    const { lang, showKeys, showNotes } = this.opts;
    const r = Math.max(11, Math.min(18, g.spacing * 0.26));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (showKeys) {
      ctx.font = '600 10px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(251, 243, 228, 0.55)';
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
        // A muted string: a small cream disc with a red cross, readable on the dark head.
        ctx.beginPath();
        ctx.arc(x, y, r * 0.62, 0, Math.PI * 2);
        ctx.fillStyle = CREAM;
        ctx.fill();
        ctx.font = `700 ${Math.round(r * 0.95)}px ${SERIF}`;
        ctx.fillStyle = VEZ_RED;
        ctx.fillText('×', x, y + 0.5);
        return;
      }
      const isOpen = fret === 0;
      const radius = isOpen && !held ? r * 0.85 : r;
      ctx.save();
      ctx.shadowColor = 'rgba(30, 15, 5, 0.35)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetY = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = held ? VEZ_RED : isOpen ? CREAM : INK;
      ctx.fill();
      ctx.restore();
      if (isOpen && !held) {
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.4;
        ctx.stroke();
      } else {
        // A thin cream ring, like an embroidered edge.
        ctx.beginPath();
        ctx.arc(x, y, radius - 2.5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(251, 243, 228, 0.35)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      if (showNotes || isOpen) {
        ctx.font = `600 ${Math.round(radius * 0.78)}px ${SERIF}`;
        ctx.fillStyle = isOpen && !held ? INK : CREAM;
        ctx.fillText(noteName(course.midi + fret, lang), x, y + 0.5);
      }
    });
  }
}
