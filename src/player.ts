import type { AudioEngine } from './audio/engine';
import { CHORDS, type Voicing, voicingsFor } from './music/chords';
import type { InstrumentDef } from './music/instruments';

export interface PluckEvent {
  course: number;
  fret: number;
  velocity: number;
  delay: number;
}

const TREMOLO_MS = 72; // ~14 strokes per second

/**
 * Musical state between input and sound: which instrument, which chord shape, which
 * frets are held (by which finger/key), and the tremolo repeaters.
 */
export class Player {
  inst: InstrumentDef;
  voicings: Map<string, Voicing>;
  chordId: string | null = null;
  tremolo = false;

  /** Insertion-ordered: the latest hold on a course wins, like the highest finger on a string. */
  private readonly holds = new Map<string, { course: number; fret: number }>();
  private readonly repeaters = new Map<string, ReturnType<typeof setInterval>>();
  private readonly bandTimes = new Map<number, number>();
  private readonly changeListeners = new Set<() => void>();
  private readonly pluckListeners = new Set<(e: PluckEvent) => void>();

  constructor(
    private readonly engine: AudioEngine,
    inst: InstrumentDef,
  ) {
    this.inst = inst;
    this.voicings = voicingsFor(inst);
    engine.setInstrument(inst);
  }

  onChange(fn: () => void): void {
    this.changeListeners.add(fn);
  }

  onPluck(fn: (e: PluckEvent) => void): void {
    this.pluckListeners.add(fn);
  }

  setInstrument(inst: InstrumentDef): void {
    this.stopAllRepeats();
    this.holds.clear();
    this.engine.stopAll('user');
    this.inst = inst;
    this.voicings = voicingsFor(inst);
    if (this.chordId && !this.voicings.has(this.chordId)) this.chordId = null;
    this.engine.setInstrument(inst);
    this.prewarm();
    this.emitChange();
  }

  prewarm(): void {
    const notes: { course: number; midi: number }[] = [];
    this.inst.courses.forEach((c, course) => {
      const frets = new Set<number>([0, 1, 2, 3, 4, 5, 7]);
      for (const v of this.voicings.values()) {
        const f = v[course];
        if (f !== null && f !== undefined) frets.add(f);
      }
      for (const f of frets) notes.push({ course, midi: c.midi + f });
    });
    this.engine.prewarm(notes);
  }

  heldFret(course: number): number | null {
    let fret: number | null = null;
    for (const h of this.holds.values()) if (h.course === course) fret = h.fret;
    return fret;
  }

  isHeld(course: number): boolean {
    return this.heldFret(course) !== null;
  }

  get voicing(): Voicing | null {
    return this.chordId ? (this.voicings.get(this.chordId) ?? null) : null;
  }

  /** The fret a course sounds at now, or null when the chord mutes it. */
  fretFor(course: number): number | null {
    const held = this.heldFret(course);
    if (held !== null) return held;
    const v = this.voicing;
    if (v) return v[course] ?? null;
    return 0;
  }

  midiFor(course: number): number | null {
    const fret = this.fretFor(course);
    const c = this.inst.courses[course];
    return fret === null || !c ? null : c.midi + fret;
  }

  pluck(course: number, velocity: number, delay = 0): void {
    const c = this.inst.courses[course];
    const fret = this.fretFor(course);
    if (!c || fret === null) return;
    const n = this.inst.courses.length;
    const pan = n > 1 ? (course / (n - 1) - 0.5) * 0.35 : 0;
    this.engine.pluck({ course, midi: c.midi + fret, velocity, doubled: c.doubled, delay, pan });
    for (const fn of this.pluckListeners) fn({ course, fret, velocity, delay });
  }

  /** A finger or key presses a fret: hold it and sound it. */
  press(source: string, course: number, fret: number, velocity: number): void {
    this.holds.delete(source);
    this.holds.set(source, { course, fret });
    this.pluck(course, velocity);
    this.emitChange();
    if (this.tremolo) {
      let alt = false;
      this.repeat(source, () => {
        alt = !alt;
        this.pluck(course, alt ? 0.55 : 0.68);
      });
    }
  }

  /**
   * Shows a note the band plays on this instrument: the fret dot moves there and, when
   * the note is audible, the string vibrates. The sound itself comes from the band.
   */
  showBandNote(course: number, fret: number, velocity: number, audible: boolean): void {
    // Lift fingers from strings the band left more than a moment ago, so a melody shows
    // one note at a time while a strummed chord keeps all its dots.
    const now = performance.now();
    for (const [c, at] of this.bandTimes) {
      if (c !== course && now - at > 120) {
        this.holds.delete(`band:${c}`);
        this.bandTimes.delete(c);
      }
    }
    this.bandTimes.set(course, now);
    const source = `band:${course}`;
    this.holds.delete(source);
    this.holds.set(source, { course, fret });
    this.emitChange();
    if (audible) for (const fn of this.pluckListeners) fn({ course, fret, velocity, delay: 0 });
  }

  clearBand(): void {
    this.bandTimes.clear();
    for (const key of [...this.holds.keys()]) if (key.startsWith('band:')) this.holds.delete(key);
    this.emitChange();
  }

  release(source: string): void {
    this.stopRepeat(source);
    if (this.holds.delete(source)) this.emitChange();
  }

  releaseAll(): void {
    this.stopAllRepeats();
    this.holds.clear();
    this.emitChange();
  }

  /** Down = low to high strings. `spacing` is seconds between strings. */
  strum(direction: 'down' | 'up', velocity: number, spacing = 0.014): void {
    const order = this.inst.courses.map((_, i) => i);
    if (direction === 'up') order.reverse();
    let k = 0;
    for (const course of order) {
      if (this.fretFor(course) === null) continue;
      // Up-strums are lighter and catch the high strings first.
      this.pluck(course, direction === 'up' ? velocity * 0.8 : velocity, k * spacing);
      k++;
    }
  }

  /** Space/arrow key strum that keeps going (down, up, down…) while tremolo is on. */
  strumHeld(source: string, direction: 'down' | 'up', velocity: number): void {
    this.strum(direction, velocity);
    if (!this.tremolo) return;
    let dir = direction;
    this.repeat(source, () => {
      dir = dir === 'down' ? 'up' : 'down';
      this.strum(dir, 0.6, 0.008);
    }, TREMOLO_MS * 1.6);
  }

  selectChord(id: string | null, play: boolean): void {
    this.chordId = id && this.voicings.has(id) ? id : null;
    this.emitChange();
    if (play && this.chordId) this.strum('down', 0.8);
  }

  cycleChord(step: 1 | -1): void {
    const ids = CHORDS.map((c) => c.id).filter((id) => this.voicings.has(id));
    const i = this.chordId ? ids.indexOf(this.chordId) : step === 1 ? -1 : ids.length;
    const next = ids[(i + step + ids.length) % ids.length] ?? null;
    this.selectChord(next, false);
  }

  setTremolo(on: boolean): void {
    this.tremolo = on;
    if (!on) this.stopAllRepeats();
    this.emitChange();
  }

  stopRepeat(source: string): void {
    const id = this.repeaters.get(source);
    if (id !== undefined) clearInterval(id);
    this.repeaters.delete(source);
  }

  private repeat(source: string, fn: () => void, ms = TREMOLO_MS): void {
    this.stopRepeat(source);
    this.repeaters.set(source, setInterval(fn, ms));
  }

  private stopAllRepeats(): void {
    for (const id of this.repeaters.values()) clearInterval(id);
    this.repeaters.clear();
  }

  private emitChange(): void {
    for (const fn of this.changeListeners) fn();
  }
}
