import { describe, expect, it } from 'vitest';
import { arrange, placeNote, thirdBelow } from './arrange';
import { INSTRUMENTS, getInstrument } from './instruments';
import { pitchClass } from './notes';
import { KOLO_E } from './songs';

describe('arrange', () => {
  const { events, duration } = arrange(KOLO_E);
  const beat = 60 / KOLO_E.bpm;

  it('gives every instrument a part', () => {
    for (const inst of INSTRUMENTS) expect(events.some((e) => e.inst === inst.id), inst.id).toBe(true);
  });

  it('only uses notes each instrument can reach on screen', () => {
    for (const e of events) {
      const inst = getInstrument(e.inst);
      expect(inst.courses[e.course]!.midi + e.fret).toBe(e.midi);
      expect(e.fret).toBeGreaterThanOrEqual(0);
      expect(e.fret).toBeLessThanOrEqual(inst.visibleFrets);
    }
  });

  it('puts the kontra on the off-beats and the berde on the beats (except the final chord)', () => {
    const end = duration - 2.5;
    const phase = (t: number): number => Math.round(((t / beat) % 1) * 100) / 100;
    for (const e of events.filter((x) => x.time < end - 0.01)) {
      if (e.inst === 'berde') expect(phase(e.time)).toBe(0);
      // Strummed strings follow each other by a few ms.
      if (e.inst === 'kontra') expect(Math.abs(phase(e.time) - 0.5)).toBeLessThan(0.08);
    }
  });

  it('has a second prim a diatonic third below the melody', () => {
    const lead = events.filter((e) => e.inst === 'prim' && !e.part);
    const second = events.filter((e) => e.inst === 'prim' && e.part === 'second');
    expect(second.length).toBeGreaterThan(0);
    const leadPitches = new Set(lead.map((e) => e.midi));
    for (const e of second) {
      const interval = [3, 4].map((d) => e.midi + d).some((m) => leadPitches.has(m));
      expect(interval, `MIDI ${e.midi}`).toBe(true);
    }
  });

  it('is sorted in time', () => {
    for (let i = 1; i < events.length; i++) expect(events[i]!.time).toBeGreaterThanOrEqual(events[i - 1]!.time);
  });
});

describe('helpers', () => {
  it('places a note on the course with the lowest fret', () => {
    expect(placeNote(getInstrument('prim'), 81)).toEqual({ course: 3, fret: 5 });
    expect(placeNote(getInstrument('prim'), 40)).toBeNull();
  });

  it('finds the diatonic third below in E major', () => {
    expect(thirdBelow(83, 4)).toBe(80); // H -> Gis
    expect(thirdBelow(80, 4)).toBe(76); // Gis -> E
    expect(pitchClass(thirdBelow(85, 4))).toBe(9); // Cis -> A
  });
});
