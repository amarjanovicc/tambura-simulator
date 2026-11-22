/**
 * Extended Karplus-Strong plucked string (Jaffe & Smith), rendered offline into a buffer.
 *
 * - A noise burst, low-passed by plectrum hardness and comb-filtered by the plucking
 *   point, is fed into a delay loop of one period.
 * - The loop holds a one-zero low-pass (string damping, brighter for steel strings) and
 *   a first-order allpass for the fractional part of the period, so every note is in tune.
 * - The loop gain is set so the note decays by 60 dB in `t60` seconds.
 * - A short high-passed click on top imitates the plectrum hitting the string.
 *
 * Rendering one note takes ~1 ms, so notes are rendered on demand and cached.
 */
export interface PluckOptions {
  sampleRate: number;
  freq: number;
  t60: number;
  /** 0 < S <= 0.5: weight of the previous sample in the loop low-pass. */
  loopDamping: number;
  brightness: number;
  pickPosition: number;
  click: number;
  seed: number;
  maxSeconds?: number;
}

export function renderPluck(o: PluckOptions): Float32Array<ArrayBuffer> {
  const sr = o.sampleRate;
  const rand = mulberry32(o.seed);
  const S = clamp(o.loopDamping, 0.05, 0.5);

  // Total loop delay must equal one period: N (integer) + S (low-pass) + d (allpass).
  const period = sr / o.freq;
  let N = Math.floor(period - S - 0.1);
  let d = period - S - N;
  if (N < 2) {
    N = 2;
    d = Math.max(0.1, period - S - N);
  }
  const C = (1 - d) / (1 + d);

  // Loss per round trip so that the fundamental falls by 60 dB in t60 seconds,
  // compensating for the low-pass gain at the fundamental.
  const w = (2 * Math.PI * o.freq) / sr;
  const lpGain = Math.sqrt((1 - S) ** 2 + S ** 2 + 2 * S * (1 - S) * Math.cos(w));
  const g = Math.min(0.99995, 10 ** (-3 / (o.t60 * o.freq)) / lpGain);

  const excitation = makeExcitation(N, o.brightness, o.pickPosition, rand);

  const seconds = Math.min(o.maxSeconds ?? 5, o.t60 * 1.05);
  const len = Math.max(N * 4, Math.floor(seconds * sr));
  const out = new Float32Array(len);

  let lpPrev = 0;
  let apX1 = 0;
  let apY1 = 0;
  for (let n = 0; n < len; n++) {
    const delayed = n >= N ? (out[n - N] ?? 0) : 0;
    const lp = (1 - S) * delayed + S * lpPrev;
    lpPrev = delayed;
    const ap = C * lp + apX1 - C * apY1;
    apX1 = lp;
    apY1 = ap;
    out[n] = (n < N ? (excitation[n] ?? 0) : 0) + g * ap;
  }

  addClick(out, sr, o.click, rand);
  normalize(out, sr);
  fadeOut(out, sr, 0.06);
  return out;
}

function makeExcitation(N: number, brightness: number, pickPosition: number, rand: () => number): Float32Array {
  const noise = new Float32Array(N);
  // Plectrum hardness: one-pole low-pass on white noise.
  const a = 0.04 + 0.96 * clamp(brightness, 0, 1) ** 2;
  let y = 0;
  // Run twice around the buffer so the filter has no start-up transient.
  for (let pass = 0; pass < 2; pass++) {
    for (let n = 0; n < N; n++) {
      y += a * (rand() * 2 - 1 - y);
      if (pass === 1) noise[n] = y;
    }
  }
  // Plucking point: a comb filter removes harmonics with a node at that point.
  const M = Math.max(1, Math.round(clamp(pickPosition, 0.02, 0.5) * N));
  const exc = new Float32Array(N);
  let mean = 0;
  for (let n = 0; n < N; n++) {
    exc[n] = (noise[n] ?? 0) - (noise[(n - M + N) % N] ?? 0);
    mean += exc[n] ?? 0;
  }
  mean /= N;
  let peak = 1e-9;
  for (let n = 0; n < N; n++) {
    exc[n] = (exc[n] ?? 0) - mean;
    peak = Math.max(peak, Math.abs(exc[n] ?? 0));
  }
  for (let n = 0; n < N; n++) exc[n] = (exc[n] ?? 0) / peak;
  return exc;
}

function addClick(out: Float32Array, sr: number, amount: number, rand: () => number): void {
  if (amount <= 0) return;
  const len = Math.floor(0.004 * sr);
  let prev = 0;
  for (let n = 0; n < len && n < out.length; n++) {
    const x = rand() * 2 - 1;
    const hp = x - prev; // first difference = high-pass
    prev = x;
    out[n] = (out[n] ?? 0) + hp * amount * 0.5 * Math.exp((-n / len) * 5);
  }
}

/** Scales the attack to a fixed peak so all notes start equally loud. */
function normalize(out: Float32Array, sr: number): void {
  const end = Math.min(out.length, Math.floor(0.12 * sr));
  let peak = 1e-9;
  for (let n = 0; n < end; n++) peak = Math.max(peak, Math.abs(out[n] ?? 0));
  const k = 0.8 / peak;
  for (let n = 0; n < out.length; n++) out[n] = (out[n] ?? 0) * k;
}

function fadeOut(out: Float32Array, sr: number, seconds: number): void {
  const len = Math.min(out.length, Math.floor(seconds * sr));
  const start = out.length - len;
  for (let i = 0; i < len; i++) out[start + i] = (out[start + i] ?? 0) * (1 - i / len);
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
