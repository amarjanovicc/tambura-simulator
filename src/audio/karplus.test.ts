import { describe, expect, it } from 'vitest';
import { INSTRUMENTS, getInstrument, stringPhysics } from '../music/instruments';
import { midiToFreq } from '../music/notes';
import { pluckOptions } from './engine';
import { renderPluck } from './karplus';

const SR = 48000;

/**
 * Finds the frequency of the strongest spectral peak within ±40 cents of `expected`
 * (a fine DFT scan). This measures the fundamental itself: a stiff string's upper
 * partials run sharp on purpose, which would bias an autocorrelation estimate.
 */
function estimatePitch(x: Float32Array, sr: number, expected: number): number {
  const seg = x.subarray(Math.floor(0.05 * sr), Math.floor(0.65 * sr));
  let best = expected;
  let bestMag = -1;
  for (let c = -40; c <= 40; c += 0.25) {
    const f = expected * 2 ** (c / 1200);
    let re = 0;
    let im = 0;
    for (let n = 0; n < seg.length; n += 2) {
      const ph = (2 * Math.PI * f * n) / sr;
      re += (seg[n] ?? 0) * Math.cos(ph);
      im -= (seg[n] ?? 0) * Math.sin(ph);
    }
    const mag = re * re + im * im;
    if (mag > bestMag) {
      bestMag = mag;
      best = f;
    }
  }
  return best;
}

const cents = (f: number, ref: number): number => 1200 * Math.log2(f / ref);

describe('renderPluck', () => {
  for (const inst of INSTRUMENTS) {
    for (const [courseIndex, course] of inst.courses.entries()) {
      for (const fret of [0, 5, inst.visibleFrets]) {
        const midi = course.midi + fret;
        it(`${inst.id} MIDI ${midi} is in tune within 3 cents`, () => {
          const freq = midiToFreq(midi);
          const buf = renderPluck(pluckOptions(inst, courseIndex, midi, 0, SR, 0));
          expect(Math.abs(cents(estimatePitch(buf, SR, freq), freq))).toBeLessThan(3);
        });
      }
    }
  }

  it('inharmonicity puts upper partials where a stiff string has them', () => {
    const partialCents = (inharmonicity: number): number => {
      const f0 = midiToFreq(64);
      const buf = renderPluck({
        sampleRate: SR, freq: f0, t60: 2, loopDamping: 0.2, brightness: 0.9,
        pickPosition: 0.11, click: 0, inharmonicity, seed: 3,
      });
      const seg = buf.subarray(Math.floor(0.05 * SR), Math.floor(0.55 * SR));
      const k = 8; // 8th partial
      let best = 0;
      let bestMag = -1;
      for (let c = -20; c <= 60; c += 0.5) {
        const f = k * f0 * 2 ** (c / 1200);
        let re = 0;
        let im = 0;
        for (let n = 0; n < seg.length; n++) {
          const ph = (2 * Math.PI * f * n) / SR;
          re += (seg[n] ?? 0) * Math.cos(ph);
          im -= (seg[n] ?? 0) * Math.sin(ph);
        }
        const mag = re * re + im * im;
        if (mag > bestMag) {
          bestMag = mag;
          best = c;
        }
      }
      return best;
    };
    const B = 3e-4;
    // Theory: partial 8 sits 1200·log2(sqrt(1 + B·64)) ≈ 11 cents sharp.
    const expected = 1200 * Math.log2(Math.sqrt(1 + B * 64));
    expect(Math.abs(partialCents(0))).toBeLessThan(2);
    expect(Math.abs(partialCents(B) - expected)).toBeLessThan(4);
  });

  it('derives string tension and inharmonicity from real gauges', () => {
    const prim = getInstrument('prim');
    const e2 = prim.courses[3]!;
    const { tension, B } = stringPhysics(prim, e2, 0, midiToFreq(e2.midi));
    expect(tension).toBeGreaterThan(70);
    expect(tension).toBeLessThan(100);
    expect(B).toBeGreaterThan(1e-5);
    expect(B).toBeLessThan(4e-5);
    // Every string on every instrument lands in a plausible range for steel strings.
    for (const inst of INSTRUMENTS) {
      for (const c of inst.courses) {
        const p = stringPhysics(inst, c, 0, midiToFreq(c.midi));
        expect(p.tension, `${inst.id} ${c.midi}`).toBeGreaterThan(20);
        expect(p.tension, `${inst.id} ${c.midi}`).toBeLessThan(450);
        expect(p.B, `${inst.id} ${c.midi}`).toBeLessThan(1e-3);
      }
    }
  });

  it('decays and never clips', () => {
    const buf = renderPluck({
      sampleRate: SR,
      freq: 330,
      t60: 2,
      loopDamping: 0.25,
      brightness: 0.8,
      pickPosition: 0.12,
      click: 0.3,
      seed: 7,
    });
    const peak = (from: number, to: number): number => {
      let p = 0;
      for (let i = Math.floor(from * SR); i < Math.floor(to * SR); i++) p = Math.max(p, Math.abs(buf[i] ?? 0));
      return p;
    };
    expect(peak(0, buf.length / SR)).toBeLessThanOrEqual(1);
    expect(peak(1.5, 1.9)).toBeLessThan(peak(0, 0.1) * 0.1);
  });
});
