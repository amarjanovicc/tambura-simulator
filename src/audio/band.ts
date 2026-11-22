import { type BandEvent, arrange } from '../music/arrange';
import { type InstrumentId, getInstrument } from '../music/instruments';
import type { Song } from '../music/songs';
import type { AudioEngine } from './engine';

const LOOKAHEAD_S = 0.3;
const TICK_MS = 50;
const PAN: Record<InstrumentId, number> = { prim: -0.25, basprim: 0.25, kontra: 0.12, berde: 0 };

/**
 * Plays a song with the whole band. Notes are scheduled on the audio clock a little
 * ahead of time (a lookahead scheduler), so timing stays tight and Stop takes effect
 * within a fraction of a second. Muted instruments are not heard, but their notes are
 * still reported, so the neck can show the part to play along with.
 */
export class BandPlayer {
  private events: BandEvent[] = [];
  private next = 0;
  private start = 0;
  private end = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly visuals = new Set<ReturnType<typeof setTimeout>>();
  private muted = new Set<InstrumentId>();

  constructor(
    private readonly engine: AudioEngine,
    private readonly onNote: (e: BandEvent, audible: boolean) => void,
    private readonly onEnd: () => void,
  ) {}

  get playing(): boolean {
    return this.timer !== null;
  }

  setMuted(muted: Set<InstrumentId>): void {
    this.muted = muted;
  }

  play(song: Song): void {
    this.stop(false);
    this.engine.unlock();
    const { events, duration } = arrange(song);
    // Render every note up front (~1 ms each) so nothing is computed mid-song.
    for (const e of events) {
      const inst = getInstrument(e.inst);
      this.engine.render(inst, e.midi, inst.courses[e.course]?.doubled ?? false);
    }
    this.events = events;
    this.next = 0;
    this.start = this.engine.currentTime + 0.2;
    this.end = this.start + duration;
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.tick();
  }

  stop(notify = true): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    for (const id of this.visuals) clearTimeout(id);
    this.visuals.clear();
    this.engine.stopAll('band');
    if (notify) this.onEnd();
  }

  private tick(): void {
    const now = this.engine.currentTime;
    const horizon = now + LOOKAHEAD_S;
    while (this.next < this.events.length) {
      const e = this.events[this.next]!;
      const at = this.start + e.time;
      if (at > horizon) break;
      this.next++;
      const delay = Math.max(0, at - now);
      const audible = !this.muted.has(e.inst);
      const inst = getInstrument(e.inst);
      if (audible) {
        const n = inst.courses.length;
        this.engine.pluck({
          inst,
          course: e.course,
          midi: e.midi,
          velocity: e.velocity,
          doubled: inst.courses[e.course]?.doubled ?? false,
          delay,
          pan: PAN[e.inst] + (e.course / (n - 1) - 0.5) * 0.15,
          group: 'band',
          ...(e.staccato !== undefined ? { staccato: e.staccato } : {}),
        });
      }
      const id = setTimeout(() => {
        this.visuals.delete(id);
        this.onNote(e, audible);
      }, delay * 1000);
      this.visuals.add(id);
    }
    if (this.next >= this.events.length && now > this.end) this.stop();
  }
}
