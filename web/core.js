// Sources -> per-channel signal -> 'frame' events. Owns connect/simulate and status.
import { emit, on, VOICES } from './bus.js';
import { connectSerial, simChannels, simFill, simSensors, simTapped, startSim } from './serial.js';
import { createChannel } from './signal.js';

let stop = null;
let run = null;                   // latest requested run; older ones are stale
let queue = Promise.resolve();    // starts run one at a time, so a stop never overlaps an open
let channels = [];

function onFrame(raws) {
  emit('frame', { raws, ch: raws.map((raw, i) => channels[i](raw)) });
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
let filling = false;
const announce = () => emit('sensor', filling ? route : null);
on('route', (ch) => {
  if (!Number.isInteger(ch) || ch < 0 || ch >= VOICES.length) return;
  route = ch;
  announce();
});
// Sensors 2 and 3 are unplugged for now: clicking their blob starts a stand-in heartbeat at a
// random rate, and clicking it again stops it.
const CLICK_SIM = [1, 2];         // ponytail: channels a click can stand in for; empty this when the sensors are back
const TAP_BPM = [60, 100];        // the random rate is picked from this range at each start
let tapped = VOICES.map(() => 0); // per channel: the stand-in's BPM, 0 = off
on('tap', (ch) => {
  if (filling || !CLICK_SIM.includes(ch)) return; // with ?fill=sim a click moves the real sensor instead
  tapped = tapped.map((b, i) => (i !== ch ? b : b ? 0 : TAP_BPM[0] + Math.floor(Math.random() * (TAP_BPM[1] - TAP_BPM[0] + 1))));
  emit('tapped', tapped.map(Boolean));
});
on('connect', go((frame, onClose) => {
  filling = fillMissing();
  announce();
  const onFrame = simTapped(frame, () => tapped);
  const forced = simSensors(); // broken sensors (serial.js BROKEN_SENSORS) or ?sim=
  const out = forced.length ? simChannels(onFrame, forced) : onFrame;
  return connectSerial(filling ? simFill(out, () => route) : out, onClose, () => emit('button'));
}));
on('simulate', go((onFrame, onClose) => {
  filling = false;
  announce();
  return startSim(onFrame, onClose);
}));
emit('sensor', null);
emit('status', 'idle');
