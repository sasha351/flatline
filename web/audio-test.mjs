import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { HEART_OFF } from './audio/heart.js';
import { VOICES } from './bus.js';
import { GENRES } from './audio/patterns.js';
import { createTempo, songBpm, STEP, HOLD_S } from './audio/tempo.js';
import { phraseSeed, note, SCALE, ROOT } from './audio/mapping.js';
import { createEvolution, snapToChord } from './audio/evolution.js';
import { rng, makeMotif, develop } from './audio/melody.js';

const names = ['French house', 'UK garage', 'Ambient', 'Russian hardbass', 'Drum and bass', 'Acid techno', 'Lo-fi', 'Boom bap', 'Psytrance', 'Trap', 'Dubstep', 'Hardstyle', 'Reggaeton', 'Footwork', 'Jersey club', 'Hard groove', 'Phonk', 'Dream pop', 'Hyperpop', 'Rock', 'Drill', 'R&B', 'Punk', 'Metal'];

test('genre names, tempo ranges, defaults, phrase lengths, and swing', () => {
  assert.deepEqual(Object.keys(GENRES), names);
  assert.equal(songBpm(70), 140);
  assert.equal(songBpm(70.5), 141);
  assert.equal(songBpm(10), 60);
  assert.equal(songBpm(300), 220);
  for (const [name, def, bars] of [
    ['French house', 123, 4],
    ['UK garage', 133, 4],
    ['Ambient', 72, 8],
    ['Russian hardbass', 155, 4],
    ['Drum and bass', 172, 4],
    ['Acid techno', 132, 4],
    ['Lo-fi', 150, 4],
    ['Boom bap', 176, 4],
    ['Psytrance', 145, 4],
    ['Trap', 150, 4],
    ['Dubstep', 140, 4],
    ['Hardstyle', 150, 4],
    ['Reggaeton', 184, 4],
    ['Footwork', 160, 4],
    ['Jersey club', 140, 4],
    ['Hard groove', 140, 4],
    ['Phonk', 140, 4],
    ['Dream pop', 160, 4],
    ['Hyperpop', 170, 4],
    ['Rock', 140, 4],
    ['Drill', 142, 4],
    ['R&B', 150, 4],
    ['Punk', 180, 4],
    ['Metal', 170, 4],
  ]) {
    assert.deepEqual(createTempo(name)([HEART_OFF, HEART_OFF, HEART_OFF, HEART_OFF], 0.1), { song: def, heart: 0 });
    assert.equal(GENRES[name].phraseBars, bars);
  }
  assert.equal(GENRES['UK garage'].swing, 0.30);
});

test('genre grids are valid and variants change musical content', () => {
  for (const [name, genre] of Object.entries(GENRES)) {
    for (const voice of ['drums', 'bass', 'lead', 'pad']) {
      const variants = genre.patterns[voice];
      assert.ok(variants.length >= 3, `${name} ${voice} variants`);
      for (const grid of variants) {
        const cells = voice === 'drums' ? Object.values(grid).flat() : grid;
        if (voice === 'drums') {
          for (const drumGrid of Object.values(grid)) {
            assert.equal(drumGrid.length, 16, `${name} ${voice} grid length`);
            assert.ok(drumGrid.every((cell) => [0, 0.5, 1].includes(cell)));
          }
        } else {
          assert.equal(grid.length, 16, `${name} ${voice} grid length`);
        }
        for (const cell of cells) {
          if (voice !== 'drums') {
            if (cell !== null) {
            const degrees = voice === 'pad' ? (cell.degrees ?? []) : [cell.degree];
            assert.ok(degrees.every(Number.isInteger));
            assert.ok(cell.octave === undefined || Number.isInteger(cell.octave));
            assert.ok(Number.isFinite(cell.gate) && cell.gate > 0);
            assert.ok(Number.isFinite(cell.velocity) && cell.velocity >= 0 && cell.velocity <= 1);
            }
          }
        }
      }
      assert.ok(new Set(variants.map((grid) => JSON.stringify(grid))).size > 1, `${name} ${voice} differs`);
    }
  }
});

test('genre identity and ambient density constraints', () => {
  const house = GENRES['French house'].patterns.drums[0];
  assert.deepEqual(house.kick, [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]);
  assert.deepEqual(GENRES['Russian hardbass'].patterns.bass[0].map((v) => !!v), [false, false, true, false, false, false, true, false, false, false, true, false, false, false, true, false]);
  assert.notDeepEqual(GENRES['UK garage'].patterns.drums[0].kick, house.kick);
  for (const grid of GENRES.Ambient.patterns.lead) {
    assert.ok(grid.filter(Boolean).length <= 2);
  }
  for (const grid of GENRES.Ambient.patterns.pad) {
    assert.ok(grid.filter(Boolean).length <= 1);
  }
  for (const grid of GENRES.Ambient.patterns.drums) {
    assert.ok(Object.values(grid).reduce((n, v) => n + v.filter(Boolean).length, 0) <= 4);
  }
  for (const grid of GENRES.Ambient.patterns.bass) {
    assert.ok(grid.filter(Boolean).length <= 2);
  }
});

test('tempo follows the average of the stabilised hearts: lock, dead band, hold, release', () => {
  const tempo = createTempo('Ambient');
  const heart = (hr, settled = true) => ({ on: true, settled, hr });
  const run = (hearts, secs) => { let r; for (let i = 0; i < secs * 10; i++) r = tempo(hearts, 0.1); return r; };
  assert.deepEqual(run([HEART_OFF, HEART_OFF], 1), { song: 72, heart: 0 });
  assert.deepEqual(run([heart(90, false), HEART_OFF], 1), { song: 72, heart: 0 }, 'a calibrating finger does not count');
  assert.deepEqual(tempo([heart(70), heart(80), heart(120, false), HEART_OFF], 0.1), { song: 150, heart: 75 }, 'locks to twice the mean');
  assert.equal(run([heart(71), heart(80)], 60).song, 150, 'a 0.5 BPM shift of the average stays inside the dead band');
  const moved = run([heart(80), heart(80)], 60);
  assert.ok(Math.abs(moved.heart - 80) < 0.1 && Math.abs(moved.song - 160) < STEP, `follows a real change: ${moved.song}`);
  assert.ok(Number.isInteger(moved.song));
  const jump = tempo([heart(80), heart(120)], 0.1);
  assert.ok(jump.heart < 81 && jump.song === moved.song, 'one reading far off barely moves the average');
  const held = run([HEART_OFF, HEART_OFF], HOLD_S - 1);
  assert.equal(held.song, moved.song, 'all fingers off: the tempo holds');
  assert.ok(held.heart > 79);
  assert.deepEqual(run([HEART_OFF, HEART_OFF], 2), { song: 72, heart: 0 }, 'then the genre default returns');
});

const settled = (press = 0.5, breath = 0, hr = 75) => ({ on: true, settled: true, hr, press, breath });
const clone = (value) => structuredClone(value);
const runBars = (name, { bars, raws, hearts }) => {
  const engine = createEvolution(name);
  const out = Array.from({ length: bars }, () => []);
  const steps = bars * 16;
  for (let step = 0; step < steps; step++) {
    const events = engine.next({ raws, hearts: hearts.map(clone), step, stepSeconds: 0.125 });
    out[Math.floor(step / 16)].push(events);
  }
  return out;
};

test('phrase seed is deterministic and includes settled pressure and breath', () => {
  const heart = settled(0.5, 0);
  assert.equal(phraseSeed(0x12345678, heart), phraseSeed(0x12345678, clone(heart)));
  assert.equal(phraseSeed(0x12345678, HEART_OFF), 0);
  assert.notEqual(phraseSeed(0x12345678, settled(0.9, 0)), phraseSeed(0x12345678, heart));
  assert.notEqual(phraseSeed(0x12345678, settled(0.5, 0.8)), phraseSeed(0x12345678, heart));
});

test('phrase evolution is reproducible, neutral while unsettled, and bounded', () => {
  const input = {
    bars: 24,
    raws: [0x1234, 0x5678, 0x9abc, 0xdef0],
    hearts: [settled(0.6, 0.1), settled(0.4, -0.2), settled(0.8, 0), settled(0.5, 0.3)],
  };
  assert.deepEqual(runBars('UK garage', input), runBars('UK garage', input));
  assert.deepEqual(
    createEvolution('Ambient').next({
      raws: [0, 0, 0, 0], hearts: Array(4).fill(HEART_OFF), step: 0, stepSeconds: 0.125,
    }),
    [],
  );
  for (const name of Object.keys(GENRES)) {
    const bars = runBars(name, input);
    const phraseBars = GENRES[name].phraseBars;
    assert.ok(bars.slice(phraseBars, phraseBars * 2).flat(2).length > 0);
    const first = JSON.stringify(bars.slice(0, phraseBars));
    const second = JSON.stringify(bars.slice(phraseBars, phraseBars * 2));
    assert.notEqual(first, second, `${name} should evolve between phrases`);
    for (const events of bars.flat()) {
      for (const event of events) {
        assert.ok(event.offset >= 0 && event.offset < 0.125);
        assert.ok(Number.isFinite(event.offset));
        assert.ok(event.params.velocity >= 0 && event.params.velocity <= 1);
        if (event.voice !== 'drums') {
          assert.ok(event.params.duration > 0 && Number.isFinite(event.params.duration));
          for (const midi of event.params.notes) {
            const { key } = GENRES[name];
            assert.ok(key.scale.map((s) => (((key.root + s) % 12) + 12) % 12).includes((((midi) % 12) + 12) % 12));
            if (event.voice === 'bass') assert.ok(midi >= 33 && midi <= 64);
            if (event.voice === 'lead') assert.ok(midi >= 57 && midi <= 93);
            if (event.voice === 'pad') assert.ok(midi >= 45 && midi <= 88);
          }
        }
      }
    }
  }
});

test('kit boundaries expose four bounded, disposable, duration-aware kits', () => {
  const source = readFileSync(new URL('./audio/kits.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replaceAll('export const KITS', 'const KITS') + '\nglobalThis.KITS = KITS;';
  const nodes = [];
  const automation = [];
  const triggers = [];
  class Param {
    constructor(value = 0, node = null) { this.value = value; this.node = node; }
    setValueAtTime(value, time) { automation.push({ method: 'set', value, time, node: this.node }); this.value = value; }
    setTargetAtTime(value, time, constant) { automation.push({ method: 'target', value, time, constant, node: this.node }); this.value = value; }
    linearRampToValueAtTime(value, time) { automation.push({ method: 'ramp', value, time, node: this.node }); this.value = value; }
    rampTo(value, duration, time) { automation.push({ method: 'rampTo', value, duration, time, node: this.node }); this.value = value; }
    exponentialRampToValueAtTime(value, time) { automation.push({ method: 'expRamp', value, time, node: this.node }); this.value = value; }
  }
  class Node {
    constructor(options = {}) {
      this.options = options; this.disposals = 0; this.connections = [];
      this.volume = new Param(options.volume ?? 0, this); this.wet = new Param(options.wet ?? 0, this);
      this.gain = new Param(options.gain ?? 1, this);
      this.modulationIndex = new Param(options.modulationIndex ?? 0, this);
      this.frequency = new Param(options.frequency ?? 0, this); this.feedback = new Param(options.feedback ?? 0, this);
      let distortion = options.distortion ?? 0;
      Object.defineProperty(this, 'distortion', {
        get: () => distortion,
        set: (value) => { automation.push({ method: 'property', value, node: this }); distortion = value; },
      });
      this.envelope = { decay: 0 };
      this.filter = { frequency: new Param(0, this) };
      this.filterEnvelope = { baseFrequency: 0 };
      nodes.push(this);
    }
    connect(node) { this.connections.push(node); return node; }
    dispose() { this.disposals++; }
    start() { return this; }
    triggerAttackRelease(...args) { triggers.push({ node: this, args }); }
    triggerRelease() {}
    releaseAll() {}
  }
  const ctor = function (options) { return new Node(options); };
  const Tone = new Proxy({
    Frequency: (value) => ({ toNote: () => `midi:${value}`, toFrequency: () => 440 }),
    dbToGain: () => 1,
  }, { get(target, key) {
    if (key in target) return target[key];
    return ctor;
  }});
  const env = { Tone, GENRES: {} };
  runInNewContext(source, env);
  const names = ['French house', 'UK garage', 'Ambient', 'Russian hardbass', 'Drum and bass', 'Acid techno', 'Lo-fi', 'Boom bap', 'Psytrance', 'Trap', 'Dubstep', 'Hardstyle', 'Reggaeton', 'Footwork', 'Jersey club', 'Hard groove', 'Phonk', 'Dream pop', 'Hyperpop', 'Rock', 'Drill', 'R&B', 'Punk', 'Metal'];
  assert.deepEqual(Object.keys(env.KITS), names);
  const hearts = {
    drums: { hr: 75, press: 0.5, breath: 0 },
    bass: { hr: 80, press: 0.5, breath: 0 },
    lead: { hr: 85, press: 0.5, breath: 0 },
    pad: { hr: 70, press: 0.5, breath: 0 },
  };
  const dips = {};
  for (const name of names) {
    const out = new Node();
    const start = nodes.length;
    const autoStart = automation.length;
    const kit = env.KITS[name](out);
    for (const method of ['drums', 'bass', 'lead', 'pad', 'update', 'lift', 'silence', 'dispose']) {
      assert.equal(typeof kit[method], 'function', `${name}.${method}`);
    }
    kit.bass({ notes: [45], duration: 1.75, velocity: 0.8 }, hearts.bass, 1);
    kit.lead({ notes: [60], duration: 2.25, velocity: 0.7 }, hearts.lead, 2);
    kit.pad({ notes: [45, 49, 52], duration: 3.5, velocity: 0.6 }, hearts.pad, 3);
    const noteTriggers = triggers.filter(({ args }) => args.some((arg) => arg === 1.75 || arg === 2.25 || arg === 3.5));
    assert.ok(noteTriggers.length >= 3, `${name} forwards note durations`);
    for (const drum of ['kick', 'snare', 'clap', 'hat', 'openhat', 'rim']) kit.drums({ drum, velocity: 0.7 }, hearts.drums, 6);
    if (name === 'UK garage') {
      // the rim's own MembraneSynth: pitchDecay 0.005 and a very short decay (the clap's 0.01 decay has no pitchDecay)
      assert.ok(nodes.slice(start).some((n) => n.options.pitchDecay === 0.005 && n.options.envelope?.decay <= 0.04), 'rim node built');
    }
    if (name === 'French house') {
      kit.lead({ notes: [60], duration: 0.2, velocity: 0.7 }, { hr: 85, press: 0.5, breath: 1 }, 7);
      assert.ok(automation.some((a) => a.time === 7 && a.method === 'target' && a.value >= 700 && a.value <= 900), 'talkbox opens to "a" F1 on exhale');
    }
    if (name === 'Boom bap') { // a scratch: the pitch sweeps up and comes back inside the note, and the next one goes the other way
      const sweepsAt = (time, dur) => automation.filter((x) => x.method === 'expRamp' && x.time > time && x.time <= time + dur + 1e-9);
      kit.pad({ notes: [52, 55, 59], duration: 0.2, velocity: 0.6 }, hearts.pad, 9);
      const one = sweepsAt(9, 0.2).map((x) => x.value);
      assert.equal(one.length, 6, 'pitch and two formants each go out and back');
      kit.pad({ notes: [52, 55, 59], duration: 0.2, velocity: 0.6 }, hearts.pad, 10);
      const two = sweepsAt(10, 0.2).map((x) => x.value);
      const up = (x) => x[0] > x[1] * 3, down = (x) => x[0] * 3 < x[1]; // turning point vs where it ends
      assert.ok((up(one) && down(two)) || (down(one) && up(two)), 'scratches alternate: a push (up and back), then a pull (down and back)');
      kit.pad({ notes: [52, 55, 59], duration: 2, velocity: 0.6 }, hearts.pad, 11);
      assert.ok(sweepsAt(11, 2).every((x) => x.time <= 11.35 + 1e-9), 'a long cell still scratches fast');
    }
    if (name === 'Phonk') { // the cowbell: two squares at the 808's 800/540 ratio, struck together
      kit.lead({ notes: [69], duration: 0.2, velocity: 0.7 }, hearts.lead, 30);
      const hz = triggers.filter(({ args }) => args[2] === 30).map(({ args }) => args[0]).sort((a, b) => a - b);
      assert.equal(hz.length, 2, 'two oscillators');
      assert.ok(hz[0] === 440 && Math.abs(hz[1] / hz[0] - 800 / 540) < 1e-9, `cowbell pitches ${hz}`);
    }
    if (name === 'Dubstep') { // the wobble: the bass filter opens and closes inside one note
      kit.bass({ notes: [41], duration: 1, velocity: 0.8 }, hearts.bass, 20);
      const ramps = automation.filter((x) => x.method === 'ramp' && x.time > 20 && x.time <= 21 + 1e-9);
      assert.ok(ramps.length >= 4 && Math.max(...ramps.map((x) => x.value)) > 3 * Math.min(...ramps.map((x) => x.value)), `wobble: ${ramps.length} ramps`);
    }
    if (name === 'UK garage') {
      kit.lead({ notes: [60], duration: 0.2, velocity: 0.7 }, hearts.lead, 8);
      assert.ok(automation.some((a) => a.method === 'expRamp' && a.time > 8 && a.time <= 8.05), 'chop pitch drops into the note');
    }
    kit.update(hearts, 4, 0);
    kit.update(hearts, 5, 4);
    const dip = Math.min(...automation.slice(autoStart).filter((a) => a.method === 'ramp' && a.time === 4.03).map((a) => a.value));
    dips[name] = dip;
    if (name === 'French house') {
      assert.ok(automation.some((a) => a.time === 4 && a.value < 1), 'house beat dip');
      assert.ok(automation.some((a) => a.time === 4 && a.value >= 0.9), 'house recovery');
    }
    kit.dispose();
    nodes.slice(start).forEach((node) => assert.equal(node.disposals, 1, 'every kit node disposed once'));
  }
  for (const n of ['French house', 'UK garage', 'Russian hardbass']) assert.ok(dips[n] < 1, `${n} ducks`);
  assert.ok(dips['UK garage'] > dips['French house'], 'UKG dip shallower than house');
  for (const entry of automation) {
    assert.ok(Number.isFinite(entry.value) && entry.value >= 0 && entry.value <= 18000, 'automation bounded');
  }
});

test('live kit controls smooth real nodes and remain neutral before heart settlement', () => {
  const source = readFileSync(new URL('./audio/kits.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replaceAll('export const KITS', 'const KITS') + '\nglobalThis.KITS = KITS;';
  const nodes = [];
  const automation = [];
  class Param {
    constructor(value = 0, node = null) { this.value = value; this.node = node; }
    setValueAtTime(value, time) { automation.push({ method: 'set', value, time, node: this.node }); this.value = value; }
    setTargetAtTime(value, time, constant) { automation.push({ method: 'target', value, time, constant, node: this.node }); this.value = value; }
    linearRampToValueAtTime(value, time) { automation.push({ method: 'ramp', value, time, node: this.node }); this.value = value; }
    rampTo(value, duration, time) { automation.push({ method: 'rampTo', value, duration, time, node: this.node }); this.value = value; }
    exponentialRampToValueAtTime(value, time) { automation.push({ method: 'expRamp', value, time, node: this.node }); this.value = value; }
  }
  class Node {
    constructor(options = {}) {
      this.options = options; this.disposals = 0; this.connections = [];
      this.volume = new Param(options.volume ?? 0, this); this.wet = new Param(options.wet ?? 0, this);
      this.gain = new Param(options.gain ?? 1, this); this.modulationIndex = new Param(options.modulationIndex ?? 0, this);
      this.frequency = new Param(options.frequency ?? 0, this); this.feedback = new Param(options.feedback ?? 0, this);
      let distortion = options.distortion ?? 0;
      Object.defineProperty(this, 'distortion', {
        get: () => distortion,
        set: (value) => { automation.push({ method: 'property', value, node: this }); distortion = value; },
      });
      this.envelope = { decay: 0 };
      this.filter = { frequency: new Param(0, this) };
      this.filterEnvelope = { baseFrequency: 0 };
      nodes.push(this);
    }
    connect(node) { this.connections.push(node); return node; }
    dispose() { this.disposals++; }
    start() { return this; }
    triggerAttackRelease() {}
    triggerRelease() {}
    releaseAll() {}
  }
  const ctor = function (options) { return new Node(options); };
  const Tone = new Proxy({
    Frequency: (value) => ({ toNote: () => `midi:${value}`, toFrequency: () => 440 }),
    dbToGain: () => 1,
  }, { get(target, key) {
    if (key in target) return target[key];
    return ctor;
  }});
  const env = { Tone };
  runInNewContext(source, env);
  const out = new Node();
  const kit = env.KITS['Russian hardbass'](out);
  const hearts = {
    drums: { hr: 100, press: 1, breath: 0, on: true, settled: false },
    bass: { hr: 100, press: 1, breath: 0, on: true, settled: false },
    lead: { hr: 100, press: 1, breath: 0, on: true, settled: false },
    pad: { hr: 100, press: 1, breath: 0, on: true, settled: false },
  };
  kit.update(hearts, 10, 1);
  assert.ok(automation.some((a) => a.method === 'target' && Math.abs(a.value - 0.9) < 1e-9), 'drum amplitude uses neutral pressure before settled');
  assert.equal(automation.some((a) => a.time === 10 && a.method === 'target' && Math.abs(a.value - 1.1) < 1e-9), false, 'drum amplitude ignores unsettled pressure');
  assert.equal(automation.some((a) => a.method === 'property' && a.value !== 0), false, 'bass grit stays neutral before settled');
  const settledHearts = Object.fromEntries(Object.entries(hearts).map(([voice, heart]) => [voice, { ...heart, settled: true }]));
  kit.update(settledHearts, 11, 1);
  const garage = env.KITS['UK garage'](new Node());
  garage.update(settledHearts, 11, 1);
  assert.ok(automation.some((a) => a.method === 'target' && a.node?.options?.modulation?.type === 'square' && a.constant === 0.1 && a.value >= 0.5 && a.value <= 6), 'FM modulation is smoothed (rubber layer)');
  const mono = env.KITS['French house'](new Node());
  mono.update(settledHearts, 11, 1);
  assert.ok(automation.some((a) => a.method === 'target' && a.node?.options?.filter != null && a.constant === 0.1), 'MonoSynth filter is smoothed');
  const first = nodes.length;
  const house = env.KITS['French house'](new Node());
  const motion = nodes.slice(first).find((node) => node.options.frequency === 0.06);
  assert.ok(motion, 'house pad has motion filter');
  house.update(settledHearts, 12, 1);
  assert.ok(automation.some((a) => a.node === motion && a.method === 'rampTo' && a.duration === 0.1), 'pad texture balance targets the effect node');
});

test('audio lifecycle schedules the selected genre through one persistent repeat callback', () => {
  const source = readFileSync(new URL('./audio/audio.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '');
  const handlers = {};
  const emitted = [];
  const repeats = [];
  const ramps = [];
  const created = [];
  const drawn = [];
  class Node {
    chain() { return this; } fan() { return this; } connect() { return this; }
    dispose() {} silence() {}
  }
  const transport = {
    bpm: { value: 120, rampTo(value, duration, time) { ramps.push({ value, duration, time }); this.value = value; }, cancelScheduledValues() {} },
    scheduleRepeat(fn) { repeats.push(fn); return repeats.length; },
    start() { this.started = true; },
    stop() { this.stopped = true; },
    position: 0,
  };
  const Tone = {
    Gain: Node, Compressor: Node, Limiter: Node, Waveform: Node, FFT: Node,
    getDestination: () => new Node(), getTransport: () => transport,
    getDraw: () => ({ schedule(fn, time) { drawn.push({ fn, time }); } }),
    Time: () => ({ toSeconds: () => 0.125 }), start: async () => {},
  };
  const KITS = Object.fromEntries(Object.keys(GENRES).map((name) => [name, () => {
    const instance = {
      name, tail: 0, ready: Promise.resolve(), events: [], lifts: [], silences: 0, disposals: 0,
      drums(p, h, time) { this.events.push({ voice: 'drums', p, time }); },
      bass(p, h, time) { this.events.push({ voice: 'bass', p, time }); },
      lead(p, h, time) { this.events.push({ voice: 'lead', p, time }); },
      pad(p, h, time) { this.events.push({ voice: 'pad', p, time }); },
      update() {}, lift(voice) { this.lifts.push(voice); }, silence() { this.silences++; }, dispose() { this.disposals++; },
    };
    created.push(instance);
    return instance;
  }]));
  const active = { on: true, settled: true, hr: 75, press: 0.5, breath: 0 };
  const env = {
    Tone, KITS, VOICES, HEART_OFF, createHeart: () => (channel) => channel?.finger ? active : HEART_OFF,
    createTempo, createEvolution, GENRES,
    emit: (type, detail) => emitted.push([type, detail]),
    on: (type, fn) => { handlers[type] = fn; },
    setTimeout() {},
  };
  runInNewContext(source, env);
  assert.equal(repeats.length, 1);
  handlers.status('running');
  assert.equal(transport.started, true);
  handlers.frame({ raws: [1, 2, 3, 4], ch: [{ finger: false }, { finger: false }, { finger: false }, { finger: false }] });
  repeats[0](0);
  assert.equal(created[0].events.length, 0, 'all-off input is silent');
  handlers.frame({ raws: [1, 2, 3, 4], ch: [{ finger: true }, { finger: true }, { finger: true }, { finger: true }] });
  handlers.kit('UK garage');
  handlers.kit('Russian hardbass');
  repeats[0](0.125);
  assert.equal(created.length, 1, 'pending selections do not allocate early');
  for (let i = 0; i < 15; i++) repeats[0](0.25 + i * 0.125);
  assert.equal(created.length, 2, 'winning selection allocates at the bar');
  handlers.kit('UK garage');
  handlers.kit('Russian hardbass');
  for (let i = 0; i < 16; i++) repeats[0](2.25 + i * 0.125);
  assert.equal(created.length, 2, 'selecting the active genre cancels a different pending selection');
  const beforeLift = created[1].events.length;
  handlers.frame({ raws: [1, 2, 3, 4], ch: [{ finger: false }, { finger: true }, { finger: true }, { finger: true }] });
  for (let i = 0; i < 16; i++) repeats[0](4.25 + i * 0.125);
  const afterLift = created[1].events.slice(beforeLift);
  assert.equal(created[1].lifts.length, 1, 'a lifted voice releases exactly once');
  assert.ok(afterLift.some(({ voice }) => voice !== 'drums'), 'other voices continue after a lift');
  handlers.frame({ raws: [1, 2, 3, 4], ch: [{ finger: false }, { finger: true }, { finger: true }, { finger: true }] });
  repeats[0](4.375);
  assert.equal(created[1].lifts.length, 1, 'an already lifted voice is not released again');
  const secondStart = created[1].events.length;
  repeats[0](4.5);
  assert.equal(created[1].events.slice(secondStart).some(({ voice }) => voice === 'drums'), false,
    'lifted voices do not trigger new notes');
  repeats[0](0);
  assert.ok(ramps.some(({ value }) => value === songBpm(75)));
  assert.ok(drawn.every(({ time }) => Number.isFinite(time)));
  assert.ok(emitted.some(([type]) => type === 'kits'));
});

function createAudioHarness({ readyFor = () => Promise.resolve(), evolutionFactory = createEvolution } = {}) {
  const source = readFileSync(new URL('./audio/audio.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '');
  const handlers = {};
  const emitted = [];
  const repeats = [];
  const ramps = [];
  const created = [];
  const drawn = [];
  const transport = {
    bpm: {
      value: 120,
      rampTo(value, duration, time) {
        ramps.push({ value, duration, time });
        this.value = value;
      },
      cancelScheduledValues() {},
    },
    scheduleRepeat(fn) {
      repeats.push(fn);
      return repeats.length;
    },
    start() { this.started = true; },
    stop() { this.stopped = true; },
    position: 0,
  };
  class Node {
    chain() { return this; } fan() { return this; } connect() { return this; }
    dispose() { this.disposals = (this.disposals ?? 0) + 1; }
    silence() { this.silences = (this.silences ?? 0) + 1; }
  }
  const Tone = {
    Gain: Node, Compressor: Node, Limiter: Node, Waveform: Node, FFT: Node,
    getDestination: () => new Node(), getTransport: () => transport,
    getDraw: () => ({ schedule(fn, time) { drawn.push({ fn, time }); } }),
    Time: () => ({ toSeconds: () => 60 / transport.bpm.value / 4 }),
    start: async () => {},
  };
  const KITS = Object.fromEntries(Object.keys(GENRES).map((name) => [name, () => {
    const instance = {
      name, tail: 0, ready: readyFor(name), events: [], lifts: [],
      drums(p, h, time) { this.events.push({ voice: 'drums', p, time }); },
      bass(p, h, time) { this.events.push({ voice: 'bass', p, time }); },
      lead(p, h, time) { this.events.push({ voice: 'lead', p, time }); },
      pad(p, h, time) { this.events.push({ voice: 'pad', p, time }); },
      update() {},
      lift(voice) { this.lifts.push(voice); },
      silence() { this.silences = (this.silences ?? 0) + 1; },
      dispose() { this.disposals = (this.disposals ?? 0) + 1; },
    };
    created.push(instance);
    return instance;
  }]));
  const active = { on: true, settled: true, hr: 75, press: 0.5, breath: 0 };
  const env = {
    Tone, KITS, VOICES, HEART_OFF,
    createHeart: () => (channel) => channel?.finger ? active : HEART_OFF,
    createTempo, createEvolution: evolutionFactory, GENRES,
    emit: (type, detail) => emitted.push([type, detail]),
    on: (type, fn) => { handlers[type] = fn; },
    setTimeout,
  };
  runInNewContext(source, env);
  return { handlers, emitted, repeats, ramps, created, drawn, transport };
}

const fingerFrame = {
  raws: [1, 2, 3, 4],
  ch: [{ finger: true }, { finger: true }, { finger: true }, { finger: true }],
};

test('audio repeat uses live tempo for duration and garage swing timing', () => {
  const audio = createAudioHarness();
  audio.handlers.status('running');
  audio.handlers.frame(fingerFrame);
  audio.repeats[0](0);
  const first = audio.created[0].events.find(({ voice }) => voice === 'bass');
  assert.equal(first.p.duration, 60 / songBpm(75) / 4 * 1);

  audio.handlers.kit('UK garage');
  for (let i = 0; i < 16; i++) audio.repeats[0](0.125 + i * 0.125);
  audio.repeats[0](2.125);
  audio.repeats[0](2.25);
  audio.repeats[0](2.375);
  const stepSeconds = 60 / audio.transport.bpm.value / 4;
  const swung = audio.created[1].events.find(({ voice, time }) => voice === 'drums' && time > 2.3);
  assert.ok(Math.abs(swung.time - (2.375 + 0.3 * stepSeconds)) < 1e-12);
  const garage = audio.created[1].events.find(({ voice }) => voice === 'bass');
  assert.ok(Math.abs(garage.p.duration - stepSeconds) < 1e-12);
});

test('rejected kit readiness silences only the active replacement', async () => {
  let rejectReady;
  const audio = createAudioHarness({
    readyFor: (name) => name === 'UK garage'
      ? new Promise((resolve, reject) => { rejectReady = reject; })
      : Promise.resolve(),
  });
  audio.handlers.kit('UK garage');
  rejectReady(new Error('kit failed'));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(audio.created[1].silences, 1);
  assert.ok(audio.emitted.some(([type, detail]) => type === 'status' && detail === 'error: kit failed'));
  assert.equal(audio.created[0].silences, 1);
});

test('stale readiness rejection after superseded selection cannot silence the winner', async () => {
  let rejectGarage;
  const audio = createAudioHarness({
    readyFor: (name) => name === 'UK garage'
      ? new Promise((resolve, reject) => { rejectGarage = reject; })
      : Promise.resolve(),
  });
  audio.handlers.kit('UK garage');
  audio.handlers.kit('Russian hardbass');
  rejectGarage(new Error('stale kit failed'));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(audio.created[2].name, 'Russian hardbass');
  assert.equal(audio.created[2].silences ?? 0, 0);
  assert.equal(audio.emitted.some(([type, detail]) => type === 'status' && detail === 'error: stale kit failed'), false);
});

test('disconnect before pending activation reconnects with one callback and fresh evolution', () => {
  const evolutions = [];
  const audio = createAudioHarness({
    evolutionFactory: (name) => {
      const evolution = createEvolution(name);
      evolutions.push(evolution);
      return evolution;
    },
  });
  audio.handlers.status('running');
  audio.handlers.kit('UK garage');
  audio.handlers.status('error: disconnected');
  audio.handlers.status('running');
  assert.equal(audio.repeats.length, 1);
  assert.ok(evolutions.length >= 3);
  audio.handlers.frame(fingerFrame);
  audio.repeats[0](0);
  assert.equal(audio.created.at(-1).name, 'UK garage');
});

test('draw callbacks retain kit ownership and exact scheduled timing', () => {
  const audio = createAudioHarness();
  audio.handlers.status('running');
  audio.handlers.frame(fingerFrame);
  audio.repeats[0](0);
  const oldDraw = audio.drawn[0];
  audio.handlers.kit('UK garage');
  for (let i = 0; i < 16; i++) audio.repeats[0](0.125 + i * 0.125);
  oldDraw.fn();
  const note = audio.emitted.find(([type]) => type === 'note');
  assert.equal(note[1].kit, 'French house');
  assert.equal(oldDraw.time, audio.created[0].events[0].time);
});

test('rapid kit replacement silences and disposes each replaced kit once', async () => {
  const audio = createAudioHarness();
  audio.handlers.kit('UK garage');
  audio.handlers.kit('Ambient');
  audio.handlers.kit('Russian hardbass');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(audio.created.slice(0, 3).map((kit) => kit.silences), [1, 1, 1]);
  assert.deepEqual(audio.created.slice(0, 3).map((kit) => kit.disposals), [1, 1, 1]);
});

const seeds = Array.from({ length: 200 }, (_, i) => (i * 2654435761) >>> 0);
const heartAt = (hr, press = 0.5, breath = 0) => ({ on: true, settled: true, hr, press, breath });
const nulls = (m) => m.filter((d) => d === null).length;
const sounding = (m) => m.filter((d) => d !== null);
const avgLeap = (hr) => {
  let sum = 0, n = 0;
  for (const s of seeds) {
    const d = sounding(makeMotif(s, heartAt(hr)));
    for (let i = 1; i < d.length; i++) { sum += Math.abs(d[i] - d[i - 1]); n++; }
  }
  return sum / n;
};

test('rng is deterministic and in [0,1)', () => {
  const a = rng(5), b = rng(5);
  for (let i = 0; i < 20; i++) { const v = a(); assert.equal(v, b()); assert.ok(v >= 0 && v < 1); }
});

test('makeMotif is deterministic and varies with seed', () => {
  const h = heartAt(70);
  assert.deepEqual(makeMotif(7, h), makeMotif(7, h));
  const distinct = new Set([1, 2, 3, 4, 5].map((s) => JSON.stringify(makeMotif(s, h))));
  assert.ok(distinct.size > 1);
});

test('makeMotif shape: 16 slots, degrees 0..9, resolves on 0/4/5', () => {
  for (const s of seeds) {
    const m = makeMotif(s, heartAt(60 + (s % 60), 0.5, (s % 3) - 1));
    assert.equal(m.length, 16);
    assert.notEqual(m[0], null);
    for (const d of sounding(m)) assert.ok(Number.isInteger(d) && d >= 0 && d <= 9);
    assert.ok([0, 4, 5].includes(sounding(m).at(-1)));
  }
});

test('faster heart gives bigger leaps', () => {
  assert.ok(avgLeap(110) > avgLeap(50));
});

test('develop: phrases 0 and 4 return the motif unchanged', () => {
  const m = makeMotif(3, heartAt(70));
  assert.deepEqual(develop(m, 0, 3, heartAt(70, 0.9)), m);
  assert.deepEqual(develop(m, 4, 3, heartAt(70, 0.1)), m);
});

test('develop: phrases 1..3 stay valid, pure, and usually change the motif', () => {
  let changed = 0;
  for (const s of seeds) {
    const h = heartAt(70, 0.5, (s % 3) - 1);
    const m = makeMotif(s, h);
    const copy = [...m];
    let diff = false;
    for (const p of [1, 2, 3]) {
      const out = develop(m, p, s, h);
      assert.equal(out.length, 16);
      for (const d of sounding(out)) assert.ok(Number.isInteger(d) && d >= 0 && d <= 9);
      assert.ok([0, 4, 5].includes(sounding(out).at(-1)));
      if (JSON.stringify(out) !== JSON.stringify(m)) diff = true;
    }
    assert.deepEqual(m, copy);
    if (diff) changed++;
  }
  assert.ok(changed > seeds.length * 0.8);
});

test('develop: high press fills rests, low press adds rests', () => {
  for (const s of seeds.slice(0, 50)) {
    const m = makeMotif(s, heartAt(70));
    assert.equal(nulls(develop(m, 1, s, heartAt(70, 0.9))), 0);
    assert.ok(nulls(develop(m, 1, s, heartAt(70, 0.1))) >= nulls(m));
  }
});

const leadRun = (name, raw, bars, lead = settled(0.5, 0)) => runBars(name, {
  bars, raws: [1, 2, raw, 4], hearts: [settled(), settled(), lead, settled()],
});
const leadMidi = (run) => run.flat(2).filter((e) => e.voice === 'lead').map((e) => e.params.notes[0]);

test('lead motif: different raws give different lead notes, identical drums', () => {
  const a = leadRun('French house', 111, 4);
  const b = leadRun('French house', 987654, 4);
  assert.notDeepEqual(leadMidi(a), leadMidi(b));
  const drums = (r) => r.flat(2).filter((e) => e.voice === 'drums');
  assert.deepEqual(drums(a), drums(b));
});

test('lead motif: rhythm stays within the genre template', () => {
  const g = GENRES['French house'];
  const run = leadRun('French house', 111, 4);
  const maxOnsets = Math.max(...g.patterns.lead.map((v) => v.filter(Boolean).length));
  run.forEach((bar) => assert.ok(bar.flat().filter((e) => e.voice === 'lead').length <= maxOnsets));
  assert.ok(leadMidi(run).length > 0);
});

test('lead motif: finger lift regenerates the tune', () => {
  const engine = createEvolution('French house');
  const play = (raw, lead, steps) => {
    const out = [];
    for (let i = 0; i < steps; i++) {
      out.push(...engine.next({ raws: [1, 2, raw, 4], hearts: [settled(), settled(), lead, settled()], stepSeconds: 0.125 }));
    }
    return out.filter((e) => e.voice === 'lead').map((e) => e.params.notes[0]);
  };
  const before = play(111, settled(), 16);
  play(111, HEART_OFF, 16);
  const after = play(987654, settled(), 16);
  assert.ok(before.length && after.length);
  assert.notDeepEqual(before, after);
});

test('lead motif: unsettled lead plays the template pitches', () => {
  const g = GENRES['French house'];
  const run = leadRun('French house', 111, 1, { ...settled(), settled: false });
  const cells = g.patterns.lead.map((v) => v.filter(Boolean).map((c) => note(c.degree, c.octave, g.key.scale, g.key.root)));
  const got = leadMidi(run);
  assert.ok(got.length > 0);
  assert.ok(cells.some((c) => c.length === got.length && c.every((m, i) => {
    let x = m; while (x < 57) x += 12; while (x > 93) x -= 12; return x === got[i];
  })));
});

const fourHearts = (hr) => [settled(0.6, 0.1, hr), settled(0.4, -0.2, hr), settled(0.8, 0, hr), settled(0.5, 0.3, hr)];
const runSteps = (name, steps, raws = [0x1234, 0x5678, 0x9abc, 0xdef0], hr = 75) => {
  const e = createEvolution(name); const out = [];
  for (let s = 0; s < steps; s++) out.push(e.next({ raws, hearts: fourHearts(hr), stepSeconds: 0.125 }));
  return out;
};
const pc = (midi) => ((midi % 12) + 12) % 12;
const chordPcs = (key, chord) => chord.map((d) => pc(note(d, 0, key.scale, key.root)));

test('Ambient output is unchanged', () => {
  const snap = JSON.parse(readFileSync(new URL('./ambient-snapshot.json', import.meta.url), 'utf8'));
  assert.deepEqual(JSON.parse(JSON.stringify(runSteps('Ambient', 16 * 24, undefined, 80))), snap);
});

test('note() honours scale and root, defaults unchanged', () => {
  assert.equal(note(0, 0), ROOT);
  assert.equal(note(2, 0, [0, 2, 3, 5, 7, 9, 10], 43), 46);
  assert.equal(note(7, 0, [0, 2, 3, 5, 7, 9, 10], 43), 55);
});

test('snapToChord picks nearest chord tone by scale degree', () => {
  assert.equal(snapToChord(1, [0, 2, 4], 7), 0);   // tie 0/2 -> lower
  assert.equal(snapToChord(3, [0, 2, 4], 7), 2);
  assert.equal(snapToChord(6, [0, 2, 4], 7), 7);   // octave root
  assert.equal(snapToChord(5, [5, 7, 9], 7), 5);
});

test('motif with n = 7 resolves to root, 5th or octave root', () => {
  const m = makeMotif(12345, settled(0.6, 0.1), 7);
  assert.ok([0, 4, 7].includes(m[m.findLastIndex((d) => d !== null)]));
  const d = develop(m, 1, 12345, settled(0.6, 0.1), 7);
  assert.ok([0, 4, 7].includes(d[d.findLastIndex((x) => x !== null)]));
});

for (const name of ['French house', 'UK garage', 'Russian hardbass', 'Drum and bass', 'Acid techno', 'Lo-fi', 'Boom bap', 'Psytrance', 'Trap', 'Dubstep', 'Hardstyle', 'Reggaeton', 'Footwork', 'Jersey club', 'Hard groove', 'Phonk', 'Dream pop', 'Hyperpop', 'Rock', 'Drill', 'R&B', 'Punk', 'Metal']) {
  test(`${name}: notes in key, lead strong beats on chord tones`, () => {
    const { key } = GENRES[name];
    const steps = runSteps(name, 16 * GENRES[name].phraseBars * 2);
    const scalePcs = key.scale.map((s) => pc(key.root + s));
    steps.forEach((events, step) => {
      const chord = key.chords[Math.floor(step / 16) % key.chords.length];
      for (const ev of events) {
        if (ev.voice === 'drums') continue;
        ev.params.notes.forEach((m) => assert.ok(scalePcs.includes(pc(m)), `${name} ${ev.voice} ${m} in scale`));
        if (ev.voice === 'lead' && step % 4 === 0) assert.ok(chordPcs(key, chord).includes(pc(ev.params.notes[0])));
        if (ev.voice === 'pad') assert.deepEqual(new Set(ev.params.notes.map(pc)), new Set(chordPcs(key, chord)));
      }
    });
  });
  test(`${name}: every bar has a bass note on the chord root`, () => {
    const { key } = GENRES[name];
    const steps = runSteps(name, 16 * GENRES[name].phraseBars * 2);
    for (let bar = 0; bar < steps.length / 16; bar++) {
      const root = chordPcs(key, key.chords[bar % key.chords.length])[0];
      const bass = steps.slice(bar * 16, bar * 16 + 16).flat().filter((e) => e.voice === 'bass');
      assert.ok(bass.some((e) => pc(e.params.notes[0]) === root), `${name} bar ${bar} bass root`);
    }
  });
}

test('genre signatures', () => {
  const g = GENRES;
  assert.notDeepEqual(g['UK garage'].patterns.drums[0].kick, g['French house'].patterns.drums[0].kick);
  assert.equal(g['UK garage'].patterns.drums[0].kick[8], 0, 'UKG kick skips beat 3');
  const pumpSteps = g['Russian hardbass'].patterns.bass[0].map((c, i) => (c ? i : -1)).filter((i) => i >= 0);
  assert.deepEqual(pumpSteps, [2, 6, 10, 14]);
  assert.ok(g['French house'].patterns.drums[0].openhat.every((w, i) => (w > 0) === (i % 4 === 2)));
  assert.deepEqual(g['Drum and bass'].patterns.drums[0].snare.map((w, i) => (w === 1 ? i : -1)).filter((i) => i >= 0), [4, 12], 'DnB snare on 2 and 4');
  assert.ok(g['Drum and bass'].patterns.drums[0].kick[0] && g['Drum and bass'].patterns.drums[0].kick[10] && !g['Drum and bass'].patterns.drums[0].kick[8], 'DnB two-step kick');
  assert.ok(g['Acid techno'].patterns.bass.every((v) => v.filter(Boolean).length >= 6), 'acid bass line is busy');
  assert.ok(g.Psytrance.patterns.bass.every((v) => [1, 2, 3, 5, 6, 7].every((i) => v[i]) && !v[0] && !v[4]), 'psytrance bass rolls after each kick, never on it');
  // trap roll: two closed hats inside one 16th, half a step apart, and no plain hat on that step
  const hatSteps = runSteps('Trap', 16 * 8).map((evs) => evs.filter((e) => e.voice === 'drums' && e.params.drum === 'hat').map((e) => e.offset));
  const rolls = hatSteps.filter((o) => o.length > 1);
  assert.ok(rolls.length > 0, 'trap plays hat rolls');
  for (const o of rolls) assert.deepEqual(o, [0, 0.0625], 'hat roll: two 32nd notes, no plain hat on top');
  assert.ok(g.Hardstyle.patterns.bass.every((v) => v.every((c, i) => !c || i % 4 === 1)), 'reverse bass sits right after each kick');
  for (const v of g['Hard groove'].patterns.drums) assert.ok(v.tom.some(Boolean) && v.rim.some(Boolean) && v.kick.filter(Boolean).length >= 4, 'hard groove: four-on-the-floor plus toms and rims');
  for (const v of g.Rock.patterns.drums) assert.ok(v.kick[0] && v.kick[8] && v.snare[4] && v.snare[12], 'rock beat: kick 1 and 3, snare 2 and 4');
  assert.ok(g.Rock.key.chords.every((c) => c.length === 2 && c[1] - c[0] === 4), 'rock pad plays power chords (root and fifth)');
  for (const name of ['Dream pop', 'Drill', 'R&B']) assert.ok(g[name].halfTime && g[name].patterns.drums.every((v) => (v.snare ?? v.rim)[8]), `${name}: half-time, backbeat on 3`);
  assert.ok(g.Metal.patterns.drums.some((v) => v.kick.every(Boolean)), 'metal has a double-kick 16th variant');
  assert.ok([0, 4, 8, 12].every((i) => g.Punk.patterns.drums[0].kick[i]) && [2, 6, 10, 14].every((i) => g.Punk.patterns.drums[0].snare[i]), 'punk oom-pah: kick on the beat, snare on the offbeat');
  for (const v of g.Reggaeton.patterns.drums) assert.ok(v.snare[6] && v.snare[12], 'dembow snare');
  for (const v of g['Boom bap'].patterns.drums) {
    assert.ok(v.kick[0] === 1, 'boom on the one');
    assert.deepEqual(v.snare.map((w, i) => (w === 1 ? i : -1)).filter((i) => i >= 0), [8], 'bap on beat 3 (half-time)');
  }
  // half-time swing: the delayed steps are the off 8ths (2, 6, 10, 14), by a quarter of an 8th
  const late = runSteps('Boom bap', 16).map((evs, step) => [step, evs.map((e) => e.offset)]);
  for (const [step, offsets] of late) for (const o of offsets) assert.equal(o, step % 4 === 2 ? 0.25 * 2 * 0.125 : 0, `boom bap swing at step ${step}`);
  for (const v of g['Lo-fi'].patterns.drums) assert.deepEqual(v.snare.map((w, i) => (w === 1 ? i : -1)).filter((i) => i >= 0), [8], 'lo-fi is half-time: one snare, on beat 3');
  for (const [name, pieces] of [['French house', ['kick', 'clap', 'hat', 'openhat']], ['UK garage', ['kick', 'snare', 'clap', 'hat', 'openhat', 'rim']], ['Russian hardbass', ['kick', 'clap', 'openhat']],
    ['Drum and bass', ['kick', 'snare', 'hat', 'openhat']], ['Acid techno', ['kick', 'clap', 'hat', 'openhat', 'rim']], ['Lo-fi', ['kick', 'snare', 'hat', 'rim']], ['Boom bap', ['kick', 'snare', 'hat']], ['Trap', ['kick', 'clap', 'hat', 'hatroll', 'openhat']]]) {
    for (const v of g[name].patterns.drums) assert.deepEqual(Object.keys(v).sort(), [...pieces].sort(), `${name} pieces`);
  }
});

test('UKG ghost hats are quieter than full hats', () => {
  assert.ok(GENRES['UK garage'].patterns.drums[0].hat.includes(0.5));
  const hats = runSteps('UK garage', 16).map((evs, step) => [step, evs.find((e) => e.voice === 'drums' && e.params.drum === 'hat')]).filter(([, e]) => e);
  const at = (step) => hats.find(([s]) => s === step)?.[1].params.velocity;
  assert.ok(at(0) < at(1), `ghost ${at(0)} < full ${at(1)}`);
});

test('French house bass octave variant lands an octave apart on the tonic', () => {
  const bars = runSteps('French house', 16);
  const pitches = new Set(bars.flat().filter((e) => e.voice === 'bass').map((e) => e.params.notes[0]));
  assert.equal(pitches.size, 2);
  const [lo, hi] = [...pitches].sort((a, b) => a - b);
  assert.equal(hi - lo, 12);
});

test('French house lead stays in register without 7th leaps', () => {
  let n = 0, big = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const raws = [seed * 0x9e37 & 0xffff, seed * 0x85eb & 0xffff, seed * 0xc2b2 & 0xffff, seed * 0x27d4 & 0xffff];
    const leads = runSteps('French house', 16 * 8, raws).flat().filter((e) => e.voice === 'lead').map((e) => e.params.notes[0]);
    leads.forEach((m, i) => {
      assert.ok(m >= 57 && m <= 93, `lead ${m}`);
      if (i) { n++; if (Math.abs(m - leads[i - 1]) >= 9) big++; }
    });
  }
  assert.ok(n > 0 && big / n < 0.1, `big leaps ${big}/${n}`);
});

test('fast drum heart fills in 16th hats, calm one drops the open hat', () => {
  const run = (hr) => {
    const engine = createEvolution('French house');
    const h = { on: true, settled: true, hr, press: 0.5, breath: 0 };
    const hearts = VOICES.map((v) => (v === 'drums' ? h : HEART_OFF));
    let hats = 0, open = 0;
    for (let i = 0; i < 64; i++) {
      for (const e of engine.next({ raws: VOICES.map(() => 12345), hearts })) {
        if (e.params.drum === 'hat') hats++;
        if (e.params.drum === 'openhat') open++;
      }
    }
    return { hats, open };
  };
  assert.ok(run(95).hats > run(78).hats, 'hot adds hats');
  assert.equal(run(65).open, 0, 'calm drops open hat');
  assert.ok(run(78).open > 0, 'neutral keeps open hat');
});
