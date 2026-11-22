import { describe, expect, it } from 'vitest';
import { INSTRUMENTS, getInstrument, stringPhysics } from '../music/instruments';
import { midiToFreq } from '../music/notes';
import { makeBodyImpulse, pluckOptions } from './engine';
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

/** Enough of a BaseAudioContext for makeBodyImpulse. */
function fakeContext(): BaseAudioContext {
  const createBuffer = (channels: number, length: number, sampleRate: number): AudioBuffer => {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { length, sampleRate, numberOfChannels: channels, getChannelData: (c: number) => data[c]! } as unknown as AudioBuffer;
  };
  // A stand-in for the browser object: only the members makeBodyImpulse reads.
  return { sampleRate: SR, createBuffer } as unknown as BaseAudioContext;
}

function convolve(x: Float32Array, h: Float32Array): Float32Array {
  const y = new Float32Array(x.length);
  for (let n = 0; n < x.length; n++) {
    const xn = x[n] ?? 0;
    if (xn === 0) continue;
    const end = Math.min(h.length, x.length - n);
    for (let k = 0; k < end; k++) y[n + k]! += xn * (h[k] ?? 0);
  }
  return y;
}

/** Level in dB of the partial at `f`, over 30–200 ms (Hann window). */
function harmonicDb(x: Float32Array, f: number): number {
  const a = Math.floor(0.03 * SR);
  const b = Math.floor(0.2 * SR);
  let re = 0;
  let im = 0;
  for (let n = a; n < b; n++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * (n - a)) / (b - a));
    const ph = (2 * Math.PI * f * n) / SR;
    re += (x[n] ?? 0) * w * Math.cos(ph);
    im += (x[n] ?? 0) * w * Math.sin(ph);
  }
  return 20 * Math.log10(Math.hypot(re, im) + 1e-12);
}

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

  it('gives every stroke the same timbre', () => {
    // A noise-burst pluck made each note's harmonics random (±10 dB from note to note)
    // and the fundamental weak; the plectrum model must not. Strokes may differ a little,
    // on purpose: each one picks the string at a slightly different point.
    for (const inst of INSTRUMENTS) {
      const course = inst.courses.length - 1;
      const midi = inst.courses[course]!.midi;
      const f0 = midiToFreq(midi);
      const { B } = stringPhysics(inst, inst.courses[course]!, 0, f0);
      const levels = [0, 1, 2, 3].map((variant) => {
        const x = renderPluck(pluckOptions(inst, course, midi, variant, SR, 0.5));
        return [1, 2, 3, 4].map((k) => harmonicDb(x, k * f0 * Math.sqrt(1 + B * k * k)));
      });
      // The berde carries the bass: its fundamental leads.
      if (inst.id === 'berde') {
        for (const row of levels) expect(Math.max(...row.slice(1))).toBeLessThanOrEqual(row[0]!);
      }
      for (let k = 0; k < 4; k++) {
        const column = levels.map((row) => row[k]!);
        expect(Math.max(...column) - Math.min(...column), `${inst.id} harmonic ${k + 1}`).toBeLessThan(5);
      }
    }
  });

  it("matches Mandić's strongest partials of the prim's open strings, through the body", () => {
    // Anechoic measurements of Srijem prims: e² and h¹ peak at H2, fis¹ at H3, cis¹ at H4.
    const inst = getInstrument('prim');
    const ir = makeBodyImpulse(fakeContext(), inst.tone.body).getChannelData(0);
    const expected = [4, 3, 2, 2];
    inst.courses.forEach((course, index) => {
      const f0 = midiToFreq(course.midi);
      const sums = new Array<number>(6).fill(0);
      for (const variant of [0, 1, 2, 3]) {
        const dry = renderPluck(pluckOptions(inst, index, course.midi, variant, SR, 0.3));
        const wet = convolve(dry.subarray(0, Math.floor(0.2 * SR)), ir);
        for (let k = 1; k <= 6; k++) sums[k - 1]! += harmonicDb(wet, k * f0);
      }
      const strongest = sums.indexOf(Math.max(...sums)) + 1;
      expect(strongest, `prim course ${index}`).toBe(expected[index]);
    });
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
