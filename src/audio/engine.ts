import type { InstrumentDef } from '../music/instruments';
import { midiToFreq } from '../music/notes';
import { renderPluck } from './karplus';

interface Voice {
  sources: AudioBufferSourceNode[];
  gain: GainNode;
}

const MAX_CACHE = 160;

/**
 * Web Audio graph:
 *   voice (buffer -> velocity low-pass -> gain -> pan) -> body (high-pass + resonances)
 *     -> dry + short reverb -> limiter -> volume -> speakers
 *
 * The AudioContext is created on the first user gesture (browsers block audio before
 * that). One voice per course: re-plucking a course chokes its previous note, like a
 * real string.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private bodyIn!: GainNode;
  private bodyFilters: BiquadFilterNode[] = [];
  private highpass!: BiquadFilterNode;
  private volume!: GainNode;
  private instrument: InstrumentDef | null = null;
  private readonly cache = new Map<string, AudioBuffer>();
  private readonly voices = new Map<number, Voice>();
  private volumeLevel = 0.8;

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
    if (this.ctx) this.applyBody(inst);
  }

  setVolume(v: number): void {
    this.volumeLevel = v;
    if (this.ctx) this.volume.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  /** Renders the given notes ahead of time in idle slices, so the first pluck is instant. */
  prewarm(midis: Iterable<number>, doubled: Set<number>): void {
    const queue = [...new Set(midis)];
    const step = (): void => {
      const t0 = performance.now();
      while (queue.length && performance.now() - t0 < 6) {
        const midi = queue.shift()!;
        this.buffer(midi, 0);
        if (doubled.has(midi)) this.buffer(midi, 1);
      }
      if (queue.length) schedule(step);
    };
    if (this.ctx) schedule(step);
  }

  /**
   * Plucks a course. `delay` is seconds from now (used to spread a strum).
   * Doubled courses get a second string, slightly detuned and a few ms late, which
   * gives the tamburica its shimmer.
   */
  pluck(course: number, midi: number, velocity: number, doubled: boolean, delay = 0, pan = 0): void {
    const ctx = this.ctx;
    const inst = this.instrument;
    // A context still resuming (first gesture) just plays the note a moment later.
    if (!ctx || !inst || ctx.state === 'closed') return;
    const when = ctx.currentTime + Math.max(0, delay);
    this.choke(course, when);

    const v = Math.min(1, Math.max(0.05, velocity));
    const gain = ctx.createGain();
    gain.gain.value = (0.15 + 0.85 * v * v) * inst.tone.gain * 0.5;

    // Softer plucks are darker: dynamic low-pass relative to the note.
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.min(18000, midiToFreq(midi) * (3 + 30 * v * v));
    lp.Q.value = 0.5;

    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    lp.connect(gain).connect(panner).connect(this.bodyIn);

    const sources: AudioBufferSourceNode[] = [];
    const strings = doubled ? 2 : 1;
    for (let s = 0; s < strings; s++) {
      const src = ctx.createBufferSource();
      src.buffer = this.buffer(midi, s);
      if (s === 1) src.playbackRate.value = 2 ** (inst.tone.courseDetune / 1200);
      src.connect(lp);
      src.start(when + s * (0.002 + Math.random() * 0.004));
      sources.push(src);
    }
    const voice: Voice = { sources, gain };
    sources[0]!.onended = () => {
      if (this.voices.get(course) === voice) this.voices.delete(course);
      gain.disconnect();
    };
    this.voices.set(course, voice);
  }

  /** Damps every string (used when switching instrument). */
  stopAll(): void {
    if (!this.ctx) return;
    for (const course of [...this.voices.keys()]) this.choke(course, this.ctx.currentTime);
  }

  private choke(course: number, when: number): void {
    const prev = this.voices.get(course);
    if (!prev) return;
    this.voices.delete(course);
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

  private buffer(midi: number, variant: number): AudioBuffer {
    const ctx = this.ctx!;
    const inst = this.instrument!;
    const key = `${inst.id}:${midi}:${variant}`;
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
    const data = renderPluck({
      sampleRate: ctx.sampleRate,
      freq: midiToFreq(midi),
      t60: inst.tone.t60Low + (inst.tone.t60High - inst.tone.t60Low) * k,
      loopDamping: inst.tone.loopDamping,
      brightness: inst.tone.brightness,
      pickPosition: inst.tone.pickPosition + variant * 0.015,
      click: inst.tone.click,
      seed: midi * 31 + variant * 7919 + 1,
    });
    const buf = ctx.createBuffer(1, data.length, ctx.sampleRate);
    buf.copyToChannel(data, 0);
    this.cache.set(key, buf);
    if (this.cache.size > MAX_CACHE) this.cache.delete(this.cache.keys().next().value!);
    return buf;
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

    this.bodyIn = ctx.createGain();
    this.highpass = ctx.createBiquadFilter();
    this.highpass.type = 'highpass';
    this.highpass.Q.value = 0.7;
    this.bodyIn.connect(this.highpass);

    let node: AudioNode = this.highpass;
    for (let i = 0; i < 3; i++) {
      const f = ctx.createBiquadFilter();
      f.type = 'peaking';
      node.connect(f);
      node = f;
      this.bodyFilters.push(f);
    }

    const reverb = ctx.createConvolver();
    reverb.buffer = makeRoomImpulse(ctx, 1.3);
    const wet = ctx.createGain();
    wet.gain.value = 0.16;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.knee.value = 6;
    limiter.ratio.value = 6;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.2;
    this.volume = ctx.createGain();
    this.volume.gain.value = this.volumeLevel;

    node.connect(limiter);
    node.connect(reverb).connect(wet).connect(limiter);
    limiter.connect(this.volume).connect(ctx.destination);

    // A silent buffer finishes unlocking on older iOS.
    const silent = ctx.createBufferSource();
    silent.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    silent.connect(ctx.destination);
    silent.start();

    if (this.instrument) this.applyBody(this.instrument);
  }

  private applyBody(inst: InstrumentDef): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    this.highpass.frequency.setTargetAtTime(inst.tone.highpass, t, 0.01);
    this.bodyFilters.forEach((f, i) => {
      const [freq, q, gain] = inst.tone.body[i] ?? [1000, 1, 0];
      f.frequency.setTargetAtTime(freq, t, 0.01);
      f.Q.setTargetAtTime(q, t, 0.01);
      f.gain.setTargetAtTime(gain, t, 0.01);
    });
  }
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
      const a = 0.9 - 0.75 * t; // low-pass gets darker as the tail decays
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
