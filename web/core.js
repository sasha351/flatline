// Sources -> per-channel signal -> 'frame' events. Owns connect/simulate and status.
import { emit, on, VOICES } from './bus.js';
import { connectSerial, simChannels, simFill, simSensors, simTapped, startSim } from './serial.js';
import { createChannel } from './signal.js';

let stop = null;
let run = null;                   // latest requested run; older ones are stale
let queue = Promise.resolve();    // starts run one at a time, so a stop never overlaps an open
let channels = [];
let filling = false;              // ?fill=sim is on (set at connect)

// A stand-in heartbeat (a clicked blob, below) is not a real reading, so it runs at about the average
// of the real fingers' stabilised BPM and follows it. With no real reading yet it keeps its last rate.
const STAND_IN_START = 75;        // BPM before any real finger has stabilised
const STAND_IN_FOLLOW = 1 / 50;   // per frame: closes on the real average in about a second
const STAND_IN_OFFSET = [0, -2, 2, 0]; // ponytail: BPM per channel off the average, so two stand-ins don't beat in unison
let tapped = VOICES.map(() => false); // per channel: a stand-in is playing it
let standIn = STAND_IN_START;
export const standInBpms = () => tapped.map((on, i) => (on ? standIn + STAND_IN_OFFSET[i] : 0));

function onFrame(raws) {
  const ch = raws.map((raw, i) => channels[i](raw));
  const real = ch.filter((c, i) => !tapped[i] && c.finger && c.stable && c.bpm > 0).map((c) => c.bpm);
  if (real.length) standIn += (real.reduce((a, b) => a + b, 0) / real.length - standIn) * STAND_IN_FOLLOW;
  emit('frame', { raws, ch });
}

export function start(source) {
  const me = (run = {});
  const job = queue.then(async () => {
    if (run !== me) return;       // superseded before we began; the newer job handles it
    const prev = stop;
    stop = null;
    await prev?.();
    channels = VOICES.map(() => createChannel(50));
    stop = await source(
      (raws) => run === me && onFrame(raws),
      () => run === me && emit('status', 'disconnected'),
    );                            // stored even if superseded: the next queued job stops it
    if (run === me) emit('status', 'running');
  });
  queue = job.catch(() => {});
  return job.catch((e) => { if (run === me) throw e; });  // stale failures stay quiet
}

const go = (source) => () => start(source).catch((e) => emit('status', `error: ${e.message}`));
// Open the page with ?fill=sim to debug with fewer sensors than voices: the real
// sensor plays the voice chosen by 'route' (default drums) and the rest are simulated.
// Read at click time, not import time, so Node can still load this module.
const fillMissing = () => new URLSearchParams(globalThis.location?.search).get('fill') === 'sim';
let route = 0;
const announce = () => emit('sensor', filling ? route : null);
on('route', (ch) => {
  if (!Number.isInteger(ch) || ch < 0 || ch >= VOICES.length) return;
  route = ch;
  announce();
});
// All four sensors work, so clicks do nothing by default. If one dies again, open the page with ?standin=2,3
// (sensor numbers as on screen): clicking those blobs starts a stand-in heartbeat (its rate: see standIn
// above), and clicking again stops it. Read at click time, like ?fill=sim.
const clickSim = () => (new URLSearchParams(globalThis.location?.search).get('standin') ?? '')
  .split(',').map((n) => parseInt(n, 10) - 1).filter((ch) => ch >= 0 && ch < VOICES.length);
on('tap', (ch) => {
  if (filling || !clickSim().includes(ch)) return; // with ?fill=sim a click moves the real sensor instead
  tapped = tapped.map((on, i) => (i === ch ? !on : on));
  emit('tapped', [...tapped]);
});
on('connect', go((frame, onClose) => {
  filling = fillMissing();
  announce();
  const onFrame = simTapped(frame, standInBpms);
  const forced = simSensors(); // broken sensors (serial.js BROKEN_SENSORS) or ?sim=
  const out = forced.length ? simChannels(onFrame, forced) : onFrame;
  return connectSerial(filling ? simFill(out, () => route) : out, onClose, () => emit('button'));
}));
// Tell the Pi about every kit change (button or menu) so its OLED can show the genre name.
// stop is the running source's stop(); only the serial source has send().
on('kit', (name) => stop?.send?.(`k,${name}`));
on('simulate', go((onFrame, onClose) => {
  filling = false;
  announce();
  return startSim(onFrame, onClose);
}));
emit('sensor', null);
emit('status', 'idle');
