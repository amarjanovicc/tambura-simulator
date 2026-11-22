import './style.css';
import { BandPlayer } from './audio/band';
import { AudioEngine } from './audio/engine';
import { type Lang, t } from './i18n';
import { Controller } from './input/controller';
import { CHORDS } from './music/chords';
import { INSTRUMENTS, type InstrumentId, getInstrument, resolveInstrumentId } from './music/instruments';
import { helmholtz } from './music/notes';
import { SONGS, type Tune, isBacking } from './music/songs';
import { chordById } from './music/chords';
import { Player } from './player';
import { Renderer, type ViewOptions } from './view/renderer';

interface Prefs {
  lang: Lang;
  instrument: InstrumentId;
  tremolo: boolean;
  showNotes: boolean;
  showKeys: boolean;
  neckOnly: boolean;
  minusOne: boolean;
  song: string;
  volume: number;
}

const PREFS_KEY = 'tambura-simulator:prefs';

function loadPrefs(): Prefs {
  const browserLang: Lang = /^(hr|bs|sr|sh)/i.test(navigator.language) ? 'hr' : 'en';
  const defaults: Prefs = {
    lang: browserLang,
    instrument: 'prim',
    tremolo: false,
    showNotes: true,
    showKeys: false,
    neckOnly: false,
    minusOne: false,
    song: SONGS[0]!.id,
    volume: 0.7,
  };
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<Prefs>;
    const merged = { ...defaults, ...saved };
    // Saved before the switch to the Srijem names (e.g. "bisernica").
    merged.instrument = resolveInstrumentId(merged.instrument) ?? defaults.instrument;
    return merged;
  } catch {
    return defaults;
  }
}

function savePrefs(p: Prefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    // Private mode or storage disabled: preferences just don't persist.
  }
}

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el as T;
};

const prefs = loadPrefs();
const hashId = location.hash.slice(1);
const fromHash = resolveInstrumentId(hashId);
if (fromHash) prefs.instrument = fromHash;

const engine = new AudioEngine();
engine.setVolume(prefs.volume);
const player = new Player(engine, getInstrument(prefs.instrument));
player.tremolo = prefs.tremolo;

const canvas = $<HTMLCanvasElement>('board');
const viewOptions = (): ViewOptions => ({
  lang: prefs.lang,
  showKeys: prefs.showKeys,
  showNotes: prefs.showNotes,
  neckOnly: prefs.neckOnly,
});
const renderer = new Renderer(canvas, player, viewOptions());

let warmed = false;
new Controller(canvas, renderer, player, engine, () => {
  if (warmed) return;
  warmed = true;
  $('hint').hidden = true;
  player.prewarm();
});

const bandBtn = $<HTMLButtonElement>('band-btn');
const nowChord = $('now-chord');
const selectedSong = (): Tune => SONGS.find((x) => x.id === prefs.song) ?? SONGS[0]!;
/** The chord the player had before a backing track took over the neck. */
let chordBefore: string | null = null;
let playing: Tune | null = null;

const band = new BandPlayer(
  engine,
  (e, audible) => {
    if (e.inst === player.inst.id) player.showBandNote(e.course, e.fret, e.velocity, audible);
  },
  () => {
    player.clearBand();
    nowChord.hidden = true;
    if (playing && isBacking(playing)) player.selectChord(chordBefore, false);
    playing = null;
    renderBandButton();
  },
  (id, next) => {
    const s = t(prefs.lang);
    const label = (c: string): string => chordById(c)?.label[prefs.lang] ?? c;
    nowChord.querySelector('.now')!.textContent = label(id);
    nowChord.querySelector('.next')!.textContent = next ? `${s.nextChord} ${label(next)}` : '';
    nowChord.hidden = false;
    nowChord.animate([{ transform: 'scale(1.08)' }, { transform: 'none' }], { duration: 220, easing: 'ease-out' });
    // With a backing track the neck shows the chord, so you can strum along or find the tune.
    if (playing && isBacking(playing)) player.selectChord(id, false);
  },
);
const mutedSet = (): Set<InstrumentId> => new Set(prefs.minusOne ? [player.inst.id] : []);
band.setMuted(mutedSet());

function renderBandButton(): void {
  const s = t(prefs.lang);
  bandBtn.textContent = band.playing ? s.stopSong : s.playSong;
  bandBtn.setAttribute('aria-pressed', String(band.playing));
}

bandBtn.addEventListener('click', () => {
  if (band.playing) band.stop();
  else {
    band.setMuted(mutedSet());
    chordBefore = player.chordId;
    playing = selectedSong();
    band.play(playing);
  }
  renderBandButton();
});

const songSelects = [...document.querySelectorAll<HTMLSelectElement>('.song-select')];
function renderSongs(): void {
  for (const select of songSelects) {
    select.replaceChildren(
      ...SONGS.map((song) => {
        const option = document.createElement('option');
        option.value = song.id;
        option.textContent = song.title[prefs.lang];
        return option;
      }),
    );
    select.value = selectedSong().id;
  }
  bandBtn.title = selectedSong().title[prefs.lang];
}
for (const select of songSelects) {
  select.addEventListener('change', () => {
    prefs.song = select.value;
    savePrefs(prefs);
    if (band.playing) band.stop();
    renderSongs();
  });
}

const instrumentsNav = $('instruments');
const chordsRow = $('chords');

function renderInstruments(): void {
  instrumentsNav.replaceChildren(
    ...INSTRUMENTS.map((inst) => {
      const b = document.createElement('button');
      b.type = 'button';
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = inst.name[prefs.lang];
      const alias = document.createElement('span');
      alias.className = 'alias';
      alias.textContent = inst.alias[prefs.lang];
      b.append(name, alias);
      b.setAttribute('aria-pressed', String(inst.id === player.inst.id));
      b.addEventListener('click', () => selectInstrument(inst.id));
      return b;
    }),
  );
  // Drives the sliding underline under the selected tab.
  instrumentsNav.style.setProperty('--active', String(INSTRUMENTS.findIndex((i) => i.id === player.inst.id)));
}

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

/** The new instrument rises into place, so the switch reads as a change, not a flicker. */
function animateSwap(): void {
  if (reducedMotion.matches) return;
  const ease = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
  canvas.animate(
    [
      { opacity: 0, transform: 'translateY(10px) scale(0.985)' },
      { opacity: 1, transform: 'none' },
    ],
    { duration: 320, easing: ease },
  );
  $('info').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: ease });
}

function renderChords(): void {
  const s = t(prefs.lang);
  const none = document.createElement('button');
  none.type = 'button';
  none.className = 'none';
  none.dataset['chord'] = '';
  none.setAttribute('aria-label', s.noChord);
  // A cross on the phone strip, the words in the rail.
  const cross = document.createElement('span');
  cross.className = 'none-icon';
  cross.setAttribute('aria-hidden', 'true');
  cross.textContent = '×';
  const label = document.createElement('span');
  label.className = 'none-text';
  label.textContent = s.noChord;
  none.append(cross, label);
  none.setAttribute('aria-pressed', String(player.chordId === null));
  none.addEventListener('click', () => player.selectChord(null, false));

  const buttons = CHORDS.filter((c) => player.voicings.has(c.id)).map((c) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = c.label[prefs.lang];
    b.dataset['chord'] = c.id;
    b.setAttribute('aria-pressed', String(player.chordId === c.id));
    const index = CHORDS.indexOf(c);
    if (index < 9) {
      const kbd = document.createElement('kbd');
      kbd.textContent = `⇧${index + 1}`;
      b.append(kbd);
    }
    b.addEventListener('pointerdown', (e) => {
      // Play on press, not on click, so the chord sounds without delay.
      if (e.button !== 0) return;
      engine.unlock();
      player.selectChord(c.id, true);
    });
    b.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') player.selectChord(c.id, true);
    });
    return b;
  });
  chordsRow.replaceChildren(none, ...buttons);
}

function renderInfo(): void {
  const s = t(prefs.lang);
  const inst = player.inst;
  // Strings from the top, the way tamburaši say a tuning: e² e² h¹ fis¹ cis¹.
  const strings = [...inst.courses]
    .reverse()
    .flatMap((c) => (c.doubled ? [c.midi, c.midi] : [c.midi]))
    .map((m) => helmholtz(m, prefs.lang))
    .join(' ');
  const info = $('info');
  const role = document.createElement('em');
  role.textContent = inst.role[prefs.lang];
  const tuning = document.createElement('span');
  tuning.className = 'tuning';
  tuning.textContent = strings;
  info.replaceChildren(role, ` · ${s.eSystem} `, tuning);
}

function applyLang(): void {
  const s = t(prefs.lang);
  document.documentElement.lang = prefs.lang;
  document.title = s.title;
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = el.dataset['i18n'] as keyof typeof s;
    const value = s[key];
    if (typeof value === 'string') el.textContent = value;
  }
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n-label]')) {
    const value = s[el.dataset['i18nLabel'] as keyof typeof s];
    if (typeof value === 'string') {
      el.setAttribute('aria-label', value);
      el.title = value;
    }
  }
  $('lang-btn').textContent = prefs.lang === 'hr' ? 'EN' : 'HR';
  canvas.setAttribute(
    'aria-label',
    prefs.lang === 'hr' ? 'Vrat i žice instrumenta. Sviraj mišem, dodirom ili tipkovnicom.' : 'Instrument neck and strings. Play with mouse, touch or keyboard.',
  );
  const list = (id: string, items: readonly string[]): void => {
    $(id).replaceChildren(
      ...items.map((text) => {
        const li = document.createElement('li');
        li.textContent = text;
        return li;
      }),
    );
  };
  $('minus-label').title = s.minusOneHint;
  renderBandButton();
  renderSongs();
  list('help-mouse', s.helpMouse);
  list('help-keys', s.helpKeys);
  renderInstruments();
  renderChords();
  renderInfo();
  renderer.setOptions(viewOptions());
}

function selectInstrument(id: InstrumentId): void {
  prefs.instrument = id;
  savePrefs(prefs);
  history.replaceState(null, '', `#${id}`);
  player.setInstrument(getInstrument(id));
  band.setMuted(mutedSet());
  renderer.relayout();
  renderInstruments();
  renderChords();
  renderInfo();
  animateSwap();
}

player.onChange(() => {
  // Keep the chord buttons in sync with keyboard chord changes.
  for (const b of chordsRow.querySelectorAll<HTMLButtonElement>('button')) {
    b.setAttribute('aria-pressed', String((b.dataset['chord'] || null) === player.chordId));
  }
});

const bindToggle = (id: string, key: 'tremolo' | 'showNotes' | 'showKeys' | 'neckOnly' | 'minusOne'): void => {
  const input = $<HTMLInputElement>(id);
  input.checked = prefs[key];
  input.addEventListener('change', () => {
    prefs[key] = input.checked;
    savePrefs(prefs);
    if (key === 'tremolo') player.setTremolo(input.checked);
    if (key === 'minusOne') band.setMuted(mutedSet());
    if (key === 'neckOnly') animateSwap();
    renderer.setOptions(viewOptions());
  });
};
bindToggle('tremolo', 'tremolo');
bindToggle('notes', 'showNotes');
bindToggle('keys', 'showKeys');
bindToggle('neck', 'neckOnly');
bindToggle('minus', 'minusOne');

const volume = $<HTMLInputElement>('volume');
volume.value = String(prefs.volume);
// The filled part of the slider track.
const paintVolume = (): void => volume.style.setProperty('--val', `${Number(volume.value) * 100}%`);
paintVolume();
volume.addEventListener('input', () => {
  paintVolume();
  prefs.volume = Number(volume.value);
  engine.setVolume(prefs.volume);
  savePrefs(prefs);
});

$('lang-btn').addEventListener('click', () => {
  prefs.lang = prefs.lang === 'hr' ? 'en' : 'hr';
  savePrefs(prefs);
  applyLang();
});

const help = $<HTMLDialogElement>('help');
$('help-btn').addEventListener('click', () => help.showModal());

applyLang();

// Debug handle for the browser console during development only.
if (import.meta.env.DEV) Object.assign(window, { __tambura: { engine, player } });
