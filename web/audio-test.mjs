import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { HEART_OFF } from './audio/heart.js';
import { VOICES } from './bus.js';
import { GENRES } from './audio/patterns.js';
import { createTempo, songBpm } from './audio/tempo.js';
import { phraseSeed, note, SCALE, ROOT } from './audio/mapping.js';
import { createEvolution } from './audio/evolution.js';
import { rng, makeMotif, develop } from './audio/melody.js';

const names = ['French house', 'UK garage', 'Ambient', 'Russian hardbass'];

test('genre names, tempo ranges, defaults, phrase lengths, and swing', () => {
  assert.deepEqual(Object.keys(GENRES), names);
  for (const [name, lo, hi, def, bars] of [
    ['French house', 112, 128, 120, 4],
    ['UK garage', 128, 138, 132, 4],
    ['Ambient', 60, 90, 72, 8],
    ['Russian hardbass', 145, 165, 150, 4],
  ]) {
    assert.equal(songBpm(30, name), lo);
    assert.equal(songBpm(80, name), (lo + hi) / 2);
    assert.equal(songBpm(150, name), hi);
    assert.equal(createTempo(name)(HEART_OFF), def);
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
            assert.ok(drumGrid.every((cell) => typeof cell === 'boolean'));
          }
        } else {
          assert.equal(grid.length, 16, `${name} ${voice} grid length`);
        }
        for (const cell of cells) {
          if (voice !== 'drums') {
            if (cell !== null) {
            const degrees = voice === 'pad' ? cell.degrees : [cell.degree];
            assert.ok(degrees.every(Number.isInteger));
            assert.ok(Number.isInteger(cell.octave));
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
  assert.deepEqual(house.kick, [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false]);
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

test('genre tempo follower locks, ignores jitter, follows movement, and releases', () => {
  const tempo = createTempo('Ambient');
  const heart = (on, settled, hr) => ({ on, settled, hr });
  assert.equal(tempo(HEART_OFF), 72);
  assert.equal(tempo(heart(true, false, 72)), 72);
  assert.equal(tempo(heart(true, true, 72)), songBpm(72, 'Ambient'));
  assert.equal(tempo(heart(true, true, 72.5)), songBpm(72, 'Ambient'));
  assert.equal(tempo(heart(true, true, 73)), songBpm(72, 'Ambient'));
  assert.equal(tempo(heart(true, true, 78)), songBpm(78, 'Ambient'));
  assert.equal(tempo(HEART_OFF), 72);
});

const settled = (press = 0.5, breath = 0) => ({ on: true, settled: true, hr: 75, press, breath });
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
            assert.ok(SCALE.includes((((midi - ROOT) % 12) + 12) % 12));
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
    Frequency: (value) => ({ toNote: () => `midi:${value}` }),
    dbToGain: () => 1,
  }, { get(target, key) {
    if (key in target) return target[key];
    return ctor;
  }});
  const env = { Tone, GENRES: {} };
  runInNewContext(source, env);
  const names = ['French house', 'UK garage', 'Ambient', 'Russian hardbass'];
  assert.deepEqual(Object.keys(env.KITS), names);
  const hearts = {
    drums: { hr: 75, press: 0.5, breath: 0 },
    bass: { hr: 80, press: 0.5, breath: 0 },
    lead: { hr: 85, press: 0.5, breath: 0 },
    pad: { hr: 70, press: 0.5, breath: 0 },
  };
  for (const name of names) {
    const out = new Node();
    const start = nodes.length;
    const kit = env.KITS[name](out);
    for (const method of ['drums', 'bass', 'lead', 'pad', 'update', 'lift', 'silence', 'dispose']) {
      assert.equal(typeof kit[method], 'function', `${name}.${method}`);
    }
    kit.bass({ notes: [45], duration: 1.75, velocity: 0.8 }, hearts.bass, 1);
    kit.lead({ notes: [60], duration: 2.25, velocity: 0.7 }, hearts.lead, 2);
    kit.pad({ notes: [45, 49, 52], duration: 3.5, velocity: 0.6 }, hearts.pad, 3);
    const noteTriggers = triggers.filter(({ args }) => args.some((arg) => arg === 1.75 || arg === 2.25 || arg === 3.5));
    assert.ok(noteTriggers.length >= 3, `${name} forwards note durations`);
    kit.update(hearts, 4, 0);
    kit.update(hearts, 5, 4);
    if (name === 'French house') {
      assert.ok(automation.some((a) => a.time === 4 && a.value < 1), 'house beat dip');
      assert.ok(automation.some((a) => a.time === 4 && a.value >= 0.9), 'house recovery');
    }
    kit.dispose();
    nodes.slice(start).forEach((node) => assert.equal(node.disposals, 1, 'every kit node disposed once'));
  }
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
    Frequency: (value) => ({ toNote: () => `midi:${value}` }),
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
  assert.ok(automation.some((a) => a.method === 'target' && a.node?.options?.modulationIndex != null && a.constant === 0.1), 'FM modulation is smoothed');
  const mono = env.KITS['French house'](new Node());
  mono.update(settledHearts, 11, 1);
  assert.ok(automation.some((a) => a.method === 'target' && a.node?.options?.filter != null && a.constant === 0.1), 'MonoSynth filter is smoothed');
  const house = env.KITS['French house'](new Node());
  const motion = nodes.find((node) => node.options.frequency === 0.08);
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
  assert.ok(ramps.some(({ value }) => value === songBpm(75, 'Russian hardbass')));
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
  assert.equal(first.p.duration, 60 / songBpm(75, 'French house') / 4 * 2);

  audio.handlers.kit('UK garage');
  for (let i = 0; i < 16; i++) audio.repeats[0](0.125 + i * 0.125);
  audio.repeats[0](2.125);
  audio.repeats[0](2.25);
  audio.repeats[0](2.375);
  const garage = audio.created[1].events.find(({ voice, time }) => voice === 'bass' && time > 2.3);
  const stepSeconds = 60 / audio.transport.bpm.value / 4;
  assert.ok(Math.abs(garage.p.duration - stepSeconds) < 1e-12);
  assert.ok(Math.abs(garage.time - (2.375 + 0.3 * stepSeconds)) < 1e-12);
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
  const cells = g.patterns.lead.map((v) => v.filter(Boolean).map((c) => note(c.degree, c.octave)));
  const got = leadMidi(run);
  assert.ok(got.length > 0);
  assert.ok(cells.some((c) => c.length === got.length && c.every((m, i) => {
    let x = m; while (x < 57) x += 12; while (x > 93) x -= 12; return x === got[i];
  })));
});
