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

/**
 * Backing only: the band plays the chords and you play the melody. Each bar lists its
 * chords; two chords share the bar half and half.
 */
export interface BackingTrack {
  id: string;
  title: Record<Lang, string>;
  bpm: number;
  /** Beats per bar. */
  meter: number;
  bars: readonly (readonly string[])[];
  /** Final chord, held. */
  ending: string;
}

const VERSE = [['Em'], ['Em'], ['D7'], ['G'], ['E7'], ['Am'], ['Em', 'D7'], ['Am', 'H7']] as const;
const CHORUS = [
  ['G', 'D7'],
  ['G', 'E7'],
  ['Am'],
  ['D7'],
  ['G'],
  ['G', 'D7'],
  ['G', 'E7'],
  ['Am'],
  ['C', 'Cisdim'],
  ['G', 'A7'],
  ['D7'],
  ['G'],
] as const;

/**
 * "Osam tamburaša s Petrovaradina" (Ratko Šoć; sung by Zvonko Bogdan, 1977): the
 * accompaniment only. The melody and lyrics are the author's and are not reproduced;
 * the chords follow a published chord sheet, with bar lengths estimated: verses in E
 * minor, refrain in G, three times. A two-bar Em–H7 lead-in.
 */
export const OSAM_TAMBURASA: BackingTrack = {
  id: 'osam-tamburasa',
  title: { hr: 'Osam tamburaša (pratnja)', en: 'Osam tamburaša (backing)' },
  bpm: 84,
  meter: 4,
  bars: [['Em'], ['H7'], ...VERSE, ...CHORUS, ...VERSE, ...CHORUS, ...VERSE, ...CHORUS],
  ending: 'G',
};

const RAVNICA_VERSE = [['D'], ['D', 'Em'], ['G', 'A7'], ['D'], ['D'], ['Em'], ['G', 'A7'], ['D']] as const;
const RAVNICA_CHORUS = [['G'], ['A7'], ['D', 'Fis'], ['Hm', 'Bes'], ['D'], ['Em'], ['G', 'A7'], ['D']] as const;

/**
 * "Ne dirajte mi ravnicu" (Miroslav Škoro, 1992): the accompaniment only, from a
 * published chord sheet in D (the melody and lyrics are under copyright and are not
 * reproduced). Three verses, each followed by the refrain; bar lengths and tempo are
 * estimated. A two-bar G–A7–D lead-in.
 */
export const NE_DIRAJTE_MI_RAVNICU: BackingTrack = {
  id: 'ne-dirajte-mi-ravnicu',
  title: { hr: 'Ne dirajte mi ravnicu (pratnja)', en: 'Ne dirajte mi ravnicu (backing)' },
  bpm: 76,
  meter: 4,
  bars: [
    ['G', 'A7'],
    ['D'],
    ...RAVNICA_VERSE,
    ...RAVNICA_CHORUS,
    ...RAVNICA_VERSE,
    ...RAVNICA_CHORUS,
    ...RAVNICA_VERSE,
    ...RAVNICA_CHORUS,
  ],
  ending: 'D',
};

/** Just the refrain of "Ne dirajte mi ravnicu", four times, for practising that part. */
export const RAVNICA_REFREN: BackingTrack = {
  id: 'ne-dirajte-mi-ravnicu-refren',
  title: { hr: 'Ne dirajte mi ravnicu – refren', en: 'Ne dirajte mi ravnicu – refrain' },
  bpm: 76,
  meter: 4,
  bars: [['G', 'A7'], ['D'], ...RAVNICA_CHORUS, ...RAVNICA_CHORUS, ...RAVNICA_CHORUS, ...RAVNICA_CHORUS],
  ending: 'D',
};

export type Tune = Song | BackingTrack;

export const isBacking = (t: Tune): t is BackingTrack => 'meter' in t;

export const SONGS: readonly Tune[] = [KOLO_E, OSAM_TAMBURASA, NE_DIRAJTE_MI_RAVNICU, RAVNICA_REFREN];
