// Rhythm patterns per tempo band: 16 steps per bar (16ths), x = hit. Pure data.

import { SCALE, ROOT } from './mapping.js';

const drum = (s) => [...s].map((c) => (c === 'x' ? 1 : c === 'g' ? 0.5 : 0));
const note = (degree, octave = 0, gate = 1, velocity = 0.7) => ({ degree, octave, gate, velocity });
const chord = (degrees, octave = 0, gate = 2, velocity = 0.6) => ({ degrees, octave, gate, velocity });
const notes = (cells) => cells.map((cell) => cell ?? null);
const empty = () => Array(16).fill(null);
const stab = (gate = 1, velocity = 0.6) => ({ gate, velocity }); // chord-less pad cell: plays the current chord
const DORIAN = [0, 2, 3, 5, 7, 9, 10], MINOR = [0, 2, 3, 5, 7, 8, 10], HARMONIC_MINOR = [0, 2, 3, 5, 7, 8, 11];

const HOUSE_KICKS = drum('x...x...x...x...');
const GARAGE_KICKS = drum('x.....x..x......');
const HARDBASS_KICKS = drum('x...x...x...x...');

export const GENRES = {
  'French house': {
    key: { root: 43, scale: DORIAN, chords: [[0, 2, 4, 6], [3, 5, 7, 9], [0, 2, 4, 6], [6, 8, 10, 12]] },
    tempo: { min: 112, max: 128, default: 120 },
    phraseBars: 4,
    swing: 0,
    patterns: {
      drums: [
        { kick: HOUSE_KICKS, snare: drum('....x.......x...'), hat: drum('..x...x...x...x.'), openhat: drum('................') },
        { kick: drum('x...x...x...x..x'), snare: drum('....x.......x...'), hat: drum('..x.x.x...x.x.x.'), openhat: drum('..............x.') },
        { kick: drum('x...x...x...x...'), snare: drum('....x.......x..x'), hat: drum('xxxxxxxxxxxxxxxx'), openhat: drum('................') },
      ],
      bass: [
        notes([note(0, -1, 2), null, note(0, -1), note(2, -1), null, note(0, -1, 2), null, note(3, -1), note(0, -1, 2), null, note(0, -1), note(2, -1), null, note(4, -1), null, note(2, -1)]),
        notes([note(0, -1, 2), null, note(3, -1), null, note(0, -1, 2), null, note(2, -1), note(4, -1), note(0, -1, 2), null, note(3, -1), null, note(0, -1, 2), null, note(2, -1), note(4, -1)]),
        notes([note(0, -1, 2), note(2, -1), null, note(3, -1), note(0, -1, 2), null, note(4, -1), null, note(0, -1, 2), note(2, -1), null, note(3, -1), note(0, -1, 2), null, note(4, -1), null]),
      ],
      lead: [
        notes([note(4), null, note(2), null, note(3), null, note(1), null, note(4), null, note(2), null, note(3), null, note(1), null]),
        notes([note(2), null, note(4), null, note(3), null, note(1), null, note(2), null, note(4), null, note(3), null, note(0), null]),
        notes([note(4), null, null, note(2), null, note(3), null, note(1), note(4), null, null, note(2), null, note(3), null, note(0)]),
      ],
      pad: [
        notes([chord([0, 2, 4], 0, 4), ...empty().slice(1)]),
        notes([chord([1, 3, 5], 0, 4), ...empty().slice(1)]),
        notes([chord([0, 3, 4], 0, 4), ...empty().slice(1)]),
      ],
    },
  },
  'UK garage': {
    key: { root: 41, scale: MINOR, chords: [[0, 2, 4, 6, 8], [5, 7, 9, 11], [3, 5, 7, 9, 11], [4, 6, 8, 10]] },
    tempo: { min: 128, max: 138, default: 132 },
    phraseBars: 4,
    swing: 0.30,
    patterns: {
      drums: [
        { kick: GARAGE_KICKS, snare: drum('....x.......x...'), hat: drum('..x.x.x.x.x.x.x.'), openhat: drum('..............x.') },
        { kick: drum('x....x....x.....'), snare: drum('....x.......x...'), hat: drum('..x...x.x...x.x.'), openhat: drum('..............x.') },
        { kick: drum('x.....x..x....x.'), snare: drum('....x.......x..x'), hat: drum('.x.x.x.x.x.x.x.x'), openhat: drum('..............x.') },
      ],
      bass: [
        notes([note(0, -1, 2), null, null, note(3, -1), null, note(2, -1), null, note(4, -1), note(0, -1, 2), null, note(3, -1), null, null, note(2, -1), null, note(4, -1)]),
        notes([null, note(0, -1), null, note(2, -1), note(3, -1), null, note(4, -1), null, null, note(0, -1), null, note(2, -1), note(3, -1), null, note(4, -1), null]),
        notes([note(0, -1, 2), null, note(2, -1), null, null, note(3, -1), null, note(4, -1), note(0, -1, 2), null, note(2, -1), note(3, -1), null, note(4, -1), null, note(2, -1)]),
      ],
      lead: [
        notes([null, note(2), null, note(4), null, null, note(3), null, null, note(1), null, note(3), null, null, note(2), null]),
        notes([note(4), null, null, note(2), null, note(3), null, null, note(1), null, null, note(3), null, note(2), null, null]),
        notes([null, note(1), null, note(3), note(4), null, null, note(2), null, note(1), null, note(3), note(4), null, note(2), null]),
      ],
      pad: [
        notes([chord([0, 2, 4], 0, 2), null, null, null, chord([1, 3, 5], 0, 2), ...empty().slice(5)]),
        notes([null, chord([1, 3, 5], 0, 2), ...empty().slice(2, 8), chord([0, 2, 4], 0, 2), ...empty().slice(9)]),
        notes([chord([0, 3, 4], 0, 2), ...empty().slice(1, 6), chord([1, 3, 5], 0, 2), ...empty().slice(7)]),
      ],
    },
  },
  Ambient: {
    key: { root: ROOT, scale: SCALE, chords: null },
    tempo: { min: 60, max: 90, default: 72 },
    phraseBars: 8,
    swing: 0,
    patterns: {
      drums: [
        { kick: drum('x.......x.......'), snare: drum('................'), hat: drum('................') },
        { kick: drum('................'), snare: drum('....x...........'), hat: drum('................') },
        { kick: drum('x...............'), snare: drum('................'), hat: drum('........x.......') },
      ],
      bass: [
        notes([note(0, -1, 8), ...empty().slice(1)]),
        notes([null, ...empty().slice(1, 8), note(3, -1, 8), ...empty().slice(9)]),
        notes([note(0, -1, 6), ...empty().slice(1, 8), note(2, -1, 6), ...empty().slice(9)]),
      ],
      lead: [
        notes([note(4, 1, 8), ...empty().slice(1)]),
        notes([null, ...empty().slice(1, 8), note(2, 1, 8), ...empty().slice(9)]),
        notes([note(3, 1, 8), ...empty().slice(1, 12), note(1, 1, 4), ...empty().slice(13)]),
      ],
      pad: [
        notes([chord([0, 2, 4], 0, 16), ...empty().slice(1)]),
        notes([null, ...empty().slice(1, 8), chord([1, 3, 5], 0, 8), ...empty().slice(9)]),
        notes([chord([0, 3, 4], 0, 16), ...empty().slice(1)]),
      ],
    },
  },
  'Russian hardbass': {
    key: { root: 45, scale: HARMONIC_MINOR, chords: [[0, 2, 4], [5, 7, 9], [3, 5, 7], [4, 6, 8]] },
    tempo: { min: 145, max: 165, default: 150 },
    phraseBars: 4,
    swing: 0,
    patterns: {
      drums: [
        { kick: HARDBASS_KICKS, snare: drum('....x.......x...'), hat: drum('x.x.x.x.x.x.x.x.'), openhat: drum('..............x.') },
        { kick: drum('x...x...x...x..x'), snare: drum('....x.......x...'), hat: drum('xxxxxxxxxxxxxxxx'), openhat: drum('..............x.') },
        { kick: drum('x...x...x...x...'), snare: drum('....x.......x..x'), hat: drum('x.x.x.x.x.x.x.x.'), openhat: drum('......x.......x.') },
      ],
      bass: [
        notes([null, null, note(0, -1), null, null, null, note(2, -1), null, null, null, note(0, -1), null, null, null, note(3, -1), null]),
        notes([null, null, note(0, -1), null, note(2, -1), null, note(3, -1), null, null, null, note(0, -1), null, note(2, -1), null, note(4, -1), null]),
        notes([null, null, note(0, -1), null, null, note(2, -1), null, note(3, -1), null, null, note(0, -1), null, null, note(2, -1), null, note(4, -1)]),
      ],
      lead: [
        notes([note(0), null, note(2), null, note(0), null, note(3), null, note(0), null, note(2), null, note(0), null, note(4), null]),
        notes([note(0), null, note(3), null, note(0), null, note(2), null, note(0), null, note(4), null, note(0), null, note(2), null]),
        notes([note(0), null, note(2), null, note(3), null, note(0), null, note(0), null, note(2), null, note(4), null, note(0), null]),
      ],
      pad: [
        notes([chord([0, 2, 4], 0, 2), ...empty().slice(1)]),
        notes([chord([1, 3, 5], 0, 2), ...empty().slice(1)]),
        notes([chord([0, 3, 4], 0, 2), ...empty().slice(1)]),
      ],
    },
  },
};
