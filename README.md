# Tambura simulator

Play the instruments of a tamburica band in the browser: **bisernica, brač, bugarija and berde**,
tuned in the E system (Farkaš). Pluck single notes, press frets, strum chords with the mouse,
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
or a sub-path of the portfolio). Link to an instrument with a hash: `/#bugarija`.

## How to play

**Mouse and touch**

- Click or tap a fret to play that note. Drag along the neck for a glissando.
- Drag across the strings over the sound hole (right side, or the bottom on a phone) to strum.
  The faster you drag, the louder it sounds.
- A chord button sets the chord shape and plays it once. Strum to keep playing it.
- On a phone, hold a fret with one finger and strum with another.

**Band (▶ Kolo)**

- The whole band plays a short kolo in D major. It is an original tune in a Slavonian style:
  bisernica melody with tremolo, brač a third below, bugarija off-beat "ćuć" chords and berde bass.
- The neck shows the selected instrument's part as it plays.
- **Without me / Bez mene** mutes your instrument so you can play its part along with the band.
  The dots show what to play, and strumming plays the shown shape.
- Songs are data in [`src/music/songs.ts`](src/music/songs.ts). Write the bisernica melody and the chords,
  and [`src/music/arrange.ts`](src/music/arrange.ts) derives the other parts.

**Keyboard** (key positions, so it works on any layout)

- The four key rows are the four strings, and the column is the fret. The number row is the lowest string.
  `1`, `Q`, `A` and `Z` are the open strings.
- Turn on **Keys / Tipke** to see the key labels on the neck.
- `Space` strums down and `Shift`+`Space` strums up. `↓` and `↑` strum too.
- `Shift`+`1`…`9` picks and plays a chord. `←` and `→` switch chords. `Esc` clears the chord.
- With **Tremolo** on, a held key, fret or `Space` keeps repeating.

## Tunings (E system)

All tunings live in [`src/music/instruments.ts`](src/music/instruments.ts). Sources and players
differ, so treat these as a starting point and correct them there:

| Instrument | Courses, low → high              | Role            |
| ---------- | -------------------------------- | --------------- |
| Bisernica  | cis¹ – fis¹ – h¹ – e² (e² double) | lead melody     |
| Brač       | cis – fis – h – e¹ (e¹ double)    | melody, 2nd voice |
| Bugarija   | d – a – d¹ – fis¹ (fis¹ double)   | rhythm, chords  |
| Berde      | E₁ – A₁ – D – G                   | bass            |

Chord shapes are not hard-coded. [`src/music/chords.ts`](src/music/chords.ts) searches each
instrument's tuning for the best playable shape: every string sounds a chord tone, the shape includes
the root, the third and (for 7th chords) the seventh, spans at most four frets and sits low on the neck.
Berde plays the root note only. After you change a tuning, the shapes follow automatically.

## How the sound works

[`src/audio/karplus.ts`](src/audio/karplus.ts) is an extended Karplus-Strong plucked string:

- **Excitation:** a noise burst, low-passed by plectrum hardness and comb-filtered by the plucking point.
- **Loop:** a delay loop with a one-zero low-pass (steel-string damping) and an allpass filter for the
  fractional period. The tests check that every note on every instrument is within 3 cents.
- **Plectrum:** a short click on top of the string.

[`src/audio/engine.ts`](src/audio/engine.ts) adds the rest:

- **Doubled courses:** the two strings are slightly detuned and a few ms apart, which gives the
  tamburica shimmer.
- **Dynamics:** a velocity-dependent low-pass, so soft strums are darker.
- **Body:** per-instrument resonances (bisernica air/wood modes at ~340/740 Hz).
- **Room and level:** a short room reverb and a limiter.

Notes render in ~0.5 ms and are cached, and the AudioContext uses `latencyHint: 'interactive'`.
Re-plucking a string chokes its previous note, like a real string.

Tone parameters per instrument (decay, brightness, pick position, body) are in `instruments.ts` → `tone`.

## Layout

The canvas draws the neck horizontally on wide screens and vertically on portrait phones.
Short screens show fewer frets, but never fewer than five, since every chord shape fits in the first five.
It works from 320 px wide, in portrait and in landscape.

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

- Recorded samples per instrument, mixed with or replacing the synthesis.
- A-system tunings, plus čelo and kontra.
- More frets and position shifting, and a capo.
- More songs, a tempo control and a loop for practising along with the band.
- Embedding in the portfolio (replacing the old "Tambura animation" experiment).
