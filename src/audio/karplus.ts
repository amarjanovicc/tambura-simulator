/**
 * Plucked steel string: extended Karplus-Strong (Jaffe & Smith), rendered offline.
 *
 * - Excitation: the bridge force of a plectrum stroke (a pluck at the picking point plus
 *   the strike of the plectrum passing), rounded by the plectrum's width, with a little
 *   noise, fed into a delay loop of one period.
 * - Loop: a one-zero low-pass (string losses, brighter for steel), a chain of allpass
 *   filters for stiffness (upper partials run slightly sharp, the metallic edge of steel
 *   strings) and a first-order allpass for the fractional period. The phase delay of every
 *   filter at the fundamental is computed exactly, so each note stays in tune.
 * - Two polarisations: the string vibrates in two planes that decay at different rates.
 *   A fast-decaying copy gives the bright "prompt" sound, the slow one the aftersound;
 *   a fraction of a cent between them adds a slow beat.
 * - A short high-passed click on top imitates the plectrum hitting the string.
 *
 * Rendering one note takes ~1–2 ms, so notes are rendered on demand and cached.
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
  /** Above this frequency the strike of the plectrum outweighs the pluck (default 2 kHz). */
  strikeHz?: number;
  /**
   * Inharmonicity coefficient B of a stiff string: partial k sounds at
   * k·f0·sqrt(1 + B·k²). Steel strings are around 1e-4 to 5e-4.
   */
  inharmonicity?: number;
  /** 0..1, share of the fast-decaying polarisation. */
  promptShare?: number;
  seed: number;
  maxSeconds?: number;
}

/** Partial whose frequency the dispersion filters are fitted to. */
const FIT_PARTIAL = 6;
/** The prompt sound decays this much faster than the aftersound. */
const PROMPT_DECAY_RATIO = 0.22;
/** Detuning of the second polarisation, in cents. */
const POLARISATION_CENTS = 0.6;
/** Share of noise in the pluck, so repeated notes are never sample-identical. */
const NOISE_SHARE = 0.08;

export function renderPluck(o: PluckOptions): Float32Array<ArrayBuffer> {
  const sr = o.sampleRate;
  const rand = mulberry32(o.seed);
  // Up to about -45 dB: quieter than that the tail is lost under the room anyway.
  const seconds = Math.min(o.maxSeconds ?? 5, o.t60 * 0.8);
  const len = Math.max(64, Math.floor(seconds * sr));

  const loop = makeLoop(o, o.freq);
  const excitation = makeExcitation(loop.N, sr, o.brightness, o.pickPosition, o.strikeHz ?? 2000, rand);
  const out = new Float32Array(len);
  runLoop(out, excitation, loop, o.t60, o.freq, 1 - (o.promptShare ?? 0));

  const prompt = o.promptShare ?? 0;
  if (prompt > 0) {
    const f2 = o.freq * 2 ** (POLARISATION_CENTS / 1200);
    const loop2 = makeLoop(o, f2);
    const exc2 = loop2.N === loop.N ? excitation : resample(excitation, loop2.N);
    const fast = new Float32Array(len);
    runLoop(fast, exc2, loop2, o.t60 * PROMPT_DECAY_RATIO, f2, prompt);
    for (let n = 0; n < len; n++) out[n] = (out[n] ?? 0) + (fast[n] ?? 0);
  }

  addClick(out, sr, o.click, rand);
  normalize(out, sr);
  fadeOut(out, sr, 0.3);
  return out;
}

interface Loop {
  N: number;
  S: number;
  C: number;
  a: number;
  stages: number;
  lpGain: number;
}

/** Splits one period into an integer delay plus filters whose phase delays fill the rest. */
function makeLoop(o: PluckOptions, freq: number): Loop {
  const sr = o.sampleRate;
  const S = clamp(o.loopDamping, 0.05, 0.5);
  const w = (2 * Math.PI * freq) / sr;
  const period = sr / freq;

  // Stiffness: a chain of first-order allpasses with a negative coefficient delays low
  // frequencies more than high ones, so upper partials come round the loop sooner and
  // run sharp. The coefficient is fitted so partial FIT_PARTIAL lands where a string
  // with inharmonicity B puts it.
  const { a, stages } = fitDispersion(o.inharmonicity ?? 0, period, freq, sr);
  const apStage = (x: number): ((z: Complex) => Complex) => (z) => cDiv(cAdd(cScale(x, ONE), z), cAdd(ONE, cScale(x, z)));
  const lpDelay = phaseDelay(w, (z) => cAdd(cScale(1 - S, ONE), cScale(S, z)));
  const apDelay = stages ? stages * phaseDelay(w, apStage(a)) : 0;

  const rest = period - lpDelay - apDelay;
  let N = Math.floor(rest - 0.2);
  if (N < 2) N = 2;
  const d = rest - N;
  // First-order allpass for the fractional delay d, refined so its exact phase delay at
  // the fundamental (not just its low-frequency approximation) equals d.
  let target = d;
  let C = (1 - target) / (1 + target);
  for (let i = 0; i < 4; i++) {
    const actual = phaseDelay(w, apStage(C));
    target += d - actual;
    target = clamp(target, 0.05, 1.95);
    C = (1 - target) / (1 + target);
  }
  const lpGain = Math.sqrt((1 - S) ** 2 + S ** 2 + 2 * S * (1 - S) * Math.cos(w));
  return { N, S, C, a, stages, lpGain };
}

/**
 * Finds allpass stages and coefficient so that the loop is shorter at partial k by as
 * much as the stiff-string formula asks: D(w_k) = P / sqrt(1 + B·k²).
 */
function fitDispersion(B: number, period: number, freq: number, sr: number): { a: number; stages: number } {
  if (B <= 0) return { a: 0, stages: 0 };
  const k = FIT_PARTIAL;
  const wk = (2 * Math.PI * Math.min(k * freq, sr * 0.45)) / sr;
  const w0 = (2 * Math.PI * freq) / sr;
  const kk = Math.min(k, (sr * 0.45) / freq);
  const needed = period * (1 - 1 / Math.sqrt(1 + B * kk * kk));
  const stageDelay = (a: number, w: number): number =>
    phaseDelay(w, (z) => cDiv(cAdd(cScale(a, ONE), z), cAdd(ONE, cScale(a, z))));
  for (const stages of [2, 4, 8, 12]) {
    // Allpass delay at DC is (1-a)/(1+a) per stage; keep the chain well inside the period.
    const spread = (a: number): number => stages * (stageDelay(a, w0) - stageDelay(a, wk));
    let lo = -0.95;
    while (lo < 0 && stages * ((1 - lo) / (1 + lo)) > period * 0.6) lo += 0.01;
    if (lo >= 0 || spread(lo) < needed) continue;
    let hi = 0;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (spread(mid) > needed) lo = mid;
      else hi = mid;
    }
    return { a: (lo + hi) / 2, stages };
  }
  return { a: 0, stages: 0 };
}

function runLoop(out: Float32Array, excitation: Float32Array, loop: Loop, t60: number, freq: number, level: number): void {
  const { N, S, C, a, stages, lpGain } = loop;
  // Loss per round trip so the fundamental falls by 60 dB in t60 seconds.
  const g = Math.min(0.99995, 10 ** (-3 / (t60 * freq)) / lpGain);
  let lpPrev = 0;
  const sx = new Float64Array(stages);
  const sy = new Float64Array(stages);
  let fx = 0;
  let fy = 0;
  for (let n = 0; n < out.length; n++) {
    const delayed = n >= N ? (out[n - N] ?? 0) : 0;
    let x = (1 - S) * delayed + S * lpPrev;
    lpPrev = delayed;
    for (let k = 0; k < stages; k++) {
      const y = a * x + (sx[k] ?? 0) - a * (sy[k] ?? 0);
      sx[k] = x;
      sy[k] = y;
      x = y;
    }
    const y = C * x + fx - C * fy;
    fx = x;
    fy = y;
    out[n] = (n < N ? (excitation[n] ?? 0) : 0) + g * y;
  }
  if (level !== 1) for (let n = 0; n < out.length; n++) out[n] = (out[n] ?? 0) * level;
}

/**
 * One period of the force a plectrum pluck puts on the bridge.
 *
 * A string pulled aside at fraction p of its length and let go sends a rectangular wave
 * round the loop (duty cycle p), whose harmonics fall as sin(kπp)/k: a strong
 * fundamental and a natural roll-off. A plain noise burst, as in basic Karplus-Strong,
 * gives every note a random, lumpy spectrum (±10 dB per harmonic from note to note) and a
 * weak fundamental. The plectrum is not a point: its width and the moment it takes to
 * slide off the string round the corners of the wave (a low-pass set by `brightness`).
 * A little filtered noise on top keeps notes from being identical.
 */
function makeExcitation(
  N: number,
  sr: number,
  brightness: number,
  pickPosition: number,
  strikeHz: number,
  rand: () => number,
): Float32Array {
  const M = Math.max(1, Math.round(clamp(pickPosition, 0.02, 0.5) * N));
  const raw = new Float32Array(N);
  for (let n = 0; n < N; n++) raw[n] = (n < M ? 1 : 0) + NOISE_SHARE * (rand() * 2 - 1);
  // The plectrum also pushes the string as it passes: a strike, whose harmonics do not
  // fall with k. Above strikeHz it outweighs the pluck, which keeps the steel edge.
  const strike = sr / (2 * Math.PI * strikeHz);
  raw[0] = (raw[0] ?? 0) + strike;
  raw[M % N] = (raw[M % N] ?? 0) - strike;

  // Plectrum smoothing: a one-pole low-pass, run twice round the period so it has no
  // start-up transient.
  const b = clamp(brightness, 0, 1);
  const cutoff = 1200 + 8000 * b * b;
  const a = 1 - Math.exp((-2 * Math.PI * cutoff) / sr);
  const exc = new Float32Array(N);
  let y = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (let n = 0; n < N; n++) {
      y += a * ((raw[n] ?? 0) - y);
      if (pass === 1) exc[n] = y;
    }
  }
  let mean = 0;
  for (let n = 0; n < N; n++) mean += exc[n] ?? 0;
  mean /= N;
  let peak = 1e-9;
  for (let n = 0; n < N; n++) {
    exc[n] = (exc[n] ?? 0) - mean;
    peak = Math.max(peak, Math.abs(exc[n] ?? 0));
  }
  for (let n = 0; n < N; n++) exc[n] = (exc[n] ?? 0) / peak;
  return exc;
}

function resample(x: Float32Array, n: number): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = x[Math.min(x.length - 1, Math.floor((i * x.length) / n))] ?? 0;
  return out;
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

// --- Small complex-number helpers for exact phase delays -------------------------------

type Complex = readonly [number, number];
const ONE: Complex = [1, 0];
const cAdd = (x: Complex, y: Complex): Complex => [x[0] + y[0], x[1] + y[1]];
const cScale = (k: number, x: Complex): Complex => [k * x[0], k * x[1]];
const cDiv = (x: Complex, y: Complex): Complex => {
  const d = y[0] * y[0] + y[1] * y[1];
  return [(x[0] * y[0] + x[1] * y[1]) / d, (x[1] * y[0] - x[0] * y[1]) / d];
};

/** Phase delay in samples of H at angular frequency w, where H is written in z^-1. */
function phaseDelay(w: number, H: (zInv: Complex) => Complex): number {
  const h = H([Math.cos(w), -Math.sin(w)]);
  let phase = Math.atan2(h[1], h[0]);
  if (phase > 0) phase -= 2 * Math.PI;
  return -phase / w;
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
