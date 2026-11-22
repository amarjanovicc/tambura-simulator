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
