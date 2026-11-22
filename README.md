# Tambura simulator

Play the instruments of a Slavonian tamburica band in the browser: **prim, bas-prim, kontra and berde**,
in the Srijem E tuning (srijemski E-štim). Pluck single notes, press frets, strum chords with the mouse,
a finger or the keyboard. The sound is synthesised in real time, with no samples to download.

Vite + TypeScript, no framework, no runtime dependencies (~12 kB gzipped).

## Run it

Needs Node 24 (`.nvmrc`) and pnpm.

```bash
pnpm install
pnpm dev          # http://localhost:5180
```

With fnm and another Node active: `fnm exec --using=24 -- pnpm dev`.

To try it on a phone on the same Wi-Fi network, run `pnpm dev --host` and open the "Network" URL it prints.

| Task                     | Command                     |
| ------------------------ | --------------------------- |
| Production build         | `pnpm build` (→ `dist/`)    |
| Serve the build          | `pnpm preview`              |
| Unit tests               | `pnpm test`                 |
| Type check               | `pnpm typecheck`            |

`dist/` is a static site with relative paths: host it anywhere (a Vercel static project, GitHub Pages,
or a sub-path of the portfolio). Link to an instrument with a hash: `/#kontra` (the old names `#bisernica`, `#brac` and `#bugarija` still work).

## How to play

**Mouse and touch**

- Click or tap a fret to play that note. Drag along the neck for a glissando.
- Drag across the strings over the sound hole (right side, or the bottom on a phone) to strum.
  The faster you drag, the louder it sounds.
- A chord button sets the chord shape and plays it once. Strum to keep playing it.
- On a phone, hold a fret with one finger and strum with another.

**Band (▶ Play / Sviraj)**

Pick a song from the list beside the play button (on phones in portrait it sits right next to ▶; on
short rails, under ⚙) and press play. Ćiro kolo is selected by default.

- **Kolo u E-duru:** the whole band plays a short kolo in E major. It is an original tune in a Slavonian style:
  prim melody with tremolo, a second prim (druga prima) a third below for the two-voice sound,
  bas-prim doubling the melody an octave lower, kontra off-beat "ćuć" chords and berde bass.
- **Ružmarin:** a traditional Croatian folk song in A major (2/4), played whole by the band with its
  melody: two eight-bar strains, twice, resolving to A at the end. From the upper voice of John
  Chambers' two-voice ABC transcription (trillian.mit.edu, "O: Croatia").
- **Kolo kalendara** and **Ćiro kolo:** traditional Croatian kolos, played whole with their melodies,
  in A major (Ćiro kolo moved up from G), with the repeats and first/second endings of John Chambers'
  ABC transcriptions written out.
- **Krici krici tiček (drmeš):** a traditional Croatian drmeš, played whole with its melody, from the
  A/D version of John Chambers' transcription: first strain in A, second in D, endings written out.
- **Ajde lepa Maro (kolo):** a traditional Croatian kolo in D major, both eight-bar strains, twice.
  The melody is the upper voice of John Chambers' two-voice ABC transcription (abcnotation.com,
  "O: Croatia"); the arranged second prim lands on the transcription's lower voice.
- **Tiha noć:** Franz Xaver Gruber's "Stille Nacht" (1818, public domain) in 6/8, moved from C to A
  major so the prim, second prim and bas-prim all reach it; two verses.
- **Pjesma ravnici:** an original slow tune in D major (4/4, 76 bpm), written over the chord
  progression of the refrain of "Ne dirajte mi ravnicu" (G, A7, D, Fis, Hm, B…). The progression is
  free to use; the melody is new. The whole band plays it: prim melody with tremolo on long notes,
  a second prim a third below (a chord tone where the chord has one, so Fis and B-flat stay in tune),
  bas-prim an octave lower, kontra on 2 and 4, berde root and fifth.
- The neck shows the selected instrument's part as it plays.
- **Without me / Bez mene** mutes your instrument so you can play its part along with the band.
  The dots show what to play, and strumming plays the shown shape.
- Songs are data in [`src/music/songs.ts`](src/music/songs.ts). Write the prim melody and the chords,
  and [`src/music/arrange.ts`](src/music/arrange.ts) derives the other parts.

**Keyboard** (key positions, so it works on any layout)

- The four key rows are the four strings, and the column is the fret. The number row is the lowest string.
  `1`, `Q`, `A` and `Z` are the open strings.
- Turn on **Keys / Tipke** to see the key labels on the neck.
- `Space` strums down and `Shift`+`Space` strums up. `↓` and `↑` strum too.
- `Shift`+`1`…`9` picks and plays a chord. `←` and `→` switch chords. `Esc` clears the chord.
- With **Tremolo** on, a held key, fret or `Space` keeps repeating.

## Tunings (srijemski E-štim)

Slavonian tamburica bands play the Srijem E tuning, not the orchestral Farkaš system.
All tunings live in [`src/music/instruments.ts`](src/music/instruments.ts):

| Instrument             | Strings, high → low       | Role               |
| ---------------------- | ------------------------- | ------------------ |
| Prim (bisernica)       | e² e² h¹ fis¹ cis¹ (5)    | lead melody        |
| Bas-prim (brač)        | a¹ a¹ e¹ h fis (5)        | melody, 2nd voice  |
| Kontra (bugarija)      | e¹ e¹ h gis e (5), E major | rhythm, chords     |
| Berde                  | G D A₁ E₁ (4)             | bass               |

The chord palette is built for the keys these bands play in with this tuning: E, A, H, H7, E7, Fism, Cism and more.

Chord shapes are not hard-coded. [`src/music/chords.ts`](src/music/chords.ts) searches each
instrument's tuning for the best playable shape: every string sounds a chord tone, the shape includes
the root, the third and (for 7th chords) the seventh, spans at most four frets and sits low on the neck.
Berde plays the root note only. After you change a tuning, the shapes follow automatically.

## How the sound works

There are no recordings. The model follows the physics of a plucked steel string, with values from the
literature. [`src/audio/karplus.ts`](src/audio/karplus.ts) is an extended Karplus-Strong string:

- **Excitation:** the force a plectrum stroke puts on the bridge. A pluck at the picking point (prim
  0.13 of the string from the bridge) sends a rectangular wave round the loop, with harmonics falling
  as sin(kπp)/k. The plectrum also strikes the string as it passes, which keeps the harmonics up above
  a per-instrument frequency (`strikeHz`: 250 Hz for the prim's hard pick in tremolo, 2 kHz for the
  berde's soft one). The plectrum's width rounds the wave, and a little noise keeps strokes apart. A
  plain noise burst, as in basic Karplus-Strong, gave every note a random spectrum (±10 dB per harmonic
  from note to note) and a weak fundamental.
- **Losses:** a one-zero low-pass in the delay loop, which damps a steel string.
- **Strings:** every string has its real gauge, and the lower strings are wound, as in Dinamik string sets
  (for example, the prim has e² 0.23 and h¹ 0.30 plain, and fis¹ 0.50 and cis¹ 0.60 wound). Tension and
  inharmonicity B = π³·E·d⁴ / (64·T·L²) come from the gauge, the scale length (prim 39 cm, bas-prim 57.5,
  kontra 65, berde 108) and the fretted length. This puts the prim's e² string at ~86 N and B ≈ 2e-5.
  Allpass dispersion filters, fitted per note, place the partials where that B puts them. Wound strings
  are a little darker.
- **Tuning:** every filter's exact phase delay is subtracted from the period, so the fundamental of every
  note on every instrument is within 3 cents.
- **Two polarisations:** the string vibrates in two planes that decay at different rates. A bright
  "prompt" sound fades fast and leaves a softer aftersound, with a slow beat between the two.
- **Plectrum:** a short click on top of the string.

[`src/audio/engine.ts`](src/audio/engine.ts) adds the rest:

- **Doubled courses:** the two strings are slightly detuned and a few ms apart, which gives the
  tamburica shimmer.
- **Down- and up-strokes:** alternate strokes use different renders (picking point, plectrum face),
  plus a little random level and colour, so a tremolo never repeats the same samples.
- **Dynamics:** a velocity-dependent low-pass, so soft strums are darker.
- **Body:** a stereo convolution with each instrument's body response, built from its air, plate and
  formant modes (the right channel's modes sit 1.5 % apart, for width). Mandić measured four Srijem prims in an anechoic room (diploma thesis, PMF Novi Sad). On the prim
  the fundamental is never the loudest partial: a body formant around 1.0–1.3 kHz is, with resonances near
  365 and 745 Hz. The model reproduces his result for each open string: e² and h¹ strongest at H2, fis¹ at H3,
  cis¹ at H4 (a test checks this). The larger bodies are scaled from the prim by size.
- **Sympathetic strings:** open strings that share partials with the played note ring along softly
  (not on the kontra, whose strokes are damped).
- **Picks:** a hard horn pick for the prim, bas-prim and kontra (the kontra's is large and thick, so it
  has more attack), and a soft suede-covered pick for the berde.
- **Warmth and room:** a gentle low lift and high cut on the mix, and a warm wooden room with a short
  pre-delay for depth. The limiter is a light safety net only, so the band isn't squashed.

Notes render in a few ms and are cached, and the AudioContext uses `latencyHint: 'interactive'`.
Re-plucking a string chokes its previous note, like a real string.

Tone parameters per instrument (decay, brightness, pick position, body) are in `instruments.ts` → `tone`.

## Layout

The canvas draws the neck horizontally on wide screens and vertically on portrait phones.
Short screens show fewer frets, but never fewer than five, since every chord shape fits in the first five.
It works from 320 px wide, in portrait and in landscape, and nothing ever scrolls: the chords wrap into a
grid and the controls compact (or move into the ⚙ popover) until everything fits on one screen.

On wide screens and on phones in landscape, the chords and controls sit in a rail on the right, so the
instrument gets the full height. In portrait they sit below it, and the rarer settings (note names, key
labels, neck view, volume) open from the ⚙ button. **Neck view** (Samo vrat) fills the screen with the
neck, with wider strings and bigger frets, and lets the body run off the edge like a close-up photo;
you strum over its shoulders. The string spacing grows with the screen, up to 84 px. Animations
(the sliding tab underline, the instrument switch, button presses, the pulsing light while the band plays)
are switched off under `prefers-reduced-motion`.

The instruments are drawn after photos of Srijem instruments
([`src/view/instrument-art.ts`](src/view/instrument-art.ts)): the prim and bas-prim are pears that flow
into the neck, the prim with rows of small sound holes around a lobed tortoiseshell pickguard; the kontra
is guitar-shaped with a rosette; the berde has a double bass's outline, f-holes and an ebony tailpiece.
The fingerboard runs onto the body, the strings close up towards the tailpiece, and the head has its
tuning machines. The neck is wider than on a real instrument, so a fingertip can hit each string.

```
src/
  main.ts              UI wiring, preferences, i18n (hr/en)
  player.ts            musical state: instrument, chord, held frets, tremolo
  audio/karplus.ts     string synthesis (pure, unit-tested)
  audio/engine.ts      Web Audio graph and voice management (one body chain per instrument)
  audio/band.ts        lookahead scheduler that plays a song with the whole band
  music/               tunings, chord search, songs + band arrangement, keyboard map, note names
  view/geometry.ts     layout + hit-testing for both orientations
  view/renderer.ts     canvas drawing and string animation
  input/controller.ts  pointer and keyboard input
```

## Ideas for next versions

- Tuning the sound against recordings of real instruments (decay, body, string beating).
- Čelo, a second prim (kontrašica) and the Farkaš system as an option.
- More frets and position shifting, and a capo.
- More songs, a tempo control and a loop for practising along with the band.
- Embedding in the portfolio (replacing the old "Tambura animation" experiment).
