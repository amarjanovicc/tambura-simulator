import { CHORDS, findVoicing } from './chords';
import { type InstrumentDef, type InstrumentId, getInstrument } from './instruments';
import { pitchClass } from './notes';
import type { Song } from './songs';

export interface BandEvent {
  inst: InstrumentId;
  course: number;
  fret: number;
  midi: number;
  /** Seconds from the start of the song. */
  time: number;
  velocity: number;
  /** Damp after this many seconds. */
  staccato?: number;
  /** "second" for the second player of the same instrument (druga prima). */
  part?: 'second';
}

const TREMOLO_S = 0.068;
const STRUM_S = 0.009;
const MAJOR = [0, 2, 4, 5, 7, 9, 11];

/** Where to play a note: the course that needs the lowest fret, within the visible frets. */
export function placeNote(inst: InstrumentDef, midi: number): { course: number; fret: number } | null {
  let best: { course: number; fret: number } | null = null;
  inst.courses.forEach((c, course) => {
    const fret = midi - c.midi;
    if (fret < 0 || fret > inst.visibleFrets) return;
    if (!best || fret < best.fret) best = { course, fret };
  });
  return best;
}

/** The note a diatonic third below, in a major key (chromatic notes drop a minor third). */
export function thirdBelow(midi: number, tonic: number): number {
  const scale = MAJOR.map((i) => pitchClass(tonic + i));
  const degree = scale.indexOf(pitchClass(midi));
  if (degree < 0) return midi - 3;
  const target = scale[(degree + 5) % 7]!;
  return midi - ((pitchClass(midi) - target + 12) % 12);
}

/**
 * Turns a song into timed notes for the whole band:
 * - prim plays the melody, tremolo on long notes;
 * - a second prim (druga prima, kontrašica) plays a third below in the same octave:
 *   the two-voice sound of a tamburica band;
 * - bas-prim doubles the melody an octave lower, for depth;
 * - kontra strums short chords on the off-beats ("ćuć");
 * - berde plays root and fifth on the beats.
 */
export function arrange(song: Song): { events: BandEvent[]; duration: number } {
  const beat = 60 / song.bpm;
  const eighth = beat / 2;
  const prim = getInstrument('prim');
  const basprim = getInstrument('basprim');
  const kontra = getInstrument('kontra');
  const berde = getInstrument('berde');
  const events: BandEvent[] = [];

  const add = (
    inst: InstrumentDef,
    midi: number,
    time: number,
    velocity: number,
    staccato?: number,
    part?: 'second',
  ): void => {
    const place = placeNote(inst, midi);
    if (!place) throw new Error(`${inst.id} cannot play MIDI ${midi}`);
    events.push({
      inst: inst.id,
      ...place,
      midi,
      time,
      velocity,
      ...(staccato !== undefined ? { staccato } : {}),
      ...(part ? { part } : {}),
    });
  };

  const melodyNote = (
    inst: InstrumentDef,
    midi: number,
    time: number,
    length: number,
    tremolo: boolean,
    gain: number,
    part?: 'second',
  ): void => {
    if (!tremolo) {
      add(inst, midi, time, 0.8 * gain, undefined, part);
      return;
    }
    // A second player's tremolo is never in lockstep with the first.
    const offset = part ? TREMOLO_S * 0.4 : 0;
    for (let s = offset, k = 0; s < length - 0.03; s += TREMOLO_S * (part ? 1.07 : 1), k++) {
      add(inst, midi, time + s, (k % 2 ? 0.55 : 0.72) * gain, undefined, part);
    }
  };

  const voices = (midi: number, time: number, length: number, tremolo: boolean): void => {
    melodyNote(prim, midi, time, length, tremolo, 1);
    melodyNote(prim, thirdBelow(midi, song.tonic), time, length, tremolo, 0.78, 'second');
    melodyNote(basprim, midi - 12, time, length, tremolo, 0.8);
  };

  const rhythm = (chordId: string, time: number, last: boolean): void => {
    const chord = CHORDS.find((c) => c.id === chordId);
    if (!chord) throw new Error(`Unknown chord ${chordId}`);
    const shape = findVoicing(kontra, chord);
    const bass = findVoicing(berde, chord);
    const rootIndex = bass?.findIndex((f) => f !== null) ?? -1;
    if (!shape || !bass || rootIndex < 0) throw new Error(`No shape for ${chordId}`);
    const root = berde.courses[rootIndex]!.midi + bass[rootIndex]!;
    const fifth = root - 5 >= berde.courses[0]!.midi ? root - 5 : root + 7;

    add(berde, root, time, 0.85, last ? undefined : beat * 0.8);
    if (!last) add(berde, fifth, time + beat, 0.8, beat * 0.8);

    const strums = last ? [time] : [time + eighth, time + beat + eighth];
    for (const at of strums) {
      shape.forEach((fret, course) => {
        if (fret === null) return;
        const midi = kontra.courses[course]!.midi + fret;
        add(kontra, midi, at + course * STRUM_S, last ? 0.8 : 0.7, last ? undefined : 0.15);
      });
    }
  };

  const barLength = 2 * beat;
  let t = 0;
  for (let i = 0; i < song.introBars; i++, t += barLength) rhythm(song.bars[0]?.chord ?? song.ending.chord, t, false);
  for (let r = 0; r < song.repeats; r++) {
    for (const bar of song.bars) {
      rhythm(bar.chord, t, false);
      let u = t;
      for (const [midi, eighths, tremolo] of bar.melody) {
        voices(midi, u, eighths * eighth, tremolo ?? false);
        u += eighths * eighth;
      }
      t += barLength;
    }
  }
  rhythm(song.ending.chord, t, true);
  voices(song.ending.note, t, song.ending.beats * beat, true);

  events.sort((a, b) => a.time - b.time);
  return { events, duration: t + 2.5 };
}
