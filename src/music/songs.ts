import type { Lang } from '../i18n';

/** [MIDI note, length in eighths (0.5 for a sixteenth), tremolo]. MIDI 0 is a rest. */
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
 * An original slow tune in D major in a Slavonian style, written over the chord progression
 * of the refrain of Miroslav Škoro's "Ne dirajte mi ravnicu" (G A7 D Fis Hm B…). Chord
 * progressions are free to use; the melody is new and does not follow his. Two phrases of eight bars:
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

/**
 * "Ružmarin", a traditional Croatian folk song, in A major (2/4), from the upper voice of
 * John Chambers' two-voice ABC transcription (trillian.mit.edu, "O: Croatia"). Two
 * eight-bar strains; the tune is played twice and comes home to A at the end (the
 * transcription's strain ends on the dominant, for the repeat).
 */
export const RUZMARIN: Song = {
  id: 'ruzmarin',
  title: { hr: 'Ružmarin', en: 'Ružmarin (Rosemary)' },
  bpm: 100,
  tonic: 9,
  introBars: 2,
  introChord: 'A',
  repeats: 2,
  bars: [
    // First strain
    { chord: 'A', melody: [[76, 2], [75, 1], [76, 1]] },
    { chord: 'D', melody: [[78, 3, true], [76, 1]] },
    { chord: 'D', melody: [[78, 1], [76, 1], [74, 1], [73, 1]] },
    { chord: ['E7', 'A'], melody: [[74, 2], [73, 2]] },
    { chord: 'A7', melody: [[76, 2], [81, 1], [79, 1]] },
    { chord: 'D', melody: [[78, 3, true], [76, 1]] },
    { chord: 'D', melody: [[78, 1], [76, 1], [74, 1], [73, 1]] },
    { chord: ['E7', 'A'], melody: [[74, 2], [73, 2]] },
    // Second strain
    { chord: 'A', melody: [[76, 2], [74, 1], [73, 1]] },
    { chord: 'E7', melody: [[71, 1], [73, 1], [74, 2]] },
    { chord: 'A', melody: [[73, 0.5], [74, 0.5], [76, 1], [73, 1], [69, 1]] },
    { chord: 'E7', melody: [[71, 1], [73, 1], [74, 2]] },
    { chord: 'A', melody: [[76, 2], [74, 1], [73, 1]] },
    { chord: 'E7', melody: [[71, 1], [73, 1], [74, 2]] },
    { chord: ['A', 'H7'], melody: [[73, 0.5], [74, 0.5], [76, 1], [73, 1], [69, 1]] },
    { chord: 'E', melody: [[71, 2, true], [71, 2]] },
  ],
  ending: { chord: 'A', note: 73, beats: 1.5 },
};

const KALENDARA_A = { chord: 'A', melody: [[76, 2], [74, 1], [73, 1]] } as const;
const KALENDARA_B: readonly SongBar[] = [
  { chord: 'A', melody: [[69, 3, true], [71, 0.5], [73, 0.5]] },
  { chord: 'E7', melody: [[74, 1], [73, 1], [74, 1], [76, 1]] },
  { chord: 'A', melody: [[73, 3, true], [74, 0.5], [73, 0.5]] },
  { chord: 'E7', melody: [[71, 4, true]] },
];

/**
 * "Kolo kalendara", a traditional Croatian kolo, in A major (2/4), from John Chambers'
 * ABC transcription (trillian.mit.edu, "O: Croatia"). The repeats and first/second
 * endings are written out: strain A twice, strain B twice; the whole kolo twice.
 */
export const KOLO_KALENDARA: Song = {
  id: 'kolo-kalendara',
  title: { hr: 'Kolo kalendara', en: 'Kolo kalendara' },
  bpm: 126,
  tonic: 9,
  introBars: 2,
  introChord: 'A',
  repeats: 2,
  bars: [
    KALENDARA_A,
    KALENDARA_A,
    KALENDARA_A,
    { chord: 'E7', melody: [[71, 3, true], [73, 1]] },
    KALENDARA_A,
    KALENDARA_A,
    KALENDARA_A,
    { chord: 'E7', melody: [[71, 4, true]] },
    ...KALENDARA_B,
    ...KALENDARA_B,
  ],
  ending: { chord: 'A', note: 73, beats: 1.5 },
};

const CIRO_A: readonly SongBar[] = [
  { chord: 'A', melody: [[69, 1], [73, 1], [76, 1], [76, 1]] },
  { chord: 'A', melody: [[76, 1], [78, 1], [76, 1], [73, 1]] },
  { chord: ['A', 'E7'], melody: [[76, 1], [76, 1], [74, 1], [74, 1]] },
  { chord: 'A', melody: [[73, 1], [73, 1], [71, 1], [69, 1]] },
];
const CIRO_B: readonly SongBar[] = [
  { chord: ['A', 'E7'], melody: [[73, 2], [74, 1], [71, 1]] },
  { chord: ['A', 'E7'], melody: [[73, 2], [74, 1], [71, 1]] },
  { chord: ['A', 'E7'], melody: [[73, 1], [73, 1], [71, 1], [71, 1]] },
];

/**
 * "Ćiro kolo", a traditional Croatian kolo, from John Chambers' ABC transcription (2003,
 * trillian.mit.edu, "O: Croatia"), moved from G up to A major for the E tuning. Repeats
 * and endings written out: strain A twice, strain B twice; the whole kolo twice.
 */
export const CIRO_KOLO: Song = {
  id: 'ciro-kolo',
  title: { hr: 'Ćiro kolo', en: 'Ćiro kolo' },
  bpm: 132,
  tonic: 9,
  introBars: 2,
  introChord: 'A',
  repeats: 2,
  bars: [
    ...CIRO_A,
    ...CIRO_A,
    ...CIRO_B,
    { chord: 'A', melody: [[69, 3, true], [71, 1]] },
    ...CIRO_B,
    { chord: 'A', melody: [[69, 3, true], [0, 1]] },
  ],
  ending: { chord: 'A', note: 73, beats: 1.5 },
};

const TICEK_A: readonly SongBar[] = [
  { chord: 'A', melody: [[81, 1], [80, 1], [81, 1], [80, 1]] },
  { chord: 'A', melody: [[81, 2], [76, 2]] },
  { chord: 'D', melody: [[78, 1], [78, 1], [74, 1], [78, 1]] },
];
const TICEK_B: readonly SongBar[] = [
  { chord: 'D', melody: [[74, 1], [74, 1], [74, 0.5], [76, 0.5], [78, 1]] },
  { chord: 'A7', melody: [[79, 1], [79, 1], [79, 0.5], [78, 0.5], [76, 1]] },
];

/**
 * "Krici krici tiček", a traditional Croatian drmeš, from John Chambers' ABC
 * transcription (trillian.mit.edu, "O: Croatia", the A/D version): the first strain in A
 * major, the second in D major, each with its repeat and first/second endings written
 * out; the whole dance twice.
 */
export const KRICI_KRICI_TICEK: Song = {
  id: 'krici-krici-ticek',
  title: { hr: 'Krici krici tiček (drmeš)', en: 'Krici krici tiček (drmeš)' },
  bpm: 120,
  tonic: 9,
  introBars: 2,
  introChord: 'A',
  repeats: 2,
  bars: [
    ...TICEK_A,
    { chord: 'A', melody: [[76, 2], [73, 2]] },
    ...TICEK_A,
    { chord: ['A', 'A7'], melody: [[76, 2], [76, 2]] },
    ...TICEK_B,
    { chord: 'D', melody: [[74, 1], [78, 1], [79, 0.5], [78, 0.5], [76, 0.5], [74, 0.5]] },
    { chord: 'A', melody: [[76, 2], [69, 2]] },
    ...TICEK_B,
    { chord: ['D', 'E7'], melody: [[74, 1], [78, 1], [79, 0.5], [78, 0.5], [76, 0.5], [74, 0.5]] },
    { chord: 'A', melody: [[76, 2, true], [76, 2]] },
  ],
  ending: { chord: 'A', note: 73, beats: 1.5 },
};

export const SONGS: readonly Song[] = [KOLO_E, RUZMARIN, KOLO_KALENDARA, CIRO_KOLO, KRICI_KRICI_TICEK, AJDE_LEPA_MARO, PJESMA_RAVNICI];
