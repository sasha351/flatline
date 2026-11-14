// Chop a raw sample into bit fields; map fields to pitch and velocity.
// Rhythm (including which drum hits) comes from patterns.js, timbre from heart.js.

// Candidates tried. Pentatonic wins: the lead and bass pick notes from noise,
// and with no semitones in the scale no pick can clash with the pad.
// Seven-note modes (dorian, phrygian) give the pad real 7th chords, but the
// lead then lands a semitone off a chord tone about one note in four.
export const SCALES = {
  minorPentatonic: [0, 3, 5, 7, 10],
  majorPentatonic: [0, 2, 4, 7, 9],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
};
export const SCALE = SCALES.minorPentatonic;
export const ROOT = 45;                 // A2. Kick (A1) and bass are tuned to it.
export const WIDTHS = [3, 3, 4, 4];     // a, b, c, d
// ponytail: lowest bits are pure sensor noise; raise to make voices calmer, lower for glitchier
export const SKIP_BITS = 2;
export function fields(value, widths) {
  return widths.map((w) => {
    const f = value & ((1 << w) - 1);
    value >>>= w;
    return f;
  });
}

export function note(index, octave, scale = SCALE, root = ROOT) {
  const n = scale.length;
  return root + 12 * (octave + Math.floor(index / n)) + scale[index % n];
}

const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));

// Phrase choices use the stable, higher bits of a sample plus settled heart
// features. Unsettled channels intentionally contribute a neutral seed.
export function phraseSeed(raw, heart) {
  if (!heart?.on || !heart.settled) return 0;
  const [a, b, c, d] = fields((raw >>> 0) >>> SKIP_BITS, WIDTHS);
  const press = Math.round(clamp(Number(heart.press), 0, 1) * 31);
  const breath = Math.round((clamp(Number(heart.breath), -1, 1) + 1) * 15.5);
  let x = ((a << 27) ^ (b << 20) ^ (c << 13) ^ (d << 6) ^ (press << 1) ^ breath) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}
