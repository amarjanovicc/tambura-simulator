import { describe, expect, it } from 'vitest';
import { CHORDS, findVoicing, voicingsFor } from './chords';
import { INSTRUMENTS, getInstrument } from './instruments';
import { chordIndexForKey, fretForKey, keyForFret } from './keymap';
import { noteName, pitchClass } from './notes';

describe('voicings', () => {
  for (const inst of INSTRUMENTS) {
    it(`${inst.id} can play every chord in the palette`, () => {
      expect(voicingsFor(inst).size).toBe(CHORDS.length);
    });
  }

  it('full voicings only sound chord tones and include root and third', () => {
    for (const inst of INSTRUMENTS.filter((i) => i.chordStyle === 'full')) {
      for (const ch of CHORDS) {
        const v = findVoicing(inst, ch);
        expect(v, `${inst.id} ${ch.id}`).not.toBeNull();
        const tones = new Set(ch.intervals.map((i) => pitchClass(ch.root + i)));
        const pcs = v!.map((f, i) => pitchClass(inst.courses[i]!.midi + f!));
        pcs.forEach((pc) => expect(tones.has(pc), `${inst.id} ${ch.id}`).toBe(true));
        expect(pcs).toContain(ch.root);
      }
    }
  });

  it('bugarija plays D major on open strings', () => {
    expect(findVoicing(getInstrument('bugarija'), CHORDS.find((c) => c.id === 'D')!)).toEqual([0, 0, 0, 0]);
  });

  it('berde plays one root note', () => {
    const v = findVoicing(getInstrument('berde'), CHORDS.find((c) => c.id === 'A')!)!;
    expect(v.filter((f) => f !== null)).toHaveLength(1);
    expect(v).toEqual([null, 0, null, null]);
  });
});

describe('keymap', () => {
  it('maps rows to courses and columns to frets', () => {
    expect(fretForKey('Digit1', 4, 12)).toEqual({ course: 0, fret: 0 });
    expect(fretForKey('KeyR', 4, 12)).toEqual({ course: 1, fret: 3 });
    expect(fretForKey('KeyZ', 4, 12)).toEqual({ course: 3, fret: 0 });
    expect(fretForKey('Slash', 4, 12)).toEqual({ course: 3, fret: 9 });
    expect(fretForKey('Equal', 4, 9)).toBeNull();
    expect(keyForFret(2, 1)).toBe('S');
  });

  it('maps Shift+digits to chords', () => {
    expect(chordIndexForKey('Digit1')).toBe(0);
    expect(chordIndexForKey('Digit0')).toBeNull();
  });
});

describe('notes', () => {
  it('uses H for B natural in Croatian', () => {
    expect(noteName(71, 'hr')).toBe('H');
    expect(noteName(70, 'hr')).toBe('B');
    expect(noteName(66, 'hr')).toBe('Fis');
  });
});
