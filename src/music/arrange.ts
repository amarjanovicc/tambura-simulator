import { type Voicing, chordById, findVoicing } from './chords';
import { type InstrumentDef, type InstrumentId, getInstrument } from './instruments';
import { pitchClass } from './notes';
import { type BackingTrack, type Song, type SongBar, type Tune, isBacking } from './songs';

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

export interface Arrangement {
  events: BandEvent[];
  /** Seconds the whole song lasts, including the ring-out of the last chord. */
  duration: number;
  /** When each chord starts, to show it while the band plays. */
  chords: { time: number; id: string }[];
}

function addNote(
  events: BandEvent[],
  inst: InstrumentDef,
  midi: number,
  time: number,
  velocity: number,
  staccato?: number,
  part?: 'second',
): void {
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
}

/** The kontra's shape for a chord, and the berde's root and fifth below or above it. */
function chordParts(id: string): { shape: Voicing; root: number; fifth: number } {
  const chord = chordById(id);
  if (!chord) throw new Error(`Unknown chord ${id}`);
  const kontra = getInstrument('kontra');
  const berde = getInstrument('berde');
  const shape = findVoicing(kontra, chord);
  const bass = findVoicing(berde, chord);
  const rootIndex = bass?.findIndex((f) => f !== null) ?? -1;
  if (!shape || !bass || rootIndex < 0) throw new Error(`No shape for ${id}`);
  const root = berde.courses[rootIndex]!.midi + bass[rootIndex]!;
  const fifth = root - 5 >= berde.courses[0]!.midi ? root - 5 : root + 7;
  return { shape, root, fifth };
}

function strum(events: BandEvent[], shape: Voicing, time: number, velocity: number, staccato?: number): void {
  const kontra = getInstrument('kontra');
  shape.forEach((fret, course) => {
    if (fret === null) return;
    addNote(events, kontra, kontra.courses[course]!.midi + fret, time + course * STRUM_S, velocity, staccato);
  });
}

/** Any song: a full arrangement for a tune, the accompaniment for a backing track. */
export function arrangeTune(tune: Tune): Arrangement {
  return isBacking(tune) ? arrangeBacking(tune) : arrange(tune);
}

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

/**
 * The second voice under a melody note: the chord tone a third below when there is one
 * (so chromatic chords like Fis or B-flat stay in tune), otherwise the diatonic third.
 */
export function harmonyBelow(midi: number, tonic: number, chordId?: string): number {
  const chord = chordId ? chordById(chordId) : undefined;
  if (chord) {
    const tones = chord.intervals.map((i) => pitchClass(chord.root + i));
    for (const d of [3, 4]) if (tones.includes(pitchClass(midi - d))) return midi - d;
  }
  return thirdBelow(midi, tonic);
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
export function arrange(song: Song): Arrangement {
  const beat = 60 / song.bpm;
  const eighth = beat / 2;
  const prim = getInstrument('prim');
  const basprim = getInstrument('basprim');
  const berde = getInstrument('berde');
  const events: BandEvent[] = [];
  const chords: Arrangement['chords'] = [];
  const add = (inst: InstrumentDef, midi: number, time: number, velocity: number, staccato?: number, part?: 'second'): void =>
    addNote(events, inst, midi, time, velocity, staccato, part);

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

  const voices = (midi: number, time: number, length: number, tremolo: boolean, chordId?: string): void => {
    melodyNote(prim, midi, time, length, tremolo, 1);
    melodyNote(prim, harmonyBelow(midi, song.tonic, chordId), time, length, tremolo, 0.78, 'second');
    melodyNote(basprim, midi - 12, time, length, tremolo, 0.8);
  };

  const meter = song.beatsPerBar ?? 2;
  const barLength = meter * beat;
  const chordList = (c: SongBar['chord']): readonly string[] => (typeof c === 'string' ? [c] : c);

  /**
   * One bar of accompaniment. A kolo (2/4): berde on the beats (root, then fifth), kontra
   * on the off-beat eighths. A slow song (4/4): berde root on 1 and fifth on 3, kontra on
   * 2 and 4. With two chords in a bar, each takes half.
   */
  const rhythm = (bar: SongBar['chord'], time: number): void => {
    const list = chordList(bar);
    const share = meter / list.length;
    list.forEach((chordId, k) => {
      const at = time + k * share * beat;
      const { shape, root, fifth } = chordParts(chordId);
      if (chords.at(-1)?.id !== chordId) chords.push({ time: at, id: chordId });
      add(berde, root, at, 0.85, beat * 0.8);
      const fifthAt = meter === 4 ? 2 : 1;
      if (share > fifthAt) add(berde, fifth, at + fifthAt * beat, 0.8, beat * 0.8);
      for (let b = 0; b < share; b++) {
        if (meter === 4) {
          if ((k * share + b) % 2 === 1) strum(events, shape, at + b * beat, 0.68, beat * 0.4);
        } else {
          strum(events, shape, at + b * beat + eighth, 0.7, 0.15);
        }
      }
    });
  };
  const finalChord = (chordId: string, time: number): void => {
    const { shape, root } = chordParts(chordId);
    if (chords.at(-1)?.id !== chordId) chords.push({ time, id: chordId });
    add(berde, root, time, 0.85);
    strum(events, shape, time, 0.8);
  };

  let t = 0;
  const first = song.bars[0]?.chord ?? song.ending.chord;
  for (let i = 0; i < song.introBars; i++, t += barLength) rhythm(chordList(first)[0]!, t);
  for (let r = 0; r < song.repeats; r++) {
    for (const bar of song.bars) {
      rhythm(bar.chord, t);
      const list = chordList(bar.chord);
      let u = t;
      for (const [midi, eighths, tremolo] of bar.melody) {
        // The chord under this note: the second one in the bar's second half.
        const chordId = list[list.length > 1 && u - t >= barLength / 2 - 1e-6 ? 1 : 0];
        voices(midi, u, eighths * eighth, tremolo ?? false, chordId);
        u += eighths * eighth;
      }
      t += barLength;
    }
  }
  finalChord(song.ending.chord, t);
  voices(song.ending.note, t, song.ending.beats * beat, true, song.ending.chord);

  events.sort((a, b) => a.time - b.time);
  return { events, duration: t + 2.5, chords };
}

/**
 * The accompaniment of a slow song in 4/4 (or any meter), for you to play the melody to:
 * - berde: the root on the chord's first beat, the fifth halfway through a whole bar;
 * - kontra: short strums on the after-beats (2 and 4), the "ćuć";
 * - bas-prim: the chord's third held in a soft tremolo, which fills the harmony.
 * Nobody plays the melody.
 */
export function arrangeBacking(track: BackingTrack): Arrangement {
  const beat = 60 / track.bpm;
  const basprim = getInstrument('basprim');
  const berde = getInstrument('berde');
  const events: BandEvent[] = [];
  const chords: Arrangement['chords'] = [];

  const third = (id: string): number => {
    const chord = chordById(id)!;
    // The third in the middle of the bas-prim's range, around f#¹ (MIDI 66).
    const pc = pitchClass(chord.root + (chord.intervals[1] ?? 4));
    return 60 + pc + (pc < 6 ? 12 : 0);
  };
  const pad = (id: string, time: number, length: number, velocity: number): void => {
    const midi = third(id);
    for (let s = 0, k = 0; s < length - 0.05; s += TREMOLO_S * 1.4, k++) {
      addNote(events, basprim, midi, time + s, (k % 2 ? 0.34 : 0.42) * velocity);
    }
  };

  let t = 0;
  for (const bar of track.bars) {
    const share = track.meter / bar.length;
    bar.forEach((id, k) => {
      const at = t + k * share * beat;
      const { shape, root, fifth } = chordParts(id);
      if (chords.at(-1)?.id !== id) chords.push({ time: at, id });
      addNote(events, berde, root, at, 0.85, beat * 0.9);
      if (share >= 4) addNote(events, berde, fifth, at + 2 * beat, 0.78, beat * 0.9);
      for (let b = 0; b < share; b++) {
        if ((k * share + b) % 2 === 1) strum(events, shape, at + b * beat, 0.66, beat * 0.4);
      }
      pad(id, at, share * beat, 1);
    });
    t += track.meter * beat;
  }
  const last = chordParts(track.ending);
  if (chords.at(-1)?.id !== track.ending) chords.push({ time: t, id: track.ending });
  addNote(events, berde, last.root, t, 0.9);
  strum(events, last.shape, t, 0.8);
  pad(track.ending, t, 2 * beat, 1);

  events.sort((a, b) => a.time - b.time);
  return { events, duration: t + 3, chords };
}
