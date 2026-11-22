import type { Lang } from '../i18n';

/** [MIDI note, length in eighths, tremolo] */
export type MelodyNote = readonly [midi: number, eighths: number, tremolo?: boolean];

export interface SongBar {
  chord: string;
  melody: readonly MelodyNote[];
}

/**
 * A tune in 2/4 for the whole band. The melody is written for the bisernica; the other
 * parts (brač second voice, bugarija off-beats, berde bass) are derived in `arrange.ts`.
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

/** An original kolo in D major in a Slavonian style (not a traditional tune). */
export const KOLO_D: Song = {
  id: 'kolo-d',
  title: { hr: 'Kolo u D-duru', en: 'Kolo in D major' },
  bpm: 128,
  tonic: 2,
  introBars: 2,
  repeats: 2,
  bars: [
    { chord: 'D', melody: [[81, 1], [78, 1], [81, 1], [78, 1]] },
    { chord: 'D', melody: [[76, 1], [78, 1], [79, 1], [78, 1]] },
    { chord: 'A7', melody: [[76, 1], [79, 1], [76, 1], [73, 1]] },
    { chord: 'D', melody: [[74, 4, true]] },
    { chord: 'D', melody: [[78, 1], [81, 1], [86, 1], [81, 1]] },
    { chord: 'G', melody: [[83, 1], [79, 1], [83, 1], [86, 1]] },
    { chord: 'A7', melody: [[85, 1], [83, 1], [81, 1], [79, 1]] },
    { chord: 'D', melody: [[78, 1], [76, 1], [74, 2, true]] },
  ],
  ending: { chord: 'D', note: 86, beats: 1.5 },
};

export const SONGS: readonly Song[] = [KOLO_D];
