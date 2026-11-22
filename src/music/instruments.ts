import type { Lang } from '../i18n';

export type InstrumentId = 'prim' | 'basprim' | 'kontra' | 'berde';

/** Old ids (before the switch to the Srijem names) still work in links like `#bisernica`. */
export const INSTRUMENT_ALIASES: Record<string, InstrumentId> = {
  bisernica: 'prim',
  brac: 'basprim',
  bugarija: 'kontra',
};

/** One course: a single string or a pair tuned in unison. */
export interface Course {
  midi: number;
  doubled: boolean;
}

/** Sound-design parameters for the string model and the body. */
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
  /**
   * Inharmonicity coefficient B: upper partials run sharp, the metallic edge of steel
   * strings. From B = π³·E·d⁴ / (64·T·L²) for steel (E = 200 GPa) with typical gauges and
   * scale lengths, e.g. the prim's e2 string (0.25 mm, 35 cm, ~82 N) gives B ≈ 4e-5.
   */
  inharmonicity: number;
  /**
   * Share of the sound that dies away quickly. A plucked string vibrates in two planes
   * that decay at different rates: a bright "prompt" sound, then a softer aftersound.
   */
  promptShare: number;
  /** Body modes (air cavity and top plate): [frequency Hz, Q, boost dB]. */
  body: ReadonlyArray<readonly [number, number, number]>;
  highpass: number;
  gain: number;
}

export interface InstrumentDef {
  id: InstrumentId;
  name: Record<Lang, string>;
  /** The other common name (Farkaš/orchestra naming). */
  alias: Record<Lang, string>;
  role: Record<Lang, string>;
  /** Low to high. */
  courses: readonly Course[];
  visibleFrets: number;
  /** "full" strums every course, "bass" plays one root note (berde). */
  chordStyle: 'full' | 'bass';
  /** Visual: small holes (prim) or one round sound hole. */
  soundHole: 'holes' | 'round' | 'f-holes';
  bodyColor: string;
  tone: ToneParams;
}

const c = (midi: number, doubled = false): Course => ({ midi, doubled });

/**
 * Srijem E tuning (srijemski E-štim), as played by Slavonian tamburica bands.
 * Every tuning lives here and nowhere else. MIDI 60 = C4 (c1 in Croatian notation).
 *
 * Body modes: the prim's air and wood modes (~340 Hz and ~740 Hz) are measured values;
 * the other instruments scale them by body size, with plate modes placed like those of
 * guitar-family instruments. Strings are steel; bass strings are wound.
 */
export const INSTRUMENTS: readonly InstrumentDef[] = [
  {
    id: 'prim',
    name: { hr: 'Prim', en: 'Prim' },
    alias: { hr: 'bisernica', en: 'bisernica' },
    role: { hr: 'vodeća melodija', en: 'lead melody' },
    // cis1 – fis1 – h1 – e2 (e2 doubled): 5 strings
    courses: [c(61), c(66), c(71), c(76, true)],
    visibleFrets: 12,
    chordStyle: 'full',
    soundHole: 'holes',
    bodyColor: '#d9a35b',
    tone: {
      t60Low: 2.8,
      t60High: 1.7,
      loopDamping: 0.18,
      brightness: 0.9,
      pickPosition: 0.11,
      click: 0.4,
      courseDetune: 4,
      inharmonicity: 6e-5,
      promptShare: 0.55,
      body: [
        [340, 16, 7],
        [740, 22, 6],
        [1150, 26, 3],
        [1720, 26, 3],
        [2600, 22, 3],
        [3700, 18, 2],
      ],
      highpass: 230,
      gain: 0.85,
    },
  },
  {
    id: 'basprim',
    name: { hr: 'Bas-prim', en: 'Bas-prim' },
    alias: { hr: 'brač', en: 'brač' },
    role: { hr: 'melodija i drugi glas', en: 'melody and second voice' },
    // fis – h – e1 – a1 (a1 doubled): 5 strings in fourths
    courses: [c(54), c(59), c(64), c(69, true)],
    visibleFrets: 12,
    chordStyle: 'full',
    soundHole: 'round',
    bodyColor: '#c98f4a',
    tone: {
      t60Low: 3.6,
      t60High: 2.2,
      loopDamping: 0.22,
      brightness: 0.8,
      pickPosition: 0.12,
      click: 0.33,
      courseDetune: 3.5,
      inharmonicity: 5e-5,
      promptShare: 0.5,
      body: [
        [210, 16, 7],
        [460, 22, 6],
        [720, 26, 3],
        [1070, 26, 3],
        [1650, 22, 2.5],
        [2500, 18, 2],
      ],
      highpass: 110,
      gain: 1,
    },
  },
  {
    id: 'kontra',
    name: { hr: 'Kontra', en: 'Kontra' },
    alias: { hr: 'bugarija', en: 'bugarija' },
    role: { hr: 'ritam i akordi', en: 'rhythm and chords' },
    // e – gis – h – e1 (e1 doubled): an open E major chord, 5 strings
    courses: [c(52), c(56), c(59), c(64, true)],
    visibleFrets: 10,
    chordStyle: 'full',
    soundHole: 'round',
    bodyColor: '#b97c3c',
    tone: {
      t60Low: 2.4,
      t60High: 1.6,
      loopDamping: 0.26,
      brightness: 0.75,
      pickPosition: 0.14,
      click: 0.45,
      courseDetune: 3,
      inharmonicity: 6e-5,
      promptShare: 0.5,
      body: [
        [150, 15, 7],
        [330, 20, 6],
        [520, 24, 3],
        [800, 24, 3],
        [1300, 20, 2],
        [2200, 18, 1.5],
      ],
      highpass: 85,
      gain: 0.8,
    },
  },
  {
    id: 'berde',
    name: { hr: 'Berde', en: 'Berde' },
    alias: { hr: 'bas', en: 'bass' },
    role: { hr: 'bas', en: 'bass' },
    // E1 – A1 – D – G, like a double bass
    courses: [c(28), c(33), c(38), c(43)],
    visibleFrets: 9,
    chordStyle: 'bass',
    soundHole: 'f-holes',
    bodyColor: '#8f5a2b',
    tone: {
      t60Low: 4.5,
      t60High: 3.2,
      loopDamping: 0.38,
      brightness: 0.55,
      pickPosition: 0.18,
      click: 0.3,
      courseDetune: 0,
      inharmonicity: 2.5e-5,
      promptShare: 0.45,
      body: [
        [65, 12, 7],
        [140, 15, 5],
        [230, 18, 3],
        [400, 18, 2],
        [800, 15, 1],
      ],
      highpass: 32,
      gain: 1.25,
    },
  },
];

export function getInstrument(id: InstrumentId): InstrumentDef {
  const found = INSTRUMENTS.find((i) => i.id === id);
  if (!found) throw new Error(`Unknown instrument ${id}`);
  return found;
}

/** Resolves an id or an old alias (`bisernica`, `brac`, `bugarija`). */
export function resolveInstrumentId(value: string): InstrumentId | null {
  if (INSTRUMENTS.some((i) => i.id === value)) return value as InstrumentId;
  return INSTRUMENT_ALIASES[value] ?? null;
}
