/**
 * The keyboard as a fretboard: each key row is one course, the column is the fret.
 * Row 0 (number row) is the lowest course, matching the horizontal view where the
 * lowest string is drawn on top. Uses KeyboardEvent.code, so it is layout-independent
 * (on a Croatian layout the Z row starts with "Y").
 */
const ROWS: readonly (readonly string[])[] = [
  ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal'],
  ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft', 'BracketRight'],
  ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote', 'Backslash'],
  ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash'],
];

export interface FretKey {
  course: number;
  fret: number;
}

export function fretForKey(code: string, courseCount: number, maxFret: number): FretKey | null {
  for (let row = 0; row < ROWS.length && row < courseCount; row++) {
    const fret = ROWS[row]?.indexOf(code) ?? -1;
    if (fret >= 0 && fret <= maxFret) return { course: row, fret };
  }
  return null;
}

export function keyForFret(course: number, fret: number): string | null {
  const code = ROWS[course]?.[fret];
  return code ? keyLabel(code) : null;
}

const SPECIAL: Record<string, string> = {
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Semicolon: ';',
  Quote: "'",
  Backslash: '\\',
  Comma: ',',
  Period: '.',
  Slash: '/',
};

export function keyLabel(code: string): string {
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Key')) return code.slice(3);
  return SPECIAL[code] ?? code;
}

/** Shift + Digit1..9 picks chord 1..9 of the palette. */
export function chordIndexForKey(code: string): number | null {
  const m = /^Digit([1-9])$/.exec(code);
  return m ? Number(m[1]) - 1 : null;
}
