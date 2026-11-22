import type { Lang } from '../i18n';

export const A4_HZ = 440;

export function midiToFreq(midi: number, a4 = A4_HZ): number {
  return a4 * 2 ** ((midi - 69) / 12);
}

/** Croatian/German note names: B is B-flat, H is B natural. */
const NAMES: Record<Lang, readonly string[]> = {
  hr: ['C', 'Cis', 'D', 'Dis', 'E', 'F', 'Fis', 'G', 'Gis', 'A', 'B', 'H'],
  en: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'B♭', 'B'],
};

export function pitchClass(midi: number): number {
  return ((midi % 12) + 12) % 12;
}

export function noteName(midi: number, lang: Lang): string {
  return NAMES[lang][pitchClass(midi)] ?? '?';
}

/** Scientific pitch name, e.g. 64 -> "E4". */
export function noteNameWithOctave(midi: number, lang: Lang): string {
  return `${noteName(midi, lang)}${Math.floor(midi / 12) - 1}`;
}

const HELMHOLTZ: Record<Lang, readonly string[]> = {
  hr: ['c', 'cis', 'd', 'dis', 'e', 'f', 'fis', 'g', 'gis', 'a', 'b', 'h'],
  en: ['c', 'c♯', 'd', 'd♯', 'e', 'f', 'f♯', 'g', 'g♯', 'a', 'b♭', 'b'],
};
const SUP = ['', '¹', '²', '³', '⁴'];
const SUB = ['', '₁', '₂'];

/**
 * Helmholtz pitch notation, as tamburaši write tunings: c¹ is middle C (MIDI 60), the
 * small octave is lower case (h), the great octave capitalised (D), lower ones get a
 * subscript (E₁).
 */
export function helmholtz(midi: number, lang: Lang): string {
  const name = HELMHOLTZ[lang][pitchClass(midi)] ?? '?';
  const octave = Math.floor(midi / 12) - 1;
  if (octave >= 4) return name + (SUP[octave - 3] ?? '');
  if (octave === 3) return name;
  const upper = name.charAt(0).toUpperCase() + name.slice(1);
  return octave === 2 ? upper : upper + (SUB[2 - octave] ?? '');
}
