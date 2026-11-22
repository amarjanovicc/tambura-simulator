import { describe, expect, it } from 'vitest';
import { INSTRUMENTS } from '../music/instruments';
import { midiToFreq } from '../music/notes';
import { renderPluck } from './karplus';

const SR = 48000;

/** Estimates the fundamental with normalised autocorrelation and parabolic interpolation. */
function estimatePitch(x: Float32Array, sr: number, expected: number): number {
  const start = Math.floor(0.15 * sr);
  const size = Math.floor(0.25 * sr);
  const seg = x.subarray(start, start + size);
  const minLag = Math.floor(sr / (expected * 1.2));
  const maxLag = Math.ceil(sr / (expected / 1.2));
  const r = (lag: number): number => {
    let s = 0;
    for (let i = 0; i + lag < seg.length; i++) s += (seg[i] ?? 0) * (seg[i + lag] ?? 0);
    return s;
  };
  let best = minLag;
  let bestR = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const v = r(lag);
    if (v > bestR) {
      bestR = v;
      best = lag;
    }
  }
  const a = r(best - 1);
  const b = bestR;
  const c = r(best + 1);
  const shift = (a - c) / (2 * (a - 2 * b + c));
  return sr / (best + shift);
}

const cents = (f: number, ref: number): number => 1200 * Math.log2(f / ref);

describe('renderPluck', () => {
  for (const inst of INSTRUMENTS) {
    for (const course of inst.courses) {
      for (const fret of [0, 5, inst.visibleFrets]) {
        const midi = course.midi + fret;
        it(`${inst.id} MIDI ${midi} is in tune within 3 cents`, () => {
          const freq = midiToFreq(midi);
          const buf = renderPluck({
            sampleRate: SR,
            freq,
            t60: inst.tone.t60Low,
            loopDamping: inst.tone.loopDamping,
            brightness: inst.tone.brightness,
            pickPosition: inst.tone.pickPosition,
            click: inst.tone.click,
            seed: 1,
          });
          expect(Math.abs(cents(estimatePitch(buf, SR, freq), freq))).toBeLessThan(3);
        });
      }
    }
  }

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
