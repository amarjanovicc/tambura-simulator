import type { Lang } from '../i18n';
import type { InstrumentDef } from './instruments';
import { pitchClass } from './notes';

export interface ChordDef {
  id: string;
  /** Pitch class of the root, 0 = C. */
  root: number;
  /** Semitones above the root. */
  intervals: readonly number[];
  label: Record<Lang, string>;
}

const MAJOR = [0, 4, 7];
const MINOR = [0, 3, 7];
const DOM7 = [0, 4, 7, 10];

const chord = (id: string, root: number, intervals: number[], hr: string, en: string): ChordDef => ({
  id,
  root,
  intervals,
  label: { hr, en },
});

/**
 * A palette for the keys Slavonian bands play in with the E tuning (E, A, H and their
 * relatives). The first nine are on Shift+1…9.
 */
export const CHORDS: readonly ChordDef[] = [
  chord('E', 4, MAJOR, 'E', 'E'),
  chord('A', 9, MAJOR, 'A', 'A'),
  chord('H7', 11, DOM7, 'H7', 'B7'),
  chord('E7', 4, DOM7, 'E7', 'E7'),
  chord('H', 11, MAJOR, 'H', 'B'),
  chord('Fism', 6, MINOR, 'Fism', 'F#m'),
  chord('Cism', 1, MINOR, 'Cism', 'C#m'),
  chord('D', 2, MAJOR, 'D', 'D'),
  chord('A7', 9, DOM7, 'A7', 'A7'),
  chord('Hm', 11, MINOR, 'Hm', 'Bm'),
  chord('G', 7, MAJOR, 'G', 'G'),
  chord('D7', 2, DOM7, 'D7', 'D7'),
];

/**
 * Chords that songs use outside the E-key palette. They have no buttons, but the band
 * plays them.
 */
export const SONG_CHORDS: readonly ChordDef[] = [
  chord('Em', 4, MINOR, 'Em', 'Em'),
  chord('Fis', 6, MAJOR, 'Fis', 'F#'),
  // B-flat: "B" in Croatian, where H is B natural.
  chord('Bes', 10, MAJOR, 'B', 'B♭'),
  chord('Dm', 2, MINOR, 'Dm', 'Dm'),
];

export function chordById(id: string): ChordDef | undefined {
  return CHORDS.find((c) => c.id === id) ?? SONG_CHORDS.find((c) => c.id === id);
}

/** Fret per course, low to high. `null` means the course is not played. */
export type Voicing = ReadonlyArray<number | null>;

/** Maximum distance between the lowest and highest fretted note of a hand shape. */
const MAX_SPAN = 3;

/**
 * Finds a playable shape for a chord on an instrument. Full voicings strum every course,
 * so each course must sound a chord tone; the shape must contain the root, the third
 * and (for seventh chords) the seventh. Lower positions, open strings and a root in the
 * bass score better.
 */
export function findVoicing(inst: InstrumentDef, ch: ChordDef, maxFret = inst.visibleFrets): Voicing | null {
  const tones = new Set(ch.intervals.map((i) => pitchClass(ch.root + i)));
  const courses = inst.courses.map((c) => c.midi);

  if (inst.chordStyle === 'bass') {
    let best: { course: number; fret: number; midi: number } | null = null;
    courses.forEach((open, course) => {
      for (let fret = 0; fret <= Math.min(maxFret, 7); fret++) {
        const midi = open + fret;
        if (pitchClass(midi) !== ch.root) continue;
        if (!best || midi < best.midi || (midi === best.midi && fret < best.fret)) best = { course, fret, midi };
      }
    });
    if (!best) return null;
    const b: { course: number; fret: number } = best;
    return courses.map((_, i) => (i === b.course ? b.fret : null));
  }

  const candidates = courses.map((open) => {
    const frets: number[] = [];
    for (let f = 0; f <= maxFret; f++) if (tones.has(pitchClass(open + f))) frets.push(f);
    return frets;
  });

  const required = [pitchClass(ch.root)];
  const third = ch.intervals.find((i) => i === 3 || i === 4);
  if (third !== undefined) required.push(pitchClass(ch.root + third));
  const seventh = ch.intervals.find((i) => i === 10 || i === 11);
  if (seventh !== undefined) required.push(pitchClass(ch.root + seventh));

  // Held in an object so TypeScript keeps the type across the recursive closure.
  const result: { best: { frets: number[]; score: number } | null } = { best: null };
  const current: number[] = [];

  const visit = (course: number): void => {
    if (course === courses.length) {
      const score = scoreShape(current, courses, ch, required);
      if (score !== null && (!result.best || score < result.best.score)) result.best = { frets: [...current], score };
      return;
    }
    for (const f of candidates[course] ?? []) {
      current.push(f);
      visit(course + 1);
      current.pop();
    }
  };
  visit(0);

  return result.best ? result.best.frets : null;
}

function scoreShape(frets: number[], courses: number[], ch: ChordDef, required: number[]): number | null {
  const fretted = frets.filter((f) => f > 0);
  if (fretted.length > 0) {
    const span = Math.max(...fretted) - Math.min(...fretted);
    if (span > MAX_SPAN) return null;
  }
  const pcs = new Set(frets.map((f, i) => pitchClass((courses[i] ?? 0) + f)));
  if (!required.every((pc) => pcs.has(pc))) return null;

  const lowest = pitchClass((courses[0] ?? 0) + (frets[0] ?? 0));
  const position = fretted.length ? Math.min(...fretted) : 0;
  const span = fretted.length ? Math.max(...fretted) - position : 0;
  const sum = frets.reduce((a, b) => a + b, 0);
  return position * 4 + span * 1.5 + sum * 0.5 + fretted.length * 0.5 + (lowest === ch.root ? 0 : 3);
}

export function voicingsFor(inst: InstrumentDef): Map<string, Voicing> {
  const map = new Map<string, Voicing>();
  for (const ch of [...CHORDS, ...SONG_CHORDS]) {
    const v = findVoicing(inst, ch);
    if (v) map.set(ch.id, v);
  }
  return map;
}
