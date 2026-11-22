import type { Lang } from '../i18n';

export type InstrumentId = 'bisernica' | 'brac' | 'bugarija' | 'berde';

/** One course: a single string or a pair tuned in unison. */
export interface Course {
  midi: number;
  doubled: boolean;
}

/** Sound-design parameters for the Karplus-Strong voice and the body filters. */
export interface ToneParams {
  /** Seconds to decay by 60 dB for the lowest and highest note of the instrument. */
  t60Low: number;
  t60High: number;
  /** Loop low-pass weight, 0.5 = dark (classic KS), lower = brighter steel string. */
  loopDamping: number;
  /** Excitation brightness 0..1 (plectrum hardness). */
  brightness: number;
  /** Plucking point as a fraction of the string length (comb filter). */
  pickPosition: number;
  /** Level of the short plectrum "click" on top of the string. */
  click: number;
  /** Cents between the two strings of a doubled course. */
  courseDetune: number;
  /** Body resonances: [frequency Hz, Q, gain dB]. */
  body: ReadonlyArray<readonly [number, number, number]>;
  highpass: number;
  gain: number;
}

export interface InstrumentDef {
  id: InstrumentId;
  name: Record<Lang, string>;
  role: Record<Lang, string>;
  /** Low to high. */
  courses: readonly Course[];
  visibleFrets: number;
  /** "full" strums every course, "bass" plays one root note (berde). */
  chordStyle: 'full' | 'bass';
  /** Visual: small holes (bisernica) or one round sound hole. */
  soundHole: 'holes' | 'round' | 'f-holes';
  bodyColor: string;
  tone: ToneParams;
}

const c = (midi: number, doubled = false): Course => ({ midi, doubled });

/**
 * E system (Farkaš) tunings. Sources disagree on details and players vary, so every
 * tuning lives here and nowhere else. MIDI 60 = C4 (c1 in Croatian notation).
 */
export const INSTRUMENTS: readonly InstrumentDef[] = [
  {
    id: 'bisernica',
    name: { hr: 'Bisernica', en: 'Bisernica' },
    role: { hr: 'vodeća melodija', en: 'lead melody' },
    // cis1 – fis1 – h1 – e2 (e2 doubled)
    courses: [c(61), c(66), c(71), c(76, true)],
    visibleFrets: 12,
    chordStyle: 'full',
    soundHole: 'holes',
    bodyColor: '#d9a35b',
    tone: {
      t60Low: 2.6,
      t60High: 1.5,
      loopDamping: 0.22,
      brightness: 0.85,
      pickPosition: 0.12,
      click: 0.35,
      courseDetune: 4,
      // Air and wood modes measured on a bisernica: ~340 Hz and ~740 Hz.
      body: [
        [340, 2.2, 4],
        [740, 2.8, 3],
        [2600, 1.2, 2],
      ],
      highpass: 180,
      gain: 0.9,
    },
  },
  {
    id: 'brac',
    name: { hr: 'Brač', en: 'Brač' },
    role: { hr: 'melodija i druga dionica', en: 'melody and second voice' },
    // cis – fis – h – e1 (e1 doubled), an octave below the bisernica
    courses: [c(49), c(54), c(59), c(64, true)],
    visibleFrets: 12,
    chordStyle: 'full',
    soundHole: 'round',
    bodyColor: '#c98f4a',
    tone: {
      t60Low: 3.4,
      t60High: 2.0,
      loopDamping: 0.26,
      brightness: 0.75,
      pickPosition: 0.13,
      click: 0.3,
      courseDetune: 3.5,
      body: [
        [220, 2, 4],
        [480, 2.5, 3],
        [2000, 1.2, 2],
      ],
      highpass: 90,
      gain: 1,
    },
  },
  {
    id: 'bugarija',
    name: { hr: 'Bugarija', en: 'Bugarija' },
    role: { hr: 'ritam i akordi', en: 'rhythm and chords' },
    // d – a – d1 – fis1 (fis1 doubled): an open D major chord
    courses: [c(50), c(57), c(62), c(66, true)],
    visibleFrets: 10,
    chordStyle: 'full',
    soundHole: 'round',
    bodyColor: '#b97c3c',
    tone: {
      t60Low: 2.2,
      t60High: 1.4,
      loopDamping: 0.3,
      brightness: 0.7,
      pickPosition: 0.15,
      click: 0.4,
      courseDetune: 3,
      body: [
        [180, 2, 4],
        [400, 2.5, 3],
        [1800, 1.2, 1.5],
      ],
      highpass: 80,
      gain: 0.85,
    },
  },
  {
    id: 'berde',
    name: { hr: 'Berde', en: 'Berde' },
    role: { hr: 'bas', en: 'bass' },
    // E1 – A1 – D2 – G2, like a double bass
    courses: [c(28), c(33), c(38), c(43)],
    visibleFrets: 9,
    chordStyle: 'bass',
    soundHole: 'f-holes',
    bodyColor: '#8f5a2b',
    tone: {
      t60Low: 4.5,
      t60High: 3.2,
      loopDamping: 0.42,
      brightness: 0.45,
      pickPosition: 0.2,
      click: 0.25,
      courseDetune: 0,
      body: [
        [70, 1.6, 5],
        [160, 2, 3],
        [900, 1.5, 1],
      ],
      highpass: 30,
      gain: 1.25,
    },
  },
];

export function getInstrument(id: InstrumentId): InstrumentDef {
  const found = INSTRUMENTS.find((i) => i.id === id);
  if (!found) throw new Error(`Unknown instrument ${id}`);
  return found;
}
