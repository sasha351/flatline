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
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10], MAJOR = [0, 2, 4, 5, 7, 9, 11];

export const GENRES = {
  'French house': {
    key: { root: 43, scale: DORIAN, chords: [[0, 2, 4, 6], [3, 5, 7, 9], [0, 2, 4, 6], [6, 8, 10, 12]] },
    tempo: { default: 123 },
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
    tempo: { default: 133 },
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
    tempo: { default: 72 },
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
    tempo: { default: 155 },
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
  // To add a genre: an entry here (key, idle tempo, three or more variants per voice) and a kit of
  // the same name in kits.js. The kit menu, the Pi button and the shared tests pick it up by name.
  // Bass degrees are counted from the bar's chord root, so every bar needs a degree-0 bass note;
  // a pad stab() plays the bar's chord; the lead grid is only a rhythm once a heart has its own motif.
  'Drum and bass': { // two-step break: kick on 1 and the "and" of 3, snare on 2 and 4 with ghost notes
    key: { root: 38, scale: MINOR, chords: [[0, 2, 4, 6], [5, 7, 9], [2, 4, 6, 8], [6, 8, 10]] },
    tempo: { default: 172 },
    phraseBars: 4,
    swing: 0,
    patterns: {
      drums: [
        { kick: drum('x.........x.....'), snare: drum('....x..g.g..x...'), hat: drum('x.x.x.x.x.x.x.x.'), openhat: drum('................') },
        { kick: drum('x.x.......xx....'), snare: drum('....x..g.g..x..g'), hat: drum('xgxgxgxgxgxgxgxg'), openhat: drum('................') },
        { kick: drum('x.........x..x..'), snare: drum('....x.......x.g.'), hat: drum('x.xxx.x.x.xxx.x.'), openhat: drum('..............x.') },
      ],
      bass: [ // long reese notes
        line('x.........x.....', [note(0, -1, 8), note(0, -1, 5)]),
        line('x.....x...x...x.', [note(0, -1, 5), note(2, -1, 3), note(0, -1, 3), note(4, -1, 2)]),
        line('x..x..x...x.....', [note(0, -1, 2), note(0, 0, 2), note(0, -1, 3), note(4, -1, 5)]),
      ],
      lead: [
        lead('x.....x...x..x..', 2, 4, 2, 0, 3),
        lead('..x...x..x....x.', 2, 0, 2, 4, 6),
        lead('x..x......x.x...', 2, 4, 3, 2, 0),
      ],
      pad: [ // held chords
        notes([stab(16, 0.5), ...empty().slice(1)]),
        notes([stab(12, 0.55), ...empty().slice(1)]),
        line('x.......x.......', [stab(8, 0.5), stab(8, 0.45)]),
      ],
    },
  },
  'Acid techno': { // four-on-the-floor, offbeat open hat, a busy 16th bass line with octave jumps and the flat 2nd
    key: { root: 45, scale: PHRYGIAN, chords: [[0, 2, 4], [0, 2, 4], [1, 3, 5], [0, 2, 4]] },
    tempo: { default: 132 },
    phraseBars: 4,
    swing: 0,
    patterns: {
      drums: [
        { kick: drum('x...x...x...x...'), clap: drum('....x.......x...'), hat: drum('x.xgx.xgx.xgx.xg'), openhat: drum('..x...x...x...x.'), rim: drum('...x......x..x..') },
        { kick: drum('x...x...x...x...'), clap: drum('................'), hat: drum('xgxgxgxgxgxgxgxg'), openhat: drum('..x...x...x...x.'), rim: drum('..x..x....x..x..') },
        { kick: drum('x...x...x...x.x.'), clap: drum('....x.......x..x'), hat: drum('x.xgx.xgx.xgx.xg'), openhat: drum('..x...x...x...x.'), rim: drum('...x..x....x....') },
      ],
      bass: [
        line('x.xxx.x.x.xxx.xx', [note(0, -1), note(0, -1), note(0, 0), note(0, -1), note(1, -1), note(0, -1), note(0, 0), note(3, -1), note(0, -1), note(0, -1), note(6, -1)]),
        line('xxx.xx.xx.x.xx.x', [note(0, -1), note(0, 0), note(0, -1), note(2, -1), note(0, -1), note(0, 0), note(1, -1), note(0, -1), note(4, -1), note(0, -1), note(0, 0)]),
        line('x..x..x.x..x..x.', [note(0, -1, 2), note(0, 0), note(0, -1, 2), note(1, -1), note(0, -1, 2), note(0, 0)]),
      ],
      lead: [ // sparse: the bass line is the star
        lead('..x.......x.....', 1, 0, 4),
        lead('......x..x......', 1, 4, 3),
        lead('x.........x..x..', 1, 0, 1, 0),
      ],
      pad: [
        line('..x.......x.....', [stab(1, 0.5)]),
        line('......x.......x.', [stab(1, 0.5)]),
        line('..x...x...x...x.', [stab(1, 0.45)]),
      ],
    },
  },
  'Lo-fi': { // half-time: one snare a bar, on beat 3, so the beat you feel is the heart rate itself
    key: { root: 36, scale: DORIAN, chords: [[0, 2, 4, 6], [3, 5, 7, 9], [1, 3, 5, 7], [4, 6, 8, 10]] },
    tempo: { default: 150 },
    phraseBars: 4,
    swing: 0,
    patterns: {
      drums: [
        { kick: drum('x.....x.........'), snare: drum('........x.......'), hat: drum('x...x...x...x.g.'), rim: drum('................') },
        { kick: drum('x.........x..x..'), snare: drum('........x.......'), hat: drum('x...x.g.x...x...'), rim: drum('..............x.') },
        { kick: drum('x.....x......x..'), snare: drum('........x.....g.'), hat: drum('x...x...x.g.x...'), rim: drum('................') },
      ],
      bass: [
        line('x.....x...x.....', [note(0, -1, 5), note(0, -1, 3), note(4, -1, 4)]),
        line('x.........x..x..', [note(0, -1, 8), note(2, -1, 2), note(4, -1, 3)]),
        line('x.....x......x..', [note(0, -1, 5), note(0, 0, 4), note(2, -1, 3)]),
      ],
      lead: [
        lead('x.....x.....x...', 2, 2, 4, 3),
        lead('..x...x...x.....', 2, 0, 2, 4),
        lead('....x.......x.x.', 2, 4, 3, 2),
      ],
      pad: [ // electric-piano chords
        notes([stab(10, 0.5), ...empty().slice(1)]),
        line('x.......x.......', [stab(6, 0.5), stab(4, 0.45)]),
        line('..x.......x.....', [stab(6, 0.5)]),
      ],
    },
  },
  // Old-school boom bap rap. Half-time like Lo-fi: the kick ("boom") opens the bar and the snare ("bap")
  // lands on beat 3, so the head-nod is the heart rate. Swung like a drum machine at about 62%.
  // The fourth voice (pad, sensor 4) is the DJ: its cells are record scratches, not chords.
  'Boom bap': {
    key: { root: 40, scale: MINOR, chords: [[0, 2, 4, 6], [0, 2, 4, 6], [3, 5, 7, 9], [4, 6, 8, 10]] },
    tempo: { default: 176 },
    phraseBars: 4,
    swing: 0.25,
    halfTime: true,
    patterns: {
      drums: [
        { kick: drum('x...........x...'), snare: drum('........x.......'), hat: drum('x.g.x.g.x.g.x.g.') },
        { kick: drum('x.....x.....x...'), snare: drum('........x.......'), hat: drum('x.g.x...x.g.x...') },
        { kick: drum('x.....x.......x.'), snare: drum('........x.....g.'), hat: drum('x...x.g.x...x.g.') },
      ],
      bass: [ // a low sub that follows the kick
        line('x...........x...', [note(0, -1, 6), note(4, -1, 3)]),
        line('x.....x.....x...', [note(0, -1, 4), note(0, -1, 3), note(2, -1, 3)]),
        line('x.....x.......x.', [note(0, -1, 4), note(0, 0, 4), note(4, -1, 2)]),
      ],
      lead: [ // a chopped piano loop
        lead('x...x.....x.....', 2, 4, 2, 0),
        lead('..x...x.....x...', 2, 0, 2, 4),
        lead('x.....x...x...x.', 2, 4, 3, 2, 0),
      ],
      pad: [ // scratches: gate = how long the record is pushed and pulled
        line('....x.x.....x...', [stab(1, 0.6), stab(2, 0.6), stab(2, 0.55)]),
        line('..........xxx.x.', [stab(1, 0.6), stab(1, 0.5), stab(1, 0.6), stab(2, 0.6)]),
        line('x.x.......x.x.xx', [stab(1, 0.55), stab(2, 0.6), stab(1, 0.55), stab(1, 0.6), stab(1, 0.5), stab(2, 0.6)]),
      ],
    },
  },
  'Psytrance': { // rolling bass: the three 16ths after every kick; acid squiggle lead
    key: { root: 40, scale: PHRYGIAN, chords: [[0, 2, 4], [0, 2, 4], [0, 2, 4], [1, 3, 5]] },
    tempo: { default: 145 },
    phraseBars: 4,
    swing: 0,
    patterns: {
      drums: [
        { kick: drum('x...x...x...x...'), clap: drum('................'), hat: drum('..x...x...x...x.'), openhat: drum('................') },
        { kick: drum('x...x...x...x...'), clap: drum('....x.......x...'), hat: drum('..x...x...x...x.'), openhat: drum('..............x.') },
        { kick: drum('x...x...x...x...'), clap: drum('............x...'), hat: drum('xgxgxgxgxgxgxgxg'), openhat: drum('..x...x...x...x.') },
      ],
      bass: [
        line('.xxx.xxx.xxx.xxx', [note(0, -1)]),
        line('.xxx.xxx.xxx.xxx', [note(0, -1), note(0, -1), note(1, -1), note(0, -1), note(0, -1), note(0, 0)]),
        line('.xxx.xxx.xxx.x.x', [note(0, -1), note(0, 0), note(0, -1)]),
      ],
      lead: [
        lead('x..x..x.x..x..x.', 1, 0, 1, 0, 4),
        lead('x.xx..x.x.xx..x.', 1, 4, 3, 1, 0),
        lead('..x..x..x..x..x.', 1, 0, 4, 6, 4, 1),
      ],
      pad: [
        line('x...............', [stab(8, 0.35)]),
        line('........x.......', [stab(8, 0.35)]),
        line('x.......x.......', [stab(4, 0.3)]),
      ],
    },
  },
  'Trap': { // half-time: snare on beat 3, sliding 808 bass, hi-hat rolls (`hatroll`: two hats in one 16th)
    key: { root: 41, scale: HARMONIC_MINOR, chords: [[0, 2, 4], [0, 2, 4], [5, 7, 9], [4, 6, 8]] },
    tempo: { default: 150 },
    phraseBars: 4,
    swing: 0,
    halfTime: true,
    patterns: {
      drums: [
        { kick: drum('x......x..x.....'), clap: drum('........x.......'), hat: drum('x.x.x.x.x.x.x...'), hatroll: drum('..............xx'), openhat: drum('................') },
        { kick: drum('x.....x...x..x..'), clap: drum('........x.......'), hat: drum('x.x.x...x.x.x.x.'), hatroll: drum('......xx........'), openhat: drum('................') },
        { kick: drum('x.........x.x...'), clap: drum('........x.......'), hat: drum('x.x.x.x.x...x.x.'), hatroll: drum('..........xx....'), openhat: drum('...............x') },
      ],
      bass: [ // overlapping 808 notes glide into each other
        line('x......x..x.....', [note(0, -1, 7), note(0, -1, 3), note(3, -1, 5)]),
        line('x.....x...x..x..', [note(0, -1, 6), note(0, 0, 4), note(0, -1, 3), note(4, -1, 3)]),
        line('x.........x.x...', [note(0, -1, 10), note(2, -1, 2), note(0, -1, 4)]),
      ],
      lead: [ // dark bell
        lead('x...x...x.x.....', 2, 4, 3, 2, 0),
        lead('..x...x.....x...', 2, 0, 2, 4),
        lead('x.....x.x...x...', 2, 4, 5, 4, 2),
      ],
      pad: [
        notes([stab(16, 0.4), ...empty().slice(1)]),
        line('x.......x.......', [stab(8, 0.4)]),
        notes([stab(12, 0.35), ...empty().slice(1)]),
      ],
    },
  },
  'Dubstep': { // half-time: kick on 1, snare on 3, and a wobble bass (its filter swings in time with the beat)
    key: { root: 41, scale: MINOR, chords: [[0, 2, 4], [5, 7, 9], [3, 5, 7], [4, 6, 8]] },
    tempo: { default: 140 },
    phraseBars: 4,
    swing: 0,
    halfTime: true,
    patterns: {
      drums: [
        { kick: drum('x.........x.....'), snare: drum('........x.......'), hat: drum('..x...x...x...x.') },
        { kick: drum('x.....x.........'), snare: drum('........x.......'), hat: drum('x.x.x.x.x.x.x.x.') },
        { kick: drum('x.........x..x..'), snare: drum('........x.....g.'), hat: drum('..x...x...x...x.') },
      ],
      bass: [
        line('x.......x.......', [note(0, -1, 8), note(0, -1, 6)]),
        line('x.....x.....x...', [note(0, -1, 6), note(0, 0, 4), note(3, -1, 4)]),
        line('x...........x...', [note(0, -1, 12), note(4, -1, 4)]),
      ],
      lead: [
        lead('x.......x.......', 2, 4, 2),
        lead('....x.......x...', 2, 0, 3),
        lead('x.....x.....x...', 2, 4, 3, 2),
      ],
      pad: [
        notes([stab(16, 0.35), ...empty().slice(1)]),
        line('x.......x.......', [stab(8, 0.35)]),
        notes([stab(12, 0.3), ...empty().slice(1)]),
      ],
    },
  },
  'Hardstyle': { // four-on-the-floor; a distorted reverse bass swells up in the gap after every kick
    key: { root: 41, scale: HARMONIC_MINOR, chords: [[0, 2, 4], [5, 7, 9], [3, 5, 7], [4, 6, 8]] },
    tempo: { default: 150 },
    phraseBars: 4,
    swing: 0,
    patterns: {
      drums: [
        { kick: drum('x...x...x...x...'), clap: drum('....x.......x...'), openhat: drum('................') },
        { kick: drum('x...x...x...x...'), clap: drum('....x.......x...'), openhat: drum('..x...x...x...x.') },
        { kick: drum('x...x...x...x.xx'), clap: drum('....x.......x...'), openhat: drum('..x...x...x.....') },
      ],
      bass: [
        line('.x...x...x...x..', [note(0, -1, 3)]),
        line('.x...x...x...x..', [note(0, -1, 3), note(0, -1, 3), note(4, -1, 3), note(0, -1, 3)]),
        line('.x...x...x...x..', [note(0, -1, 3), note(0, 0, 3)]),
      ],
      lead: [ // euphoric supersaw
        lead('x.x.x...x.x.x...', 2, 0, 2, 4, 2, 4, 7),
        lead('x...x.x.x...x.x.', 2, 4, 2, 4, 5, 4, 2),
        notes([note(4, 2, 4), ...empty().slice(1, 4), note(2, 2, 4), ...empty().slice(5, 8), note(0, 2, 8), ...empty().slice(9)]),
      ],
      pad: [
        notes([stab(16, 0.45), ...empty().slice(1)]),
        line('x.......x.......', [stab(8, 0.45)]),
        line('..x...x...x...x.', [stab(1, 0.45)]),
      ],
    },
  },
  'Reggaeton': { // half-time dembow: kick on every felt beat, snare on the "a" of 1 and the "and" of 2
    key: { root: 43, scale: MINOR, chords: [[0, 2, 4], [5, 7, 9], [2, 4, 6], [6, 8, 10]] },
    tempo: { default: 184 },
    phraseBars: 4,
    swing: 0,
    halfTime: true,
    patterns: {
      drums: [
        { kick: drum('x.......x.......'), snare: drum('......x.....x...'), hat: drum('x...x...x...x...') },
        { kick: drum('x.......x.......'), snare: drum('......x.....x...'), hat: drum('x.x.x.x.x.x.x.x.') },
        { kick: drum('x.......x...x...'), snare: drum('......x.....x.g.'), hat: drum('x...x...x...x...') },
      ],
      bass: [
        line('x.......x.......', [note(0, -1, 6)]),
        line('x.....x.x.......', [note(0, -1, 5), note(4, -1, 2), note(0, -1, 6)]),
        line('x.......x...x...', [note(0, -1, 6), note(0, 0, 3), note(4, -1, 3)]),
      ],
      lead: [
        lead('x...x.....x.x...', 2, 4, 2, 0, 2),
        lead('..x...x.x.......', 2, 2, 4, 3),
        lead('x.....x...x...x.', 2, 0, 2, 4, 2),
      ],
      pad: [ // offbeat chord stabs, on the snare
        line('......x.....x...', [stab(2, 0.45)]),
        line('....x.......x...', [stab(2, 0.45)]),
        line('......x.....x.x.', [stab(1, 0.4)]),
      ],
    },
  },
  'Footwork': { // fast, skittering kicks (16th-note stand-ins for the genre's triplets), vocal chops from the fourth finger
    key: { root: 41, scale: MINOR, chords: [[0, 2, 4], [0, 2, 4], [3, 5, 7], [4, 6, 8]] },
    tempo: { default: 160 },
    phraseBars: 4,
    swing: 0,
    patterns: {
      drums: [
        { kick: drum('x..x..x...x..x..'), clap: drum('....x.......x...'), hat: drum('..x...x...x...x.'), rim: drum('...x..x...x..x..') },
        { kick: drum('x..x..x.x..x..x.'), clap: drum('............x...'), hat: drum('x.x.x.x.x.x.x.x.'), rim: drum('................') },
        { kick: drum('x.....x..x..x...'), clap: drum('....x.......x..x'), hat: drum('..x...x...x...x.'), rim: drum('.x....x....x....') },
      ],
      bass: [
        line('x.........x.....', [note(0, -1, 6), note(3, -1, 4)]),
        line('x.....x.........', [note(0, -1, 4), note(0, -1, 8)]),
        line('x..x......x.....', [note(0, -1, 2), note(0, 0, 4), note(4, -1, 4)]),
      ],
      lead: [
        lead('x.....x.........', 2, 4, 2),
        lead('....x.......x...', 2, 0, 3),
        lead('x.......x...x...', 2, 4, 3, 2),
      ],
      pad: [ // vocal chops: runs of short cells stutter
        line('x.x.x.......x.x.', [stab(1, 0.6)]),
        line('xxx...x...xxx...', [stab(1, 0.55)]),
        line('x...x.x.x...xx.x', [stab(1, 0.6)]),
      ],
    },
  },
  'Jersey club': { // bouncy five-kick bar (16th-note stand-ins for its triplets), vocal chops from the fourth finger
    key: { root: 43, scale: MINOR, chords: [[0, 2, 4], [5, 7, 9], [3, 5, 7], [4, 6, 8]] },
    tempo: { default: 140 },
    phraseBars: 4,
    swing: 0,
    patterns: {
      drums: [
        { kick: drum('x..x..x.x.x.x...'), clap: drum('....x.......x...'), hat: drum('..x...x...x...x.') },
        { kick: drum('x...x..x..x.x.x.'), clap: drum('....x.......x...'), hat: drum('x.x.x.x.x.x.x.x.') },
        { kick: drum('x..x..x...x.x.x.'), clap: drum('............x...'), hat: drum('..x...x...x...x.') },
      ],
      bass: [
        line('x.....x.....x...', [note(0, -1, 3), note(0, -1, 3), note(4, -1, 3)]),
        line('x.........x.....', [note(0, -1, 6), note(2, -1, 4)]),
        line('x..x..x.....x...', [note(0, -1, 2), note(0, 0, 2), note(0, -1, 3), note(4, -1, 3)]),
      ],
      lead: [
        lead('..x...x...x...x.', 2, 0, 2, 4, 2),
        lead('x.....x.....x...', 2, 4, 3, 2),
        lead('..x.x...x.....x.', 2, 2, 4, 3, 0),
      ],
      pad: [
        line('x.x.....x.x.x...', [stab(1, 0.6)]),
        line('..xx..x...xx..x.', [stab(1, 0.55)]),
        line('x...xxx.....x.x.', [stab(1, 0.6)]),
      ],
    },
  },
  'Hard groove': { // percussive, looping techno: four-on-the-floor under rolling toms, rims and shuffled hats
    key: { root: 41, scale: DORIAN, chords: [[0, 2, 4, 6], [0, 2, 4, 6], [3, 5, 7, 9], [0, 2, 4, 6]] },
    tempo: { default: 140 },
    phraseBars: 4,
    swing: 0.12,
    patterns: {
      drums: [
        { kick: drum('x...x...x...x...'), clap: drum('....x.......x...'), hat: drum('xgxgxgxgxgxgxgxg'), openhat: drum('..x...x...x...x.'), rim: drum('.x..x.x..x...x..'), tom: drum('...x.....x..x...') },
        { kick: drum('x...x...x...x...'), clap: drum('....x.......x..x'), hat: drum('xgxgxgxgxgxgxgxg'), openhat: drum('..x...x...x...x.'), rim: drum('..x..x...x..x...'), tom: drum('.x.....x...x..x.') },
        { kick: drum('x...x...x...x.x.'), clap: drum('....x.......x...'), hat: drum('xxgxxxgxxxgxxxgx'), openhat: drum('..x...x...x...x.'), rim: drum('.x.x...x.x...x.x'), tom: drum('......x.x.....x.') },
      ],
      bass: [ // short funky stabs between the kicks
        line('..x..x....x..x..', [note(0, -1), note(0, 0), note(0, -1), note(4, -1)]),
        line('..xx..x...x.x...', [note(0, -1), note(0, 0), note(0, -1), note(0, -1), note(6, -1)]),
        line('.x.x..x..x.x..x.', [note(0, -1), note(0, -1), note(2, -1), note(0, 0), note(0, -1), note(4, -1)]),
      ],
      lead: [ // one-note stabs, repeated like a loop
        lead('..x.....x.x.....', 2, 0, 0, 4),
        lead('x.....x.....x...', 2, 4, 4, 3),
        lead('...x...x...x..x.', 2, 0, 2, 0, 4),
      ],
      pad: [ // organ chord stabs
        line('......x.......x.', [stab(1, 0.5)]),
        line('..x.......x.....', [stab(2, 0.5)]),
        line('...x..x....x..x.', [stab(1, 0.45)]),
      ],
    },
  },
  'Phonk': { // drift phonk: an 808 cowbell plays the riff over 808 kick, clap on 2 and 4, and a distorted 808
    key: { root: 41, scale: PHRYGIAN, chords: [[0, 2, 4], [0, 2, 4], [1, 3, 5], [0, 2, 4]] },
    tempo: { default: 140 },
    phraseBars: 4,
    swing: 0,
    patterns: {
      drums: [
        { kick: drum('x.....x...x.....'), clap: drum('....x.......x...'), hat: drum('x.x.x.x.x.x.x.x.'), hatroll: drum('................'), openhat: drum('................') },
        { kick: drum('x..x......x..x..'), clap: drum('....x.......x...'), hat: drum('x.x.x.x.x.x.x...'), hatroll: drum('..............xx'), openhat: drum('................') },
        { kick: drum('x.....x.x.x.....'), clap: drum('....x.......x..x'), hat: drum('xgxgxgxgxgxgxgxg'), hatroll: drum('................'), openhat: drum('..........x.....') },
      ],
      bass: [ // overlapping 808 notes glide into each other
        line('x.....x...x.....', [note(0, -1, 6), note(0, -1, 4), note(1, -1, 6)]),
        line('x..x......x..x..', [note(0, -1, 3), note(0, 0, 6), note(0, -1, 3), note(4, -1, 3)]),
        line('x.....x.x.x.....', [note(0, -1, 6), note(1, -1, 2), note(0, -1, 2), note(0, -1, 6)]),
      ],
      lead: [ // the cowbell riff: busy, repeating, mostly on the root and the flat 2nd
        lead('x..x..x.x..x..x.', 2, 0, 0, 1, 0, 4, 3),
        lead('x.xx.xx.x.xx.x.x', 2, 0, 1, 0, 0, 4, 3, 1, 0),
        lead('x..x..x...x.x.x.', 2, 4, 3, 1, 0, 1, 0),
      ],
      pad: [ // Memphis vocal chops
        line('x.......x.......', [stab(2, 0.55)]),
        line('x...x.......x.x.', [stab(1, 0.55)]),
        line('....x.......xx..', [stab(2, 0.5)]),
      ],
    },
  },
  'Dream pop': { // half-time, hazy and slow-feeling: soft drums, major-seventh chords, shimmering echoed guitar plucks
    key: { root: 43, scale: MAJOR, chords: [[0, 2, 4, 6], [3, 5, 7, 9], [5, 7, 9, 11], [4, 6, 8, 10]] },
    tempo: { default: 160 },
    phraseBars: 4,
    swing: 0,
    halfTime: true,
    patterns: {
      drums: [
        { kick: drum('x.........x.....'), snare: drum('........x.......'), hat: drum('x...x...x...x...') },
        { kick: drum('x.....x.........'), snare: drum('........x.......'), hat: drum('x.g.x.g.x.g.x.g.') },
        { kick: drum('x.........x..x..'), snare: drum('........x.......'), hat: drum('x...x...x...x...') },
      ],
      bass: [
        line('x.......x.......', [note(0, -1, 8), note(0, -1, 8)]),
        line('x.....x...x.....', [note(0, -1, 6), note(4, -1, 4), note(0, -1, 6)]),
        line('x.......x...x...', [note(0, -1, 8), note(2, -1, 4), note(4, -1, 4)]),
      ],
      lead: [
        lead('x...x...x...x...', 2, 4, 2, 6, 4),
        lead('x.x...x...x.x...', 2, 0, 2, 4, 6, 4),
        lead('..x...x.x.....x.', 2, 6, 4, 2, 4),
      ],
      pad: [
        notes([stab(16, 0.45), ...empty().slice(1)]),
        line('x.......x.......', [stab(8, 0.45)]),
        notes([stab(12, 0.4), ...empty().slice(1)]),
      ],
    },
  },
  'Hyperpop': { // fast, bright and overloaded: distorted kick, hi-hat rolls, supersaw hooks, pitched-up vocal chops
    key: { root: 45, scale: MAJOR, chords: [[0, 2, 4], [4, 6, 8], [5, 7, 9], [3, 5, 7]] },
    tempo: { default: 170 },
    phraseBars: 4,
    swing: 0,
    patterns: {
      drums: [
        { kick: drum('x.....x...x.....'), clap: drum('....x.......x...'), hat: drum('x.x.x.x.x.x.x...'), hatroll: drum('..............xx') },
        { kick: drum('x..x..x...x..x..'), clap: drum('....x.......x...'), hat: drum('x.x.x.x...x.x.x.'), hatroll: drum('........xx......') },
        { kick: drum('x.x...x.x.x.....'), clap: drum('....x.......x.xx'), hat: drum('xgxgxgxgxgxgxgxg'), hatroll: drum('................') },
      ],
      bass: [
        line('x.....x...x.....', [note(0, -1, 6), note(0, -1, 4), note(4, -1, 6)]),
        line('x..x..x...x..x..', [note(0, -1, 3), note(0, 0, 3), note(0, -1, 4), note(4, -1, 3)]),
        line('x.x...x.x.x.....', [note(0, -1, 2), note(0, 0, 4), note(0, -1, 2), note(2, -1, 2), note(0, -1, 6)]),
      ],
      lead: [
        lead('x.x.x.x.x...x.x.', 2, 4, 4, 5, 4, 2, 0, 2),
        lead('x..x..x.x..x..x.', 2, 0, 2, 4, 7, 6, 4),
        lead('xxx.x.x.xxx.x...', 2, 4, 5, 4, 2, 0, 2, 4, 2, 0),
      ],
      pad: [ // chipmunk vocal chops
        line('x.x.....x.x.....', [stab(1, 0.6)]),
        line('..xx..x...xx..x.', [stab(1, 0.55)]),
        line('x...xxx.x...xx.x', [stab(1, 0.6)]),
      ],
    },
  },
  'Rock': { // straight rock beat (kick 1 and 3, snare 2 and 4, eighth hats), driving eighth bass, distorted guitar
    key: { root: 40, scale: MINOR, chords: [[0, 4], [5, 9], [2, 6], [6, 10]] }, // power chords: root and fifth
    tempo: { default: 140 },
    phraseBars: 4,
    swing: 0,
    patterns: {
      drums: [
        { kick: drum('x.......x.......'), snare: drum('....x.......x...'), hat: drum('x.x.x.x.x.x.x.x.'), openhat: drum('................') },
        { kick: drum('x.......x.x.....'), snare: drum('....x.......x...'), hat: drum('x.x.x.x.x.x.x...'), openhat: drum('..............x.') },
        { kick: drum('x.....x.x.......'), snare: drum('....x.......x.xx'), hat: drum('x.x.x.x.x.x.x.x.'), openhat: drum('................') },
      ],
      bass: [ // eighth notes on the root, like a picked bass
        line('x.x.x.x.x.x.x.x.', [note(0, -1)]),
        line('x.x.x.x.x.x.x.x.', [note(0, -1), note(0, -1), note(0, -1), note(0, -1), note(0, -1), note(0, -1), note(4, -1), note(2, -1)]),
        line('x.xxx.x.x.xxx.x.', [note(0, -1), note(0, -1), note(0, 0), note(0, -1)]),
      ],
      lead: [ // guitar riff
        lead('x..x..x.x.x.....', 1, 0, 2, 3, 2, 0),
        lead('x.x.x...x.x.x...', 1, 4, 3, 2, 4, 3, 0),
        lead('x..x..x...x..x..', 1, 0, 3, 4, 6, 4),
      ],
      pad: [ // rhythm guitar: power-chord eighths
        line('x.x.x.x.x.x.x.x.', [stab(1, 0.55)]),
        line('x..x..x.x..x..x.', [stab(2, 0.55)]),
        notes([stab(8, 0.55), ...empty().slice(1, 8), stab(8, 0.5), ...empty().slice(9)]),
      ],
    },
  },
  'Drill': { // half-time: dark minor, skippy hats, snare on 3 plus late snares, 808s that slide between octaves
    key: { root: 41, scale: HARMONIC_MINOR, chords: [[0, 2, 4], [0, 2, 4], [5, 7, 9], [4, 6, 8]] },
    tempo: { default: 142 },
    phraseBars: 4,
    swing: 0,
    halfTime: true,
    patterns: {
      drums: [
        { kick: drum('x.........x.....'), snare: drum('........x.....x.'), hat: drum('x..x..x.x..x..x.'), hatroll: drum('................') },
        { kick: drum('x.....x.........'), snare: drum('........x.......'), hat: drum('x..x..x...x..x..'), hatroll: drum('........xx......') },
        { kick: drum('x.........x..x..'), snare: drum('...x....x.......'), hat: drum('x..x..x.x..x....'), hatroll: drum('..............xx') },
      ],
      bass: [ // overlapping 808 notes slide; octave jumps are the drill sound
        line('x.....x...x.....', [note(0, -1, 7), note(0, 0, 5), note(0, -1, 6)]),
        line('x.........x..x..', [note(0, -1, 10), note(5, -1, 3), note(4, -1, 3)]),
        line('x..x......x.....', [note(0, -1, 4), note(0, 0, 7), note(0, -1, 6)]),
      ],
      lead: [ // dark piano
        lead('x...x...x.x.....', 2, 4, 3, 2, 0),
        lead('x.....x.....x...', 2, 0, 4, 3),
        lead('..x...x...x...x.', 2, 4, 5, 4, 2),
      ],
      pad: [ // strings
        notes([stab(16, 0.4), ...empty().slice(1)]),
        line('x.......x.......', [stab(8, 0.4)]),
        notes([stab(12, 0.35), ...empty().slice(1)]),
      ],
    },
  },
  'R&B': { // half-time and swung: soft kick, finger-snap snare on 3, round bass, talkbox lead, electric-piano chords
    key: { root: 43, scale: DORIAN, chords: [[0, 2, 4, 6, 8], [3, 5, 7, 9], [1, 3, 5, 7], [4, 6, 8, 10]] },
    tempo: { default: 150 },
    phraseBars: 4,
    swing: 0.2,
    halfTime: true,
    patterns: {
      drums: [
        { kick: drum('x.........x.....'), rim: drum('........x.......'), hat: drum('x.g.x.g.x.g.x.g.') },
        { kick: drum('x.....x...x.....'), rim: drum('........x.......'), hat: drum('x...x.g.x...x.g.') },
        { kick: drum('x.........x..x..'), rim: drum('........x.....g.'), hat: drum('x.g.x.g.x.g.x...') },
      ],
      bass: [
        line('x.........x.....', [note(0, -1, 8), note(4, -1, 4)]),
        line('x.....x...x.....', [note(0, -1, 5), note(2, -1, 3), note(0, -1, 5)]),
        line('x.......x...x...', [note(0, -1, 6), note(0, 0, 3), note(4, -1, 3)]),
      ],
      lead: [
        lead('x...x.....x.x...', 2, 4, 2, 6, 4),
        lead('..x...x.x.......', 2, 2, 4, 3),
        lead('x.....x...x...x.', 2, 6, 4, 2, 0),
      ],
      pad: [ // electric piano
        notes([stab(10, 0.5), ...empty().slice(1)]),
        line('x.......x.......', [stab(6, 0.5), stab(4, 0.45)]),
        line('..x.......x.....', [stab(6, 0.45)]),
      ],
    },
  },
};
