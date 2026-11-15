// The transport owns one shared 16th-note clock; genre engines own phrase choices.
import * as Tone from 'https://cdn.jsdelivr.net/npm/tone@15.0.4/+esm';
import { emit, on, VOICES } from '../bus.js';
import { KITS } from './kits.js';
import { createHeart, HEART_OFF } from './heart.js';
import { createTempo } from './tempo.js';
import { GENRES } from './patterns.js';
import { createEvolution } from './evolution.js';

const [DRUMS, BASS, LEAD, PAD] = [0, 1, 2, 3];
// Diagnostics: open the page with ?perf to see whether notes are being scheduled late (see 'perf' in bus.js).
const PERF = /[?&]perf\b/.test(globalThis.location?.search ?? '');
const LATE = 0.02; // a step scheduled less than this far ahead of the audio clock risks an audible gap
let perf = { steps: 0, late: 0, worst: Infinity };
const master = new Tone.Gain();
const comp = new Tone.Compressor({ threshold: -18, ratio: 3, attack: 0.01, release: 0.2 });
const limiter = new Tone.Limiter(-1);
master.chain(comp, limiter, Tone.getDestination());
const wave = new Tone.Waveform(256);
const fft = new Tone.FFT(64);
limiter.fan(wave, fft);

const defaultName = Object.keys(GENRES)[0];
let selectedName = defaultName;
let activeName = defaultName;
let kit = KITS[activeName](master);
let failedKit = false;
let pendingName = null;
let trackers;
let hearts;
let tempo;
let target;
let shown = ''; // the last 'tempo' event sent, so it only goes out on a change
let evolution;
let step = 0;
let running = false;
let last = [0, 0, 0, 0];
let lastT = {};
const transport = Tone.getTransport();
transport.bpm.value = GENRES[defaultName].tempo.default;

function resetState() {
  trackers = VOICES.map(() => createHeart(50));
  hearts = VOICES.map(() => HEART_OFF);
  tempo = createTempo(activeName);
  target = GENRES[activeName].tempo.default;
  evolution = createEvolution(activeName);
  step = 0;
  lastT = {};
  shown = '';
}
resetState();

let standIn = []; // channels played by a click-started stand-in heartbeat (core.js): not real hearts
on('tapped', (list) => (standIn = list));
on('frame', ({ raws, ch }) => {
  last = raws;
  const nextHearts = ch.map((channel, index) => trackers[index](channel));
  nextHearts.forEach((heart, index) => {
    if (hearts[index]?.on && !heart.on) kit.lift(VOICES[index]);
  });
  hearts = nextHearts;
});

function disposeLater(old) {
  setTimeout(() => old.dispose(), (old.tail ?? 3) * 1000);
}

function activate(name, time = 0) {
  if (!KITS[name] || name === activeName && !failedKit) return;
  const old = kit;
  let next;
  try {
    next = KITS[name](master);
  } catch (error) {
    emit('status', `error: ${error.message}`);
    return;
  }
  kit = next;
  activeName = selectedName = name;
  failedKit = false;
  pendingName = null;
  tempo = createTempo(name);
  target = GENRES[name].tempo.default;
  evolution = createEvolution(name);
  old.silence();
  disposeLater(old);
  if (running) transport.bpm.rampTo(target, (8 * 60) / transport.bpm.value, time);
  Promise.resolve(next.ready).catch((error) => {
    if (kit !== next) return;
    failedKit = true;
    next.silence();
    emit('status', `error: ${error.message}`);
  });
}

function play(voice, params, heart, time, key = voice, sourceKit = kit, sourceName = activeName) {
  const effective = lastT[key] = Math.max(time, (lastT[key] ?? 0) + 0.01);
  sourceKit[voice](params, heart, effective);
  const note = { voice, ...params, kit: sourceName };
  Tone.getDraw().schedule(() => emit('note', note), effective);
}

const repeat = (time) => {
  if (!running) return;
  const s = step++ % 16;
  if (PERF) {
    const ahead = time - Tone.now(); // normally about the 0.1 s look-ahead; it shrinks when this thread was held up
    perf.steps++; perf.worst = Math.min(perf.worst, ahead);
    if (ahead < LATE) perf.late++;
    if (s === 0) emit('perf', { ...perf, state: Tone.getContext().state });
  }
  if (s === 0 && pendingName) activate(pendingName, time);
  if (failedKit) return;

  // a stand-in heartbeat runs at a random rate, so it stays out of the average
  const { song, heart } = tempo(hearts.map((h, index) => (standIn[index] ? HEART_OFF : h)), Tone.Time('16n').toSeconds());
  if (s === 0 && song !== target) { // a new tempo starts at a bar line and glides in over 2 bars
    target = song;
    transport.bpm.cancelScheduledValues(time);
    transport.bpm.rampTo(target, (8 * 60) / transport.bpm.value, time);
  }
  const readout = `${target},${Math.round(heart)}`;
  if (readout !== shown) {
    shown = readout;
    emit('tempo', { song: target, heart: Math.round(heart) });
  }
  kit.update(Object.fromEntries(VOICES.map((voice, index) => [voice, hearts[index]])), time, s);
  const stepSeconds = Tone.Time('16n').toSeconds();
  const events = evolution.next({ raws: last, hearts, stepSeconds });
  events.forEach((event) => {
    play(event.voice, event.params, hearts[VOICES.indexOf(event.voice)], time + event.offset,
      event.voice === 'drums' ? event.params.drum : event.voice, kit, activeName);
  });
};
transport.scheduleRepeat(repeat, '16n');

const begin = () => Tone.start();
on('connect', begin);
on('simulate', begin);
on('status', (status) => {
  if (status === 'running') {
    running = true;
    if (failedKit || selectedName !== activeName) activate(selectedName);
    transport.start();
    return;
  }
  running = false;
  pendingName = null;
  kit.silence();
  transport.stop();
  transport.position = 0;
  transport.bpm.cancelScheduledValues(0);
  transport.bpm.value = GENRES[selectedName].tempo.default;
  resetState();
});
on('kit', (name) => {
  if (!GENRES[name] || !KITS[name]) return;
  selectedName = name;
  if (!running) {
    activate(name);
  } else if (name === activeName) {
    pendingName = null;
  } else if (name !== activeName) {
    pendingName = name;
  }
});

emit('kits', Object.keys(GENRES));
emit('analyser', { wave, fft });
