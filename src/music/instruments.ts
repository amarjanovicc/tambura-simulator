import type { Lang } from '../i18n';

export type InstrumentId = 'prim' | 'basprim' | 'kontra' | 'berde';

/** Old ids (before the switch to the Srijem names) still work in links like `#bisernica`. */
export const INSTRUMENT_ALIASES: Record<string, InstrumentId> = {
  bisernica: 'prim',
  brac: 'basprim',
  bugarija: 'kontra',
};

/** One course: a single string or a pair tuned in unison. All tamburica strings are steel. */
export interface Course {
  midi: number;
  doubled: boolean;
  /** Outer diameter in mm (Dinamik string sets). */
  gauge: number;
  /** Wound (pletena) strings: a steel core with a steel wrap. */
  wound: boolean;
}

/** Sound-design parameters for the string model and the body. */
export interface ToneParams {
  /** Seconds to decay by 60 dB for the lowest and highest note of the instrument. */
  t60Low: number;
  t60High: number;
  /** Loop low-pass weight, 0.5 = dark (classic KS), lower = brighter steel string. */
  loopDamping: number;
  /** Excitation brightness 0..1: plectrum hardness (horn is hard, leather soft). */
  brightness: number;
  /** Plucking point as a fraction of the string length (comb filter). */
  pickPosition: number;
  /** Level of the short plectrum "click" on top of the string. */
  click: number;
  /** Cents between the two strings of a doubled course. */
  courseDetune: number;
  /**
   * Share of the sound that dies away quickly. A plucked string vibrates in two planes
   * that decay at different rates: a bright "prompt" sound, then the aftersound.
   */
  promptShare: number;
  /** How strongly open strings ring along with a played note (0 = off). */
  sympathetic: number;
  /** Body modes (air cavity, plate, formant): [frequency Hz, Q, boost dB]. */
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
  /** Vibrating string length (menzura) in metres. */
  scaleLength: number;
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

const plain = (midi: number, gauge: number, doubled = false): Course => ({ midi, gauge, doubled, wound: false });
const wound = (midi: number, gauge: number): Course => ({ midi, gauge, doubled: false, wound: true });

/**
 * Srijem E tuning (srijemski E-štim), as played by Slavonian tamburica bands.
 * Every tuning lives here and nowhere else. MIDI 60 = C4 (c1 in Croatian notation).
 *
 * Sources: string gauges from the Dinamik price list; scale lengths and the prim's
 * spectrum from Mandić (PMF Novi Sad), who measured four Srijem prims in an anechoic
 * room. The prim's fundamental is never its loudest partial: a body formant around
 * 1.0–1.3 kHz is, with resonances near 365 Hz (air) and 745 Hz (top). The larger bodies
 * are scaled from the prim by size (inferred). Picks: thick horn for prim, bas-prim and
 * kontra, a thick suede-covered pick for the berde.
 */
export const INSTRUMENTS: readonly InstrumentDef[] = [
  {
    id: 'prim',
    name: { hr: 'Prim', en: 'Prim' },
    alias: { hr: 'bisernica', en: 'bisernica' },
    role: { hr: 'vodeća melodija', en: 'lead melody' },
    scaleLength: 0.39,
    // e2 e2 (0.23) · h1 (0.30) · fis1 (0.50 wound) · cis1 (0.60 wound)
    courses: [wound(61, 0.6), wound(66, 0.5), plain(71, 0.3), plain(76, 0.23, true)],
    visibleFrets: 12,
    chordStyle: 'full',
    soundHole: 'holes',
    bodyColor: '#d9a35b',
    tone: {
      t60Low: 3.2,
      t60High: 2.2,
      loopDamping: 0.16,
      brightness: 0.92,
      pickPosition: 0.12,
      click: 0.4,
      courseDetune: 4,
      promptShare: 0.3,
      sympathetic: 0.08,
      body: [
        [365, 12, 5],
        [745, 14, 3],
        [1250, 3, 12],
        [1750, 10, 3],
        [2700, 10, 1.5],
      ],
      highpass: 270,
      gain: 0.8,
    },
  },
  {
    id: 'basprim',
    name: { hr: 'Bas-prim', en: 'Bas-prim' },
    alias: { hr: 'brač', en: 'brač' },
    role: { hr: 'melodija i drugi glas', en: 'melody and second voice' },
    scaleLength: 0.575,
    // a1 a1 (0.30) · e1 (0.40) · h (0.65 wound) · fis (0.80 wound): 5 strings in fourths
    courses: [wound(54, 0.8), wound(59, 0.65), plain(64, 0.4), plain(69, 0.3, true)],
    visibleFrets: 12,
    chordStyle: 'full',
    soundHole: 'round',
    bodyColor: '#c98f4a',
    tone: {
      t60Low: 3.8,
      t60High: 2.6,
      loopDamping: 0.2,
      brightness: 0.88,
      pickPosition: 0.12,
      click: 0.35,
      courseDetune: 3.5,
      promptShare: 0.3,
      sympathetic: 0.08,
      body: [
        [215, 12, 5],
        [440, 14, 5],
        [720, 4, 8],
        [1150, 10, 3],
        [1900, 10, 1.5],
      ],
      highpass: 140,
      gain: 0.95,
    },
  },
  {
    id: 'kontra',
    name: { hr: 'Kontra', en: 'Kontra' },
    alias: { hr: 'bugarija', en: 'bugarija' },
    role: { hr: 'ritam i akordi', en: 'rhythm and chords' },
    scaleLength: 0.65,
    // e1 e1 (0.35) · h (0.45) · gis (0.70 wound) · e (0.90 wound): an open E major chord
    courses: [wound(52, 0.9), wound(56, 0.7), plain(59, 0.45), plain(64, 0.35, true)],
    visibleFrets: 10,
    chordStyle: 'full',
    soundHole: 'round',
    bodyColor: '#b97c3c',
    tone: {
      t60Low: 2.6,
      t60High: 1.8,
      loopDamping: 0.22,
      brightness: 0.9,
      pickPosition: 0.14,
      click: 0.55,
      courseDetune: 3,
      promptShare: 0.4,
      // Off-beat strokes are damped right away, so nothing is left to ring along.
      sympathetic: 0,
      body: [
        [160, 10, 5],
        [330, 12, 5],
        [570, 4, 7],
        [920, 10, 3],
        [1500, 10, 1.5],
      ],
      highpass: 95,
      gain: 0.8,
    },
  },
  {
    id: 'berde',
    name: { hr: 'Berde', en: 'Berde' },
    alias: { hr: 'bas', en: 'bass' },
    role: { hr: 'bas', en: 'bass' },
    scaleLength: 1.08,
    // G (1.40) · D (2.10) · A1 (2.70) · E1 (3.84), all wound
    courses: [wound(28, 3.84), wound(33, 2.7), wound(38, 2.1), wound(43, 1.4)],
    visibleFrets: 9,
    chordStyle: 'bass',
    soundHole: 'f-holes',
    bodyColor: '#8f5a2b',
    tone: {
      t60Low: 4.5,
      t60High: 3.2,
      loopDamping: 0.36,
      brightness: 0.45,
      pickPosition: 0.18,
      click: 0.15,
      courseDetune: 0,
      promptShare: 0.35,
      sympathetic: 0.05,
      body: [
        [62, 10, 6],
        [130, 12, 5],
        [240, 5, 5],
        [450, 10, 2],
      ],
      highpass: 35,
      gain: 1.25,
    },
  },
];

const STEEL_E = 2e11; // Young's modulus, Pa
const STEEL_RHO = 7850; // density, kg/m³
/**
 * Wound strings: the core is about this share of the outer diameter, and the wrap fills
 * this much of the outer cross-section with steel. Heavy bass strings (multi-layer wraps)
 * have relatively thinner cores and more air between the wraps.
 */
function woundGeometry(gauge: number): { core: number; fill: number } {
  return gauge > 1.2 ? { core: 0.3, fill: 0.5 } : { core: 0.45, fill: 0.85 };
}

/**
 * Tension and inharmonicity coefficient B of a string playing `freq` Hz on fret `fret`:
 * B = π³·E·d⁴ / (64·T·L²), with tension T = μ·(2·L·f)² from the mass per length μ.
 * Wound strings take their stiffness from the core only and their mass from the whole
 * string. The prim's e2 string (0.23 mm, 39 cm) comes out at ~86 N and B ≈ 2e-5.
 */
export function stringPhysics(
  inst: InstrumentDef,
  course: Course,
  fret: number,
  freq: number,
): { tension: number; B: number } {
  const L = inst.scaleLength * 2 ** (-fret / 12);
  const d = course.gauge / 1000;
  const wrap = course.wound ? woundGeometry(course.gauge) : { core: 1, fill: 1 };
  const core = d * wrap.core;
  const mu = STEEL_RHO * Math.PI * (d / 2) ** 2 * wrap.fill;
  const tension = mu * (2 * L * freq) ** 2;
  const B = (Math.PI ** 3 * STEEL_E * core ** 4) / (64 * tension * L * L);
  return { tension, B };
}

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
