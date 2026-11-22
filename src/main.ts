import './style.css';
import { BandPlayer } from './audio/band';
import { AudioEngine } from './audio/engine';
import { type Lang, t } from './i18n';
import { Controller } from './input/controller';
import { CHORDS } from './music/chords';
import { INSTRUMENTS, type InstrumentId, getInstrument, resolveInstrumentId } from './music/instruments';
import { noteName } from './music/notes';
import { KOLO_E } from './music/songs';
import { Player } from './player';
import { Renderer } from './view/renderer';

interface Prefs {
  lang: Lang;
  instrument: InstrumentId;
  tremolo: boolean;
  showNotes: boolean;
  showKeys: boolean;
  minusOne: boolean;
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
    minusOne: false,
    volume: 0.8,
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
const renderer = new Renderer(canvas, player, {
  lang: prefs.lang,
  showKeys: prefs.showKeys,
  showNotes: prefs.showNotes,
});

let warmed = false;
new Controller(canvas, renderer, player, engine, () => {
  if (warmed) return;
  warmed = true;
  $('hint').hidden = true;
  player.prewarm();
});

const bandBtn = $<HTMLButtonElement>('band-btn');
const band = new BandPlayer(
  engine,
  (e, audible) => {
    if (e.inst === player.inst.id) player.showBandNote(e.course, e.fret, e.velocity, audible);
  },
  () => {
    player.clearBand();
    renderBandButton();
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
    band.play(KOLO_E);
  }
  renderBandButton();
});

const instrumentsNav = $('instruments');
const chordsRow = $('chords');

function renderInstruments(): void {
  instrumentsNav.replaceChildren(
    ...INSTRUMENTS.map((inst) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = inst.name[prefs.lang];
      b.setAttribute('aria-pressed', String(inst.id === player.inst.id));
      b.addEventListener('click', () => selectInstrument(inst.id));
      return b;
    }),
  );
}

function renderChords(): void {
  const s = t(prefs.lang);
  const none = document.createElement('button');
  none.type = 'button';
  none.className = 'none';
  none.dataset['chord'] = '';
  none.textContent = s.noChord;
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
  const tuning = inst.courses.map((c) => noteName(c.midi, prefs.lang) + (c.doubled ? '×2' : '')).join(' · ');
  const info = $('info');
  info.replaceChildren();
  const name = document.createElement('strong');
  name.textContent = inst.name[prefs.lang];
  const role = document.createElement('span');
  role.className = 'role';
  role.textContent = ` (${inst.alias[prefs.lang]}) · ${inst.role[prefs.lang]}`;
  info.append(name, role, ` · ${s.eSystem}: ${tuning}`);
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
  list('help-mouse', s.helpMouse);
  list('help-keys', s.helpKeys);
  renderInstruments();
  renderChords();
  renderInfo();
  renderer.setOptions({ lang: prefs.lang, showKeys: prefs.showKeys, showNotes: prefs.showNotes });
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
}

player.onChange(() => {
  // Keep the chord buttons in sync with keyboard chord changes.
  for (const b of chordsRow.querySelectorAll<HTMLButtonElement>('button')) {
    b.setAttribute('aria-pressed', String((b.dataset['chord'] || null) === player.chordId));
  }
});

const bindToggle = (id: string, key: 'tremolo' | 'showNotes' | 'showKeys' | 'minusOne'): void => {
  const input = $<HTMLInputElement>(id);
  input.checked = prefs[key];
  input.addEventListener('change', () => {
    prefs[key] = input.checked;
    savePrefs(prefs);
    if (key === 'tremolo') player.setTremolo(input.checked);
    if (key === 'minusOne') band.setMuted(mutedSet());
    renderer.setOptions({ lang: prefs.lang, showKeys: prefs.showKeys, showNotes: prefs.showNotes });
  });
};
bindToggle('tremolo', 'tremolo');
bindToggle('notes', 'showNotes');
bindToggle('keys', 'showKeys');
bindToggle('minus', 'minusOne');

const volume = $<HTMLInputElement>('volume');
volume.value = String(prefs.volume);
volume.addEventListener('input', () => {
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
