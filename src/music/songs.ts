import type { Lang } from '../i18n';

/** [MIDI note, length in eighths, tremolo] */
export type MelodyNote = readonly [midi: number, eighths: number, tremolo?: boolean];

export interface SongBar {
  chord: string;
  melody: readonly MelodyNote[];
}

/**
 * A tune in 2/4 for the whole band. The melody is written for the prim; the other
 * parts (bas-prim second voice, kontra off-beats, berde bass) are derived in `arrange.ts`.
 */
export interface Song {
  id: string;
  title: Record<Lang, string>;
  bpm: number;
  /** Pitch class of the key's tonic; the key is major. */
  tonic: number;
  /** Bars of rhythm only before the melody starts. */
  introBars: number;
  bars: readonly SongBar[];
  repeats: number;
  /** Final bar: one chord and a held melody note. */
  ending: { chord: string; note: number; beats: number };
}

/**
 * An original kolo in E major in a Slavonian style (not a traditional tune). E is home
 * for the Srijem E tuning: the kontra's open strings are the tonic chord.
 */
export const KOLO_E: Song = {
  id: 'kolo-e',
  title: { hr: 'Kolo u E-duru', en: 'Kolo in E major' },
  bpm: 128,
  tonic: 4,
  introBars: 2,
  repeats: 2,
  bars: [
    { chord: 'E', melody: [[83, 1], [80, 1], [83, 1], [80, 1]] },
    { chord: 'E', melody: [[78, 1], [80, 1], [81, 1], [80, 1]] },
    { chord: 'H7', melody: [[78, 1], [81, 1], [78, 1], [75, 1]] },
    { chord: 'E', melody: [[76, 4, true]] },
    { chord: 'E', melody: [[80, 1], [83, 1], [88, 1], [83, 1]] },
    { chord: 'A', melody: [[85, 1], [81, 1], [85, 1], [88, 1]] },
    { chord: 'H7', melody: [[87, 1], [85, 1], [83, 1], [81, 1]] },
    { chord: 'E', melody: [[80, 1], [78, 1], [76, 2, true]] },
  ],
  ending: { chord: 'E', note: 88, beats: 1.5 },
};

export const SONGS: readonly Song[] = [KOLO_E];
