export type Lang = 'hr' | 'en';

const strings = {
  hr: {
    title: 'Tambura simulator',
    tagline: 'simulator · srijemski E-štim',
    instrument: 'Instrument',
    chords: 'Akordi',
    noChord: 'Bez akorda',
    tremolo: 'Tremolo',
    keyLabels: 'Tipke',
    noteNames: 'Tonovi',
    volume: 'Glasnoća',
    settings: 'Postavke',
    neckOnly: 'Samo vrat',
    help: 'Upute',
    close: 'Zatvori',
    tapToStart: 'Dodirni žice ili pritisni tipku za zvuk',
    tuning: 'Ugađanje',
    eSystem: 'srijemski E-štim',
    playSong: '▶ Kolo',
    stopSong: 'Stop',
    minusOne: 'Bez mene',
    minusOneHint: 'Utišaj svoj instrument i sviraj njegovu dionicu uz sastav; točke na vratu pokazuju što svirati.',
    helpIntro:
      'Odaberi instrument, pa sviraj. Dvostruke žice su nacrtane kao par. Ugađanje je srijemski E-štim, kako sviraju slavonski tamburaški sastavi.',
    helpMouseTitle: 'Miš i dodir',
    helpMouse: [
      'Klik ili dodir na prag svira taj ton; povuci po vratu za glissando.',
      'Povuci preko žica iznad otvora (desno ili dolje) za trzanje. Brže povlačenje = jače.',
      'Gumb akorda postavi hvat i odmah ga odsvira; trzanjem ga sviraš dalje.',
      'Na mobitelu: jednim prstom drži prag, drugim trzaj.',
      '▶ Kolo: cijeli sastav (prim, bas-prim, kontra, berde) svira kratko kolo. Uz „Bez mene“ tvoj instrument šuti, a točke na vratu pokazuju njegovu dionicu.',
    ],
    helpKeysTitle: 'Tipkovnica',
    helpKeys: [
      'Četiri reda tipki su četiri žice (gornji red = najdublja žica), stupac je prag: 1 / Q / A / Z su prazne žice.',
      'Razmak: trzaj prema dolje · Shift + razmak: prema gore.',
      'Shift + 1…9: odaberi i odsviraj akord · ← → mijenjaju akord · Esc: bez akorda.',
      'Tremolo: dok držiš tipku ili prag, ton se ponavlja.',
    ],
  },
  en: {
    title: 'Tambura simulator',
    tagline: 'simulator · Srijem E tuning',
    instrument: 'Instrument',
    chords: 'Chords',
    noChord: 'No chord',
    tremolo: 'Tremolo',
    keyLabels: 'Keys',
    noteNames: 'Notes',
    volume: 'Volume',
    settings: 'Settings',
    neckOnly: 'Neck only',
    help: 'Help',
    close: 'Close',
    tapToStart: 'Touch the strings or press a key for sound',
    tuning: 'Tuning',
    eSystem: 'Srijem E tuning',
    playSong: '▶ Kolo',
    stopSong: 'Stop',
    minusOne: 'Without me',
    minusOneHint: 'Mute your instrument and play its part along with the band; the dots on the neck show what to play.',
    helpIntro:
      'Pick an instrument and play. Doubled strings are drawn as a pair. Tuning is the Srijem E tuning (srijemski E-štim) used by Slavonian tamburica bands.',
    helpMouseTitle: 'Mouse and touch',
    helpMouse: [
      'Click or tap a fret to play that note; drag along the neck for a glissando.',
      'Drag across the strings over the sound hole (right or bottom) to strum. Faster = louder.',
      'A chord button sets the shape and plays it once; keep strumming to play it again.',
      'On a phone: hold a fret with one finger and strum with another.',
      '▶ Kolo: the whole band (prim, bas-prim, kontra, berde) plays a short kolo. With “Without me” your instrument is silent and the dots on the neck show its part.',
    ],
    helpKeysTitle: 'Keyboard',
    helpKeys: [
      'Four key rows are the four strings (top row = lowest string), the column is the fret: 1 / Q / A / Z are open strings.',
      'Space: strum down · Shift + Space: strum up.',
      'Shift + 1…9: pick and play a chord · ← → change chord · Esc: no chord.',
      'Tremolo: while you hold a key or a fret, the note repeats.',
    ],
  },
} as const;

export type Strings = (typeof strings)[Lang];

export function t(lang: Lang): Strings {
  return strings[lang];
}
