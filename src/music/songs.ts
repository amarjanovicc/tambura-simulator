import type { Lang } from '../i18n';

/** [MIDI note, length in eighths, tremolo]. MIDI 0 is a rest. */
export type MelodyNote = readonly [midi: number, eighths: number, tremolo?: boolean];

export interface SongBar {
  /** One chord, or two that share the bar half and half. */
  chord: string | readonly string[];
  melody: readonly MelodyNote[];
}

/**
 * A tune for the whole band. The melody is written for the prim; the other parts
 * (second prim, bas-prim, kontra, berde) are derived in `arrange.ts`.
 */
export interface Song {
  id: string;
  title: Record<Lang, string>;
  bpm: number;
  /** Beats per bar: 2 for a kolo (the default), 4 for a slow song. */
  beatsPerBar?: 2 | 4;
  /** Pitch class of the key's tonic; the key is major. */
  tonic: number;
  /** Bars of rhythm only before the melody starts. */
  introBars: number;
  /** Chord of those bars (defaults to the first bar's chord). */
  introChord?: string;
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

/**
 * An original slow tune in D major in a Slavonian style, written over the chord progression
 * of the refrain of "Ne dirajte mi ravnicu" (G A7 D Fis Hm B…). Chord progressions are
 * free to use; the melody is new and does not follow Škoro's. Two phrases of eight bars:
 * the first settles on D, the second climbs to b² and comes home.
 */
export const PJESMA_RAVNICI: Song = {
  id: 'pjesma-ravnici',
  title: { hr: 'Pjesma ravnici', en: 'Song for the Plain' },
  bpm: 76,
  beatsPerBar: 4,
  tonic: 2,
  introBars: 2,
  repeats: 2,
  bars: [
    // Phrase 1
    { chord: 'G', melody: [[71, 2], [74, 2], [79, 3], [78, 1]] },
    { chord: 'A7', melody: [[76, 4, true], [73, 2], [76, 2]] },
    { chord: ['D', 'Fis'], melody: [[78, 2], [74, 2], [73, 2], [70, 2]] },
    { chord: ['Hm', 'Bes'], melody: [[71, 2], [74, 2], [74, 2], [77, 2]] },
    { chord: 'D', melody: [[78, 6, true], [76, 1], [74, 1]] },
    { chord: 'Em', melody: [[71, 2], [74, 2], [79, 2], [76, 2]] },
    { chord: ['G', 'A7'], melody: [[74, 2], [71, 2], [73, 2], [76, 2]] },
    { chord: 'D', melody: [[74, 8, true]] },
    // Phrase 2
    { chord: 'G', melody: [[79, 2], [83, 2], [81, 2], [79, 2]] },
    { chord: 'A7', melody: [[81, 4, true], [79, 2], [76, 2]] },
    { chord: ['D', 'Fis'], melody: [[78, 2], [81, 2], [82, 2], [78, 2]] },
    { chord: ['Hm', 'Bes'], melody: [[78, 2], [74, 2], [77, 2], [74, 2]] },
    { chord: 'D', melody: [[74, 2], [78, 2], [81, 4, true]] },
    { chord: ['Em', 'A7'], melody: [[79, 2], [76, 2], [73, 2], [76, 2]] },
    { chord: ['G', 'A7'], melody: [[79, 2], [78, 2], [76, 2], [73, 2]] },
    { chord: 'D', melody: [[74, 8, true]] },
  ],
  ending: { chord: 'D', note: 74, beats: 3 },
};

/**
 * "Ajde lepa Maro", a Croatian folk kolo (traditional), in D major. The melody is the
 * upper voice of John Chambers' two-voice ABC transcription (1997, "O: Croatia",
 * abcnotation.com); the second prim plays the lower voice's thirds. Two eight-bar strains;
 * the whole tune is played twice.
 */
export const AJDE_LEPA_MARO: Song = {
  id: 'ajde-lepa-maro',
  title: { hr: 'Ajde lepa Maro (kolo)', en: 'Ajde lepa Maro (kolo)' },
  bpm: 112,
  tonic: 2,
  introBars: 2,
  introChord: 'D',
  repeats: 2,
  bars: [
    // First strain
    { chord: 'G', melody: [[83, 1], [81, 1], [79, 1], [78, 1]] },
    { chord: 'A', melody: [[79, 3, true], [79, 1]] },
    { chord: 'D', melody: [[78, 1], [81, 1], [78, 1], [74, 1]] },
    { chord: 'A', melody: [[76, 2], [81, 2]] },
    { chord: 'G', melody: [[83, 1], [81, 1], [79, 1], [78, 1]] },
    { chord: 'A', melody: [[79, 3, true], [79, 1]] },
    { chord: 'D', melody: [[78, 1], [81, 1], [78, 1], [74, 1]] },
    { chord: 'A', melody: [[76, 2], [76, 1], [0, 1]] },
    // Second strain
    { chord: 'D', melody: [[74, 1], [74, 1], [73, 1], [74, 1]] },
    { chord: 'A', melody: [[76, 3, true], [78, 1]] },
    { chord: ['A', 'E7'], melody: [[79, 1], [76, 1], [78, 1], [74, 1]] },
    { chord: 'A', melody: [[76, 2], [81, 2]] },
    { chord: 'D', melody: [[74, 1], [74, 1], [73, 1], [74, 1]] },
    { chord: 'A', melody: [[76, 3, true], [78, 1]] },
    { chord: ['A', 'E7'], melody: [[79, 1], [76, 1], [78, 1], [74, 1]] },
    { chord: 'A', melody: [[76, 2], [76, 1], [0, 1]] },
  ],
  ending: { chord: 'D', note: 74, beats: 1.5 },
};

export type Tune = Song | BackingTrack;

export const isBacking = (t: Tune): t is BackingTrack => 'meter' in t;

export const SONGS: readonly Tune[] = [KOLO_E, AJDE_LEPA_MARO, PJESMA_RAVNICI, OSAM_TAMBURASA, NE_DIRAJTE_MI_RAVNICU, RAVNICA_REFREN];
