import { describe, expect, it } from 'vitest';
import { arrange, arrangeBacking, harmonyBelow, placeNote, thirdBelow } from './arrange';
import { chordById, findVoicing } from './chords';
import { INSTRUMENTS, getInstrument } from './instruments';
import { pitchClass } from './notes';
import { KOLO_E, OSAM_TAMBURASA, PJESMA_RAVNICI, SONGS, type Song, isBacking } from './songs';

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

describe('arrangeBacking', () => {
  it('arranges every backing track without errors', () => {
    for (const track of SONGS.filter(isBacking)) expect(arrangeBacking(track).events.length).toBeGreaterThan(0);
  });

  const { events, duration, chords } = arrangeBacking(OSAM_TAMBURASA);
  const beat = 60 / OSAM_TAMBURASA.bpm;
  const bar = OSAM_TAMBURASA.meter * beat;
  const end = OSAM_TAMBURASA.bars.length * bar;

  it('leaves the melody to you: no prim, and every note within reach', () => {
    expect(events.some((e) => e.inst === 'prim')).toBe(false);
    for (const e of events) {
      const inst = getInstrument(e.inst);
      expect(inst.courses[e.course]!.midi + e.fret).toBe(e.midi);
      expect(e.fret).toBeLessThanOrEqual(inst.visibleFrets);
    }
    expect(duration).toBeGreaterThan(end);
  });

  it('strums the kontra on beats 2 and 4, and starts each chord with the berde root', () => {
    const phase = (t: number): number => (Math.round((t / beat) * 100) / 100) % OSAM_TAMBURASA.meter;
    for (const e of events.filter((x) => x.time < end - 0.01)) {
      if (e.inst === 'kontra') expect([1, 3]).toContain(Math.round(phase(e.time)));
      if (e.inst === 'berde') expect([0, 2]).toContain(phase(e.time));
    }
  });

  it('reports every chord change, in order', () => {
    expect(chords[0]).toEqual({ time: 0, id: 'Em' });
    expect(chords.at(-1)?.id).toBe(OSAM_TAMBURASA.ending);
    for (let i = 1; i < chords.length; i++) {
      expect(chords[i]!.time).toBeGreaterThan(chords[i - 1]!.time);
      expect(chords[i]!.id).not.toBe(chords[i - 1]!.id);
    }
  });
});

describe('song chords', () => {
  it('every instrument has a shape for every chord a song uses', () => {
    const tracks = SONGS.filter(isBacking);
    expect(tracks.length).toBeGreaterThan(1);
    const used = new Set(tracks.flatMap((t) => [...t.bars.flat(), t.ending]));
    for (const inst of INSTRUMENTS) {
      for (const id of used) {
        const chord = chordById(id);
        expect(chord, id).toBeDefined();
        expect(findVoicing(inst, chord!), `${inst.id} ${id}`).not.toBeNull();
      }
    }
  });
});

describe('slow songs with a melody', () => {
  it('every bar of every tune adds up to its meter', () => {
    for (const song of SONGS.filter((x): x is Song => !isBacking(x))) {
      const eighths = 2 * (song.beatsPerBar ?? 2);
      for (const [i, bar] of song.bars.entries()) {
        const sum = bar.melody.reduce((a, [, e]) => a + e, 0);
        expect(sum, `${song.id} bar ${i + 1}`).toBe(eighths);
      }
    }
  });

  it('plays "Pjesma ravnici" in 4/4: kontra on 2 and 4, second voice a third below in the chord', () => {
    const { events, duration } = arrange(PJESMA_RAVNICI);
    const beat = 60 / PJESMA_RAVNICI.bpm;
    const end = duration - 2.5;
    const beatInBar = (t: number): number => Math.round(Math.round((t / beat) * 100) / 100) % 4;
    for (const e of events.filter((x) => x.inst === 'kontra' && x.time < end - 0.01)) {
      expect([1, 3]).toContain(beatInBar(e.time));
    }
    // The second voice: always a third below, and a chord tone wherever the chord has one there.
    for (const bar of PJESMA_RAVNICI.bars) {
      const list = typeof bar.chord === 'string' ? [bar.chord] : bar.chord;
      let pos = 0;
      for (const [midi, eighths] of bar.melody) {
        const chordId = list[list.length > 1 && pos >= 4 ? 1 : 0]!;
        const below = harmonyBelow(midi, PJESMA_RAVNICI.tonic, chordId);
        expect([3, 4]).toContain(midi - below);
        const chord = chordById(chordId)!;
        const tones = chord.intervals.map((i) => pitchClass(chord.root + i));
        const third = [midi - 3, midi - 4].find((m) => tones.includes(pitchClass(m)));
        if (third !== undefined) expect(below).toBe(third);
        pos += eighths;
      }
    }
  });
});
