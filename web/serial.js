// Frame sources. Each calls onFrame([ir0, ir1, ir2, ir3]) ~50x/s.
import { FINGER_MIN } from './signal.js';

export function parseLine(line) {
  const t = line.trim();
  return /^\d+,\d+,\d+,\d+$/.test(t) ? t.split(',').map(Number) : null;
}

// The Pi Zero's USB gadget serial (Linux g_serial defaults: NetChip VID, CDC ACM PID). The picker
// lists only the Pi, not the dozens of empty ttyS ports. ?port=any lists every port (the old Arduino).
export const PI_GADGET = { usbVendorId: 0x0525, usbProductId: 0xa4a7 };
const anyPort = () => new URLSearchParams(globalThis.location?.search).get('port') === 'any';

// The Pi sends this line once per press of the genre button (GPIO26, see pi/flatline.py).
export const isButton = (line) => line.trim() === 'b';

export async function connectSerial(onFrame, onClose, onButton) {
  const port = await navigator.serial.requestPort(anyPort() ? {} : { filters: [PI_GADGET] });
  await port.open({ baudRate: 115200 }); // ignored by the gadget; the Arduino sketches use it
  const decoder = new TextDecoderStream();
  const piped = port.readable.pipeTo(decoder.writable).catch(() => {});
  const reader = decoder.readable.getReader();

  (async () => {
    let buf = '';
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const l of lines) {
          const f = parseLine(l);
          if (f) onFrame(f);
          else if (isButton(l)) onButton?.();
          // other lines are dropped
        }
      }
    } catch {
      // device unplugged
    }
    onClose();
  })();

  return async () => {
    await reader.cancel().catch(() => {});
    await piped;
    await port.close().catch(() => {});
  };
}

// Simulated IR: dips on each pulse, sitting on a ~100k DC level, plus sensor noise.
// The drum finger lands after 10 s (tests the no-drum default and the tempo lock),
// and the pad finger's rate swings +-6 BPM on a 4 s breathing cycle.
const SIM_BPMS = [72, 64, 88, 58];
const SIM_DC = 100000;
function simSource(rate = 50) {
  const phase = [0, 0, 0, 0];
  let n = 0;
  return () => {
    const t = n++ / rate;
    return SIM_BPMS.map((b, ch) => {
      if (ch === 0 && t < 10) return 0;
      const bpm = ch === 3 ? b + 6 * Math.sin((2 * Math.PI * t) / 4) : b;
      phase[ch] += (2 * Math.PI * bpm) / 60 / rate;
      return Math.round(SIM_DC - 400 * Math.sin(phase[ch]) + Math.random() * 40);
    });
  };
}

export function startSim(onFrame) {
  const next = simSource();
  const id = setInterval(() => onFrame(next()), 20);
  return () => clearInterval(id);
}

// Sensors to simulate unless the page says otherwise: list a broken one here (e.g. [4]) to keep
// the band whole. ?sim=3,4 picks sensors for one visit; ?sim=none simulates nothing.
export const BROKEN_SENSORS = [];
// Sensor numbers (as on screen) -> channel indexes to simulate.
export function simSensors(search = globalThis.location?.search ?? '', count = 4) {
  const q = new URLSearchParams(search).get('sim');
  const nums = q == null ? BROKEN_SENSORS : q.split(',').map((n) => parseInt(n, 10));
  return [...new Set(nums.map((n) => n - 1).filter((ch) => ch >= 0 && ch < count))];
}

// Replace the listed channels (a broken sensor) with simulated pulses. A simulated finger is
// only on while every real channel has a finger, so the band still merges when the real players do.
export function simChannels(onFrame, chans, rate = 50) {
  const next = simSource(rate);
  return (raws) => {
    const sim = next();
    const held = raws.every((r, ch) => chans.includes(ch) || r >= FINGER_MIN);
    onFrame(raws.map((r, ch) => (chans.includes(ch) ? (held ? sim[ch] : 0) : r)));
  };
}

// Wrap a frame callback so channels whose sensor is missing (the firmware reports
// those as 0) get simulated pulses. Real channels pass through untouched.
// With route() returning a channel, the first connected sensor's reading moves to
// that channel and every other channel is simulated (debugging with one sensor).
// While a finger is on, the real reading is re-centred on the simulator's DC level:
// only its pulse wave is kept. Switching voices then swaps one pulse for another with
// no level jump, so the beat detector keeps its BPM instead of re-settling from scratch.
export function simFill(onFrame, route = () => null, rate = 50) {
  const next = simSource(rate);
  const dcA = 1 / (rate * 1.5); // same time constant as signal.js's DC tracker
  let dc = null;
  return (raws) => {
    const sim = next();
    const to = route();
    if (to == null) return onFrame(raws.map((r, ch) => (r === 0 ? sim[ch] : r)));
    const src = raws.findIndex((r) => r !== 0);
    const r = src < 0 ? 0 : raws[src];
    let real = r; // no sensor (0) or no finger (low) passes through, so it reads as off
    if (r >= FINGER_MIN) {
      dc = dc === null ? r : dc + (r - dc) * dcA;
      real = Math.round(r - dc + SIM_DC);
    } else dc = null;
    onFrame(sim.map((s, ch) => (ch === to ? real : s)));
  };
}

// Stand-in players: channels with a BPM in bpms() (0 = none) get a simulated pulse at that rate
// in place of their reading; the rest pass through. core.js turns them on and off from clicks.
export function simTapped(onFrame, bpms, rate = 50) {
  const phase = [0, 0, 0, 0];
  return (raws) => {
    const b = bpms();
    onFrame(raws.map((r, ch) => {
      if (!b[ch]) return r;
      phase[ch] += (2 * Math.PI * b[ch]) / 60 / rate;
      return Math.round(SIM_DC - 400 * Math.sin(phase[ch]) + Math.random() * 40);
    }));
  };
}
