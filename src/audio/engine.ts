import { type InstrumentDef, type InstrumentId, stringPhysics } from '../music/instruments';
import { midiToFreq } from '../music/notes';
import { renderPluck } from './karplus';

interface Voice {
  sources: AudioBufferSourceNode[];
  gain: GainNode;
}

export interface PluckRequest {
  course: number;
  midi: number;
  velocity: number;
  doubled: boolean;
  /** Seconds from now (used to spread a strum or schedule a song). */
  delay?: number;
  pan?: number;
  /** Defaults to the selected instrument. */
  inst?: InstrumentDef;
  /** Voice group: a new note chokes the previous note of the same group and course. */
  group?: string;
  /** Damp the note after this many seconds (short "ćuć" strokes). */
  staccato?: number;
  /** Extra level factor (used for sympathetic strings). */
  level?: number;
}

/**
 * Open strings ring along when a played note shares partials with them: semitones from
 * the open string to the played note -> relative strength.
 */
const SYMPATHY: ReadonlyMap<number, number> = new Map([
  [0, 1],
  [-12, 0.8],
  [12, 0.6],
  [-19, 0.5],
  [19, 0.4],
  [-24, 0.4],
  [24, 0.3],
  [-7, 0.3],
  [7, 0.3],
]);

const MAX_CACHE = 200;

/**
 * Web Audio graph:
 *   voice (buffer -> velocity low-pass -> gain -> pan) -> instrument body (high-pass + resonances)
 *     -> dry + short reverb -> limiter -> volume -> speakers
 *
 * Each instrument gets its own body chain, so the whole band can play in one context.
 * The AudioContext is created on the first user gesture (browsers block audio before
 * that). One voice per course and group: re-plucking chokes the previous note, like a
 * real string.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private mix!: GainNode;
  private volume!: GainNode;
  private instrument: InstrumentDef | null = null;
  private readonly bodies = new Map<InstrumentId, AudioNode>();
  private readonly cache = new Map<string, AudioBuffer>();
  private readonly voices = new Map<string, Voice>();
  private volumeLevel = 0.7;

  get running(): boolean {
    return this.ctx?.state === 'running';
  }

  /** Call from a user gesture (pointerdown/keydown). Safe to call repeatedly. */
  unlock(): void {
    if (!this.ctx) this.create();
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.state !== 'running') void ctx.resume();
  }

  setInstrument(inst: InstrumentDef): void {
    this.instrument = inst;
  }

  setVolume(v: number): void {
    this.volumeLevel = v;
    if (this.ctx) this.volume.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  /** Renders the given notes ahead of time in idle slices, so the first pluck is instant. */
  prewarm(notes: Iterable<{ course: number; midi: number }>, inst = this.instrument): void {
    if (!this.ctx || !inst) return;
    const queue = [...notes];
    const step = (): void => {
      const t0 = performance.now();
      while (queue.length && performance.now() - t0 < 8) {
        const n = queue.shift()!;
        this.render(inst, n.course, n.midi);
      }
      if (queue.length) schedule(step);
    };
    schedule(step);
  }

  /** Renders one note (both strings of a doubled course) right now. */
  render(inst: InstrumentDef, course: number, midi: number): void {
    if (!this.ctx) return;
    this.buffer(inst, course, midi, 0);
    if (inst.courses[course]?.doubled) this.buffer(inst, course, midi, 1);
  }

  /**
   * Plucks a course. Doubled courses get a second string, slightly detuned and a few
   * ms late, which gives the tamburica its shimmer.
   */
  pluck(req: PluckRequest): void {
    const ctx = this.ctx;
    const inst = req.inst ?? this.instrument;
    // A context still resuming (first gesture) just plays the note a moment later.
    if (!ctx || !inst || ctx.state === 'closed') return;
    const when = ctx.currentTime + Math.max(0, req.delay ?? 0);
    const key = `${req.group ?? 'user'}:${inst.id}:${req.course}`;
    this.choke(key, when);

    const v = Math.min(1, Math.max(0.05, req.velocity));
    const gain = ctx.createGain();
    gain.gain.value = (0.15 + 0.85 * v * v) * inst.tone.gain * 0.5 * (req.level ?? 1);

    // Softer plucks are darker: dynamic low-pass relative to the note.
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.min(18000, midiToFreq(req.midi) * (3 + 30 * v * v));
    lp.Q.value = 0.5;

    const panner = ctx.createStereoPanner();
    panner.pan.value = req.pan ?? 0;
    lp.connect(gain).connect(panner).connect(this.body(inst));

    const sources: AudioBufferSourceNode[] = [];
    const strings = req.doubled ? 2 : 1;
    for (let s = 0; s < strings; s++) {
      const src = ctx.createBufferSource();
      src.buffer = this.buffer(inst, req.course, req.midi, s);
      if (s === 1) src.playbackRate.value = 2 ** (inst.tone.courseDetune / 1200);
      src.connect(lp);
      src.start(when + s * (0.002 + Math.random() * 0.004));
      sources.push(src);
    }
    const voice: Voice = { sources, gain };
    sources[0]!.onended = () => {
      if (this.voices.get(key) === voice) this.voices.delete(key);
      gain.disconnect();
    };
    this.voices.set(key, voice);
    if (req.staccato !== undefined) this.choke(key, when + req.staccato);
    else if (req.group !== 'symp') this.sympathetic(inst, req, v, when - ctx.currentTime);
  }

  /**
   * The open strings that share partials with the played note start to ring softly, a
   * few ms later: the shimmer around a tamburica note.
   */
  private sympathetic(inst: InstrumentDef, req: PluckRequest, velocity: number, delay: number): void {
    const amount = inst.tone.sympathetic;
    if (amount <= 0) return;
    inst.courses.forEach((c, course) => {
      if (course === req.course) return;
      const strength = SYMPATHY.get(req.midi - c.midi);
      if (!strength) return;
      this.pluck({
        inst,
        course,
        midi: c.midi,
        velocity: 0.35,
        doubled: c.doubled,
        delay: delay + 0.012,
        pan: req.pan ?? 0,
        group: 'symp',
        level: amount * strength * velocity,
      });
    });
  }

  /** Damps every string of a voice group, or all strings. */
  stopAll(group?: string): void {
    if (!this.ctx) return;
    for (const key of [...this.voices.keys()]) {
      if (!group || key.startsWith(`${group}:`)) this.choke(key, this.ctx.currentTime);
    }
  }

  /** Seconds on the audio clock, for scheduling. */
  get currentTime(): number {
    return this.ctx?.currentTime ?? 0;
  }

  private choke(key: string, when: number): void {
    const prev = this.voices.get(key);
    if (!prev) return;
    this.voices.delete(key);
    const g = prev.gain.gain;
    g.cancelScheduledValues(when);
    g.setValueAtTime(g.value, when);
    g.linearRampToValueAtTime(0, when + 0.025);
    for (const s of prev.sources) {
      try {
        s.stop(when + 0.03);
      } catch {
        // Already stopped.
      }
    }
  }

  private buffer(inst: InstrumentDef, courseIndex: number, midi: number, variant: number): AudioBuffer {
    const ctx = this.ctx!;
    const key = `${inst.id}:${courseIndex}:${midi}:${variant}`;
    const hit = this.cache.get(key);
    if (hit) {
      // Refresh LRU position.
      this.cache.delete(key);
      this.cache.set(key, hit);
      return hit;
    }
    const lowest = inst.courses[0]!.midi;
    const highest = inst.courses[inst.courses.length - 1]!.midi + inst.visibleFrets;
    const k = Math.min(1, Math.max(0, (midi - lowest) / Math.max(1, highest - lowest)));
    const data = renderPluck(pluckOptions(inst, courseIndex, midi, variant, ctx.sampleRate, k));
    const buf = ctx.createBuffer(1, data.length, ctx.sampleRate);
    buf.copyToChannel(data, 0);
    this.cache.set(key, buf);
    if (this.cache.size > MAX_CACHE) this.cache.delete(this.cache.keys().next().value!);
    return buf;
  }

  /**
   * The instrument's body, created on first use: a high-pass (small bodies radiate little
   * bass) and a convolution with the body's impulse response, built from its air and
   * plate modes. Modes ring for a few tens of ms, which gives the woody colour that a
   * plain EQ lacks.
   */
  private body(inst: InstrumentDef): AudioNode {
    const existing = this.bodies.get(inst.id);
    if (existing) return existing;
    const ctx = this.ctx!;
    const input = ctx.createGain();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.Q.value = 0.7;
    hp.frequency.value = inst.tone.highpass;
    const conv = ctx.createConvolver();
    conv.normalize = false;
    conv.buffer = makeBodyImpulse(ctx, inst.tone.body);
    input.connect(hp).connect(conv).connect(this.mix);
    this.bodies.set(inst.id, input);
    return input;
  }

  private create(): void {
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    // Lets iOS play through the silent switch (Safari 16.4+).
    const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
    if (session) session.type = 'playback';

    const ctx = new Ctor({ latencyHint: 'interactive' });
    this.ctx = ctx;

    this.mix = ctx.createGain();

    // Warmth: a little more low body, a little less high edge, as heard a few metres
    // away in a wooden room rather than with an ear on the soundboard.
    const warm = ctx.createBiquadFilter();
    warm.type = 'lowshelf';
    warm.frequency.value = 220;
    warm.gain.value = 3;
    const soft = ctx.createBiquadFilter();
    soft.type = 'highshelf';
    soft.frequency.value = 4200;
    soft.gain.value = -5;
    this.mix.connect(warm).connect(soft);

    // Depth: a warm room behind the instrument, arriving a moment after the direct sound.
    const preDelay = ctx.createDelay(0.1);
    preDelay.delayTime.value = 0.018;
    const reverb = ctx.createConvolver();
    reverb.buffer = makeRoomImpulse(ctx, 1.8);
    const wet = ctx.createGain();
    wet.gain.value = 0.24;

    // A gentle safety limiter only: heavy compression made the band sound too loud and flat.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 8;
    limiter.ratio.value = 3;
    limiter.attack.value = 0.005;
    limiter.release.value = 0.25;
    this.volume = ctx.createGain();
    this.volume.gain.value = this.volumeLevel;

    soft.connect(limiter);
    soft.connect(preDelay).connect(reverb).connect(wet).connect(limiter);
    limiter.connect(this.volume).connect(ctx.destination);

    // A silent buffer finishes unlocking on older iOS.
    const silent = ctx.createBufferSource();
    silent.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    silent.connect(ctx.destination);
    silent.start();
  }
}

/**
 * String-model settings for one note: the instrument's tone, plus the physics of the
 * string it is played on. Wound strings lose their highs a little faster (the wrap
 * adds damping) and are less stiff for their weight than plain ones.
 */
export function pluckOptions(
  inst: InstrumentDef,
  courseIndex: number,
  midi: number,
  variant: number,
  sampleRate: number,
  register: number,
): Parameters<typeof renderPluck>[0] {
  const course = inst.courses[courseIndex] ?? inst.courses[0]!;
  const freq = midiToFreq(midi);
  const { B } = stringPhysics(inst, course, Math.max(0, midi - course.midi), freq);
  return {
    sampleRate,
    freq,
    t60: inst.tone.t60Low + (inst.tone.t60High - inst.tone.t60Low) * register,
    loopDamping: Math.min(0.5, inst.tone.loopDamping + (course.wound ? 0.06 : 0)),
    brightness: inst.tone.brightness,
    pickPosition: inst.tone.pickPosition + variant * 0.015,
    click: inst.tone.click,
    inharmonicity: B,
    promptShare: inst.tone.promptShare,
    seed: midi * 31 + courseIndex * 131 + variant * 7919 + 1,
  };
}

/**
 * Body impulse response: the direct sound plus one decaying sine per mode. A mode with
 * quality factor Q at frequency f rings with time constant Q / (pi f); its amplitude is
 * set so the response at f is boosted by the given number of dB.
 */
export function makeBodyImpulse(
  ctx: BaseAudioContext,
  modes: ReadonlyArray<readonly [number, number, number]>,
): AudioBuffer {
  const sr = ctx.sampleRate;
  const longest = Math.max(0.02, ...modes.map(([f, q]) => (7 * q) / (Math.PI * f)));
  const len = Math.floor(Math.min(0.5, longest) * sr);
  const buf = ctx.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);
  data[0] = 1;
  for (const [f, q, db] of modes) {
    const tau = q / (Math.PI * f);
    const amp = ((10 ** (db / 20) - 1) * 2) / (tau * sr);
    const w = (2 * Math.PI * f) / sr;
    for (let n = 1; n < len; n++) data[n] = (data[n] ?? 0) + amp * Math.exp(-n / (tau * sr)) * Math.sin(w * n);
  }
  return buf;
}

/** A small wooden room: decaying stereo noise with the highs rolling off over time. */
function makeRoomImpulse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(seconds * ctx.sampleRate);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    let y = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const a = 0.6 - 0.5 * t; // a warm room: dark, and darker as the tail decays
      y += a * (Math.random() * 2 - 1 - y);
      data[i] = y * (1 - t) ** 3 * (i < 200 ? i / 200 : 1);
    }
  }
  return buf;
}

function schedule(fn: () => void): void {
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback;
  if (ric) ric(fn);
  else setTimeout(fn, 16);
}
