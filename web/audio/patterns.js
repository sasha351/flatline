// Rhythm patterns per tempo band: 16 steps per bar (16ths), x = hit. Pure data.

import { SCALE, ROOT } from './mapping.js';

const drum = (s) => [...s].map((c) => (c === 'x' ? 1 : c === 'g' ? 0.5 : 0));
const note = (degree, octave = 0, gate = 1, velocity = 0.7) => ({ degree, octave, gate, velocity });
const chord = (degrees, octave = 0, gate = 2, velocity = 0.6) => ({ degrees, octave, gate, velocity });
const notes = (cells) => cells.map((cell) => cell ?? null);
const empty = () => Array(16).fill(null);
const stab = (gate = 1, velocity = 0.6) => ({ gate, velocity }); // chord-less pad cell: plays the current chord
// line('x..x', [cellA, cellB]): a cell at each 'x', cycling through the list
const line = (str, cells) => { let k = 0; return [...str].map((c) => (c === 'x' ? cells[k++ % cells.length] : null)); };
const lead = (str, octave, ...degs) => line(str, degs.map((d) => note(d, octave)));
const DORIAN = [0, 2, 3, 5, 7, 9, 10], MINOR = [0, 2, 3, 5, 7, 8, 10], HARMONIC_MINOR = [0, 2, 3, 5, 7, 8, 11];

export const GENRES = {
  'French house': {
    key: { root: 43, scale: DORIAN, chords: [[0, 2, 4, 6], [3, 5, 7, 9], [0, 2, 4, 6], [6, 8, 10, 12]] },
    tempo: { min: 120, max: 126, default: 123 },
    phraseBars: 4,
    swing: 0,
    patterns: {
      drums: [
        { kick: drum('x...x...x...x...'), clap: drum('....x.......x...'), hat: drum('x.x.x.x.x.x.x.x.'), openhat: drum('..x...x...x...x.') },
        { kick: drum('x...x...x...x..x'), clap: drum('....x.......x...'), hat: drum('xgxgxgxgxgxgxgxg'), openhat: drum('..x...x...x...x.') },
        { kick: drum('x...x...x...x...'), clap: drum('....x.......x...'), hat: drum('................'), openhat: drum('..x...x...x...x.') },
      ],
      bass: [
        line('x.x.x.x.x.x.x.x.', [note(0, -1), note(0, 0)]),
        notes([note(0, -1), null, note(0, 0), null, note(0, -1), null, note(4, -1), null, note(0, -1), null, note(0, 0), null, note(0, -1), null, note(4, -1), null]),
        line('x..x..x...x.x...', [note(0, -1), note(0, 0), note(4, -1), note(0, -1), note(0, 0)]),
      ],
      lead: [
        lead('x..x..x.x...x.x.', 2, 0, 2, 4, 3, 2, 4),
        line('x..x..x.x...x.x.', [note(0, 2), note(2, 2), note(4, 2, 2), note(3, 2), note(2, 2, 2), note(4, 2)]),
        lead('x.x...x..x..x...', 2, 0, 2, 4, 3, 2),
      ],
      pad: [
        line('x..x..x...x.x...', [stab(2), stab(1), stab(1), stab(2), stab(1)]),
        line('..x..x..x.x...x.', [stab(1), stab(2), stab(1), stab(2), stab(1)]),
        line('x.....x..x..x...', [stab(2), stab(1), stab(2), stab(1)]),
      ],
    },
  },
  'UK garage': {
    key: { root: 41, scale: MINOR, chords: [[0, 2, 4, 6, 8], [5, 7, 9, 11], [3, 5, 7, 9, 11], [4, 6, 8, 10]] },
    tempo: { min: 130, max: 136, default: 133 },
    phraseBars: 4,
    swing: 0.30,
    patterns: {
      drums: [
        { kick: drum('x.........x.....'), snare: drum('....x.......x...'), clap: drum('....x.......x...'), hat: drum('gxgxgxgxgxgxgxgx'), openhat: drum('................'), rim: drum('......x......x..') },
        { kick: drum('x......x..x.....'), snare: drum('....x.......x...'), clap: drum('....x.......x...'), hat: drum('gxgxgxgxgxgxgxgx'), openhat: drum('................'), rim: drum('...x......x.....') },
        { kick: drum('x.........x...x.'), snare: drum('....x.......x...'), clap: drum('....x.......x...'), hat: drum('gxgxgxgxgxgxgxgx'), openhat: drum('..............x.'), rim: drum('......x......x..') },
      ],
      bass: [
        line('x..x..x...x.x...', [note(0, -1), note(0, 0), note(4, -1), note(2, -1), note(0, 0)]),
        line('x...x..x..x..x..', [note(0, -1), note(4, -1), note(0, 0), note(2, -1), note(0, -1)]),
        line('x..x....x.x..x..', [note(0, -1), note(0, 0), note(0, -1), note(4, -1), note(2, 0)]),
      ],
      lead: [
        lead('x.xx..x...x.x...', 2, 0, 2, 4, 3, 2, 4),
        lead('..x.xx....x..x..', 2, 2, 4, 3, 0, 2),
        lead('x.x.x....xx...x.', 2, 0, 2, 4, 3, 2, 0),
      ],
      pad: [
        line('...x..x...x..x..', [stab(1)]),
        line('..x...x..x...x..', [stab(1, 0.5)]),
        line('...x.....x..x...', [stab(1, 0.55)]),
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
    tempo: { min: 150, max: 160, default: 155 },
    phraseBars: 4,
    swing: 0,
    patterns: {
      drums: [
        { kick: drum('x...x...x...x...'), clap: drum('....x.......x...'), openhat: drum('................') },
        { kick: drum('x...x...x...x...'), clap: drum('....x.......x...'), openhat: drum('..x...x...x...x.') },
        { kick: drum('x...x...x...x.xx'), clap: drum('....x.......x...'), openhat: drum('................') },
      ],
      bass: [
        line('..x...x...x...x.', [note(0, -1)]),
        line('..xx..xx..xx..xx', [note(0, -1)]),
        line('..x...x...x...x.', [note(0, -1), note(0, -1), note(0, -1), note(0, 0)]),
      ],
      lead: [
        lead('x.x.x.x.x.x.x.x.', 1, 0, 2, 4, 3),
        lead('x.xxx.xxx.xxx.xx', 1, 0, 2, 3, 4),
        notes([note(0, 1, 8), ...empty().slice(1, 8), note(0, 1, 8), ...empty().slice(9)]),
      ],
      pad: [
        notes([stab(2, 0.5), ...empty().slice(1)]),
        notes([stab(2, 0.55), ...empty().slice(1)]),
        notes([stab(2, 0.6), ...empty().slice(1)]),
      ],
    },
  },
};
