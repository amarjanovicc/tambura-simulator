import type { AudioEngine } from '../audio/engine';
import { CHORDS } from '../music/chords';
import { chordIndexForKey, fretForKey } from '../music/keymap';
import type { Player } from '../player';
import { crossedStrings, hitTest, toAlongCross } from '../view/geometry';
import type { Renderer } from '../view/renderer';

interface PointerState {
  zone: 'neck' | 'strum';
  source: string;
  lastCross: number;
  lastTime: number;
  cell: { course: number; fret: number } | null;
}

/** Pointer (mouse, touch, pen) and keyboard input mapped to the player. */
export class Controller {
  private readonly pointers = new Map<number, PointerState>();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly renderer: Renderer,
    private readonly player: Player,
    private readonly engine: AudioEngine,
    private readonly onGesture: () => void,
  ) {
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    canvas.addEventListener('pointerup', (e) => this.up(e));
    canvas.addEventListener('pointercancel', (e) => this.up(e));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => this.keyDown(e));
    window.addEventListener('keyup', (e) => this.keyUp(e));
    window.addEventListener('blur', () => player.releaseAll());
    // iOS only unlocks audio on touchend/click, not on touchstart.
    for (const type of ['touchend', 'click'] as const) {
      window.addEventListener(type, () => this.gesture(), { passive: true });
    }
  }

  private gesture(): void {
    this.engine.unlock();
    this.onGesture();
  }

  private point(e: PointerEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private down(e: PointerEvent): void {
    this.gesture();
    e.preventDefault();
    // preventDefault keeps focus where it was; release it so keys reach the instrument.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    const { x, y } = this.point(e);
    const g = this.renderer.geometry;
    const hit = hitTest(g, x, y);
    if (!hit) return;
    this.canvas.setPointerCapture(e.pointerId);
    const source = `p${e.pointerId}`;
    const { cross } = toAlongCross(g, x, y);

    if (hit.zone === 'neck') {
      this.pointers.set(e.pointerId, { zone: 'neck', source, lastCross: cross, lastTime: e.timeStamp, cell: hit });
      this.player.press(source, hit.course, hit.fret, 0.72);
      return;
    }

    this.pointers.set(e.pointerId, { zone: 'strum', source, lastCross: cross, lastTime: e.timeStamp, cell: null });
    // A tap right on a string plucks it.
    const near = g.strings.findIndex((s) => Math.abs(s - cross) < Math.min(14, g.spacing * 0.3));
    if (near >= 0) this.player.pluck(near, 0.7);
  }

  private move(e: PointerEvent): void {
    const st = this.pointers.get(e.pointerId);
    if (!st) return;
    const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    for (const ev of events.length ? events : [e]) this.moveOne(st, ev);
  }

  private moveOne(st: PointerState, e: PointerEvent): void {
    const g = this.renderer.geometry;
    const { x, y } = this.point(e);
    const { cross } = toAlongCross(g, x, y);

    if (st.zone === 'neck') {
      const hit = hitTest(g, x, y);
      if (hit?.zone !== 'neck') return;
      if (st.cell && hit.course === st.cell.course && hit.fret === st.cell.fret) return;
      st.cell = { course: hit.course, fret: hit.fret };
      // Sliding along a string or onto another one: a lighter, legato note.
      this.player.press(st.source, hit.course, hit.fret, 0.55);
      return;
    }

    const dt = Math.max(1, e.timeStamp - st.lastTime);
    const crossed = crossedStrings(g, st.lastCross, cross);
    if (crossed.length) {
      const speed = Math.abs(cross - st.lastCross) / dt; // px per ms
      const velocity = Math.min(1, 0.3 + speed * 0.35);
      for (const { course, t } of crossed) {
        // Keep the timing of a fast strum: strings are hit at different moments.
        this.player.pluck(course, velocity, (t * Math.min(dt, 40)) / 1000);
      }
    }
    st.lastCross = cross;
    st.lastTime = e.timeStamp;
  }

  private up(e: PointerEvent): void {
    const st = this.pointers.get(e.pointerId);
    if (!st) return;
    this.pointers.delete(e.pointerId);
    this.player.release(st.source);
  }

  private keyDown(e: KeyboardEvent): void {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('dialog, textarea, select, input[type="text"]')) return;
    // The volume slider keeps its arrow keys.
    if (target?.matches('input[type="range"]') && e.code.startsWith('Arrow')) return;
    // Escape closes an open popover (the settings) before it clears the chord.
    if (e.code === 'Escape' && document.querySelector(':popover-open')) return;

    const handled = this.handleKey(e);
    if (handled) {
      e.preventDefault();
      this.gesture();
    }
  }

  private handleKey(e: KeyboardEvent): boolean {
    const p = this.player;
    if (e.code === 'Space' || e.code === 'ArrowDown' || e.code === 'ArrowUp') {
      if (!e.repeat) {
        const dir = e.code === 'ArrowUp' || (e.code === 'Space' && e.shiftKey) ? 'up' : 'down';
        p.strumHeld(`k${e.code}`, dir, 0.8);
      }
      return true;
    }
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      p.cycleChord(e.code === 'ArrowRight' ? 1 : -1);
      return true;
    }
    if (e.code === 'Escape') {
      p.selectChord(null, false);
      return true;
    }
    if (e.shiftKey) {
      const index = chordIndexForKey(e.code);
      const chord = index === null ? undefined : CHORDS[index];
      if (chord) {
        if (!e.repeat) p.selectChord(chord.id, true);
        return true;
      }
    }
    // Only frets that are on screen (short screens show fewer).
    const fk = fretForKey(e.code, p.inst.courses.length, this.renderer.geometry.frets.length);
    if (fk) {
      if (!e.repeat) p.press(`k${e.code}`, fk.course, fk.fret, 0.8);
      return true;
    }
    return false;
  }

  private keyUp(e: KeyboardEvent): void {
    this.player.release(`k${e.code}`);
  }
}
