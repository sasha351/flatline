# flatline Part 0: Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Overview, contract, and branching rules:** [`2026-11-14-flatline.md`](2026-11-14-flatline.md). Read it first.

> **Hardware changed (2026-11-14):** the Arduino + TCA9548A mux described here was replaced by a Raspberry Pi Zero 2 W reading each sensor on its own I2C bus (`pi/`). The CSV format is unchanged. See the README and the [design spec](../specs/2026-11-13-flatline-design.md). This plan is kept as written.

**Who:** one person, or both teammates pairing. **Branch:** `foundation` (off `main`), merged to `main` before anyone starts the sound or visuals tracks.

**Goal:** a walking skeleton. Hardware streams CSV, the browser turns it into `frame` events on the bus, a stub audio module plays crude sound, and a stub UI shows buttons and meters. When this is merged, each teammate replaces their own stub while the other half keeps working.

```bash
git switch main && git pull
git switch -c foundation
```

**Done when:** `node web/test.mjs` prints `serial ok`, `signal ok`, `mapping ok`, `contract ok`; the simulator plays all four voices in Chrome; the PR `foundation` → `main` is merged.

---

### F1: Firmware + wiring docs

**Files:**
- Create: `firmware/flatline/flatline.ino`
- Modify: `README.md` (replace contents)

**Interfaces:**
- Produces: serial CSV stream `ir0,ir1,ir2,ir3\r\n` at 50 Hz, 115200 baud (consumed by F2's `parseLine`).

Hardware can't be unit tested here. Verification is compiling the sketch plus a serial monitor check.

- [ ] **Step 1: Install the toolchain and library**

```bash
brew install arduino-cli
arduino-cli core update-index
arduino-cli core install arduino:avr
arduino-cli lib install "SparkFun MAX3010x Pulse and Proximity Sensor Library"
```

Expected: each command ends without an error.

- [ ] **Step 2: Write the sketch**

`firmware/flatline/flatline.ino`:

```cpp
// flatline: read 4x MAX30102 through a TCA9548A mux, stream raw IR as CSV.
// Line format: ir0,ir1,ir2,ir3  at 50 Hz, 115200 baud. Missing sensor = 0.
#include <Wire.h>
#include "MAX30105.h"  // SparkFun MAX3010x library; also drives the MAX30102

const uint8_t MUX_ADDR = 0x70;  // TCA9548A with A0-A2 tied to GND
const uint8_t N = 4;

MAX30105 sensors[N];
bool ok[N];
uint32_t lastIr[N];

void selectChannel(uint8_t ch) {
  Wire.beginTransmission(MUX_ADDR);
  Wire.write(1 << ch);
  Wire.endTransmission();
}

void setup() {
  Serial.begin(115200);
  while (!Serial) {}  // Leonardo: wait for USB host. No-op on Uno.
  Wire.begin();
  for (uint8_t i = 0; i < N; i++) {
    selectChannel(i);
    ok[i] = sensors[i].begin(Wire, I2C_SPEED_FAST);
    // ponytail: LED power 0x1F is the calibration knob; raise it if signal is weak, lower it if raw IR saturates near 262143
    // powerLevel, sampleAverage, ledMode(2=red+IR), sampleRate, pulseWidth, adcRange
    if (ok[i]) sensors[i].setup(0x1F, 4, 2, 200, 411, 4096);  // 200 sps / 4 avg = 50 Hz
  }
}

void loop() {
  static uint32_t next = 0;
  uint32_t now = millis();
  if ((int32_t)(now - next) < 0) return;
  next = now + 20;  // 50 Hz

  for (uint8_t i = 0; i < N; i++) {
    if (ok[i]) {
      selectChannel(i);
      sensors[i].check();  // non-blocking FIFO read
      while (sensors[i].available()) {
        lastIr[i] = sensors[i].getFIFOIR();
        sensors[i].nextSample();
      }
    }
    if (i) Serial.print(',');
    Serial.print(ok[i] ? lastIr[i] : 0);
  }
  Serial.println();
}
```

- [ ] **Step 3: Compile for both boards**

```bash
arduino-cli compile -b arduino:avr:uno firmware/flatline
arduino-cli compile -b arduino:avr:leonardo firmware/flatline
```

Expected: both print `Sketch uses ... bytes` and no errors.

- [ ] **Step 4: Write README with wiring**

`README.md`:

````markdown
# flatline

Four heart-rate sensors → four-voice electronic band in the browser.
ch0 drums · ch1 bass · ch2 lead · ch3 pad.

## Parts
- Arduino Uno (or Leonardo)
- TCA9548A I2C multiplexer (required: every MAX30102 has the same address, 0x57)
- 4x MAX30102 breakout

## Wiring
| From | To |
|---|---|
| Arduino 3.3V | TCA9548A VIN, each MAX30102 VIN |
| Arduino GND | TCA9548A GND, each MAX30102 GND, TCA A0/A1/A2 |
| Uno A4 (SDA) / Leonardo D2 | TCA9548A SDA |
| Uno A5 (SCL) / Leonardo D3 | TCA9548A SCL |
| TCA SD0/SC0 … SD3/SC3 | Sensor 0 … 3 SDA/SCL |

Keep all I2C pull-ups at 3.3V. If a sensor reads `0`, check its address, its wiring, and its pull-up voltage. Some cheap purple MAX30102 boards pull SDA/SCL up to 1.8V, and those need the pull-up jumper or trace moved to 3.3V.

## Firmware
```bash
arduino-cli lib install "SparkFun MAX3010x Pulse and Proximity Sensor Library"
arduino-cli board list                      # find the port
arduino-cli upload -b arduino:avr:uno -p <port> firmware/flatline
```
Check: `arduino-cli monitor -p <port> -c baudrate=115200` shows `ir0,ir1,ir2,ir3` lines; a value jumps above ~50000 with a finger on.

## Run
```bash
cd web && python3 -m http.server 8000
```
Open http://localhost:8000 in Chrome or Edge. Use **Simulate** (no hardware) or **Connect sensors**.

## Test
```bash
node web/test.mjs
```
````

- [ ] **Step 5: Hardware check (when the parts are wired)**

```bash
arduino-cli board list
arduino-cli upload -b arduino:avr:uno -p /dev/cu.usbmodemXXXX firmware/flatline   # use the port from board list
arduino-cli monitor -p /dev/cu.usbmodemXXXX -c baudrate=115200
```

Expected: 50 lines per second of `n,n,n,n`. A covered sensor reads more than 50000 and moves slightly with the pulse. An uncovered sensor reads low. An unplugged sensor reads `0`. If the parts aren't wired yet, record this step as skipped.

- [ ] **Step 6: Commit**

```bash
git add firmware/flatline/flatline.ino README.md docs/superpowers
git commit -m "feat: firmware streaming 4 MAX30102 channels as CSV"
```

---

### F2: Serial source, line parser, simulator

**Files:**
- Create: `web/package.json`, `web/serial.js`, `web/test.mjs`

**Interfaces:**
- Consumes: CSV line format from F1.
- Produces:
  - `parseLine(line: string): number[4] | null`
  - `connectSerial(onFrame: (raws: number[4]) => void, onClose: () => void): Promise<() => Promise<void>>`. Opens a port picker. Resolves to an async `stop` function.
  - `startSim(onFrame: (raws: number[4]) => void): () => void`. 50 Hz fake pulses at 72/64/88/58 BPM. Returns `stop`.

- [ ] **Step 1: Write the failing test**

`web/package.json`:

```json
{ "type": "module" }
```

`web/test.mjs`:

```js
import assert from 'node:assert/strict';
import { parseLine } from './serial.js';

assert.deepEqual(parseLine('1,2,3,4'), [1, 2, 3, 4]);
assert.deepEqual(parseLine('100000,0,262143,5\r'), [100000, 0, 262143, 5]);
assert.equal(parseLine('1,2,3'), null);       // too few
assert.equal(parseLine('1,2,,4'), null);      // empty field
assert.equal(parseLine('3,4\n1,2'), null);    // partial / garbage
assert.equal(parseLine(''), null);
console.log('serial ok');
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node web/test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `serial.js`.

- [ ] **Step 3: Implement**

`web/serial.js`:

```js
// Frame sources. Each calls onFrame([ir0, ir1, ir2, ir3]) ~50x/s.

export function parseLine(line) {
  const t = line.trim();
  return /^\d+,\d+,\d+,\d+$/.test(t) ? t.split(',').map(Number) : null;
}

export async function connectSerial(onFrame, onClose) {
  const port = await navigator.serial.requestPort();
  await port.open({ baudRate: 115200 });
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
          if (f) onFrame(f); // bad lines are dropped
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

export function startSim(onFrame) {
  const bpms = [72, 64, 88, 58];
  let i = 0;
  const id = setInterval(() => {
    const t = i++ / 50;
    // IR dips on each pulse, sitting on a ~100k DC level, plus sensor noise
    onFrame(bpms.map((b) =>
      Math.round(100000 - 400 * Math.sin((2 * Math.PI * b * t) / 60) + Math.random() * 40)));
  }, 20);
  return () => clearInterval(id);
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `node web/test.mjs`
Expected: `serial ok`

- [ ] **Step 5: Commit**

```bash
git add web/package.json web/serial.js web/test.mjs
git commit -m "feat: serial CSV source, parser, and simulator"
```

---

### F3: Signal processing (finger check, beat, BPM)

**Files:**
- Create: `web/signal.js`
- Modify: `web/test.mjs` (append)

**Interfaces:**
- Produces:
  - `FINGER_MIN: number` (50000)
  - `createChannel(rate = 50): (raw: number) => { finger: boolean, ac: number, beat: boolean, bpm: number }`. Call it once per sample. `beat` is true on the one sample where a pulse is detected. `bpm` is smoothed and is 0 until two beats have been seen.

- [ ] **Step 1: Write the failing test**

Append to `web/test.mjs`:

```js
import { createChannel } from './signal.js';

{
  // 72 BPM synthetic pulse with deterministic noise, 20 s at 50 Hz
  let seed = 1;
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 100;
  const ch = createChannel(50);
  let beats = 0, s;
  for (let i = 0; i < 50 * 20; i++) {
    s = ch(Math.round(100000 - 400 * Math.sin((2 * Math.PI * 1.2 * i) / 50) + noise()));
    if (i >= 50 * 10 && s.beat) beats++;
  }
  assert.ok(s.finger);
  assert.ok(Math.abs(s.bpm - 72) < 3, `bpm ${s.bpm}`);
  assert.ok(beats >= 11 && beats <= 13, `beats in last 10 s: ${beats}`); // expect 12
}
{
  // no finger: never beats, bpm stays 0
  const ch = createChannel(50);
  for (let i = 0; i < 200; i++) {
    const s = ch(1000);
    assert.ok(!s.finger && !s.beat && s.bpm === 0);
  }
}
console.log('signal ok');
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node web/test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `signal.js`.

- [ ] **Step 3: Implement**

`web/signal.js`:

```js
// Per-channel pulse processing. One step() call per sample.

// ponytail: fixed threshold; tune per sensor/LED power. Raw IR below this = no finger.
export const FINGER_MIN = 50000;

export function createChannel(rate = 50) {
  const dcA = 1 / (rate * 1.5);               // DC tracker, ~1.5 s
  const lpA = 0.4;                             // light smoothing against sensor fuzz
  const envDecay = 1 - 1 / (rate * 2);         // envelope forgets over ~2 s
  const refractory = Math.round(rate * 0.3);   // caps at 200 BPM
  let dc = null, lp = 0, prevAc = 0, env = 0, n = 0, lastBeat = -Infinity, bpm = 0;

  return function step(raw) {
    n++;
    if (raw < FINGER_MIN) {
      dc = null; env = 0; bpm = 0; prevAc = 0; lastBeat = -Infinity;
      return { finger: false, ac: 0, beat: false, bpm: 0 };
    }
    if (dc === null) { dc = raw; lp = raw; }
    dc += (raw - dc) * dcA;
    lp += (raw - lp) * lpA;
    const ac = dc - lp;                        // IR dips on each pulse; flip so beats point up
    env = Math.max(Math.abs(ac), env * envDecay);
    const thr = env * 0.5;
    const beat = prevAc < thr && ac >= thr && n - lastBeat > refractory;
    prevAc = ac;
    if (beat) {
      if (lastBeat !== -Infinity) {
        const inst = (60 * rate) / (n - lastBeat);
        bpm = bpm ? bpm * 0.7 + inst * 0.3 : inst;
      }
      lastBeat = n;
    }
    return { finger: true, ac, beat, bpm };
  };
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `node web/test.mjs`
Expected: `serial ok` then `signal ok`

- [ ] **Step 5: Commit**

```bash
git add web/signal.js web/test.mjs
git commit -m "feat: per-channel beat detection and finger check"
```

---

### F4: Bit mapping (raw bits → voice params)

**Files:**
- Create: `web/audio/mapping.js` (owned by the sound teammate after the foundation merges)
- Modify: `web/test.mjs` (append)

**Interfaces:**
- Produces:
  - `SCALE: number[]` (A minor pentatonic offsets), `ROOT: number` (MIDI 45 = A2), `WIDTHS: number[]` ([3,3,4,4]), `SKIP_BITS: number` (2)
  - `fields(value: number, widths: number[]): number[]`. Fields are taken LSB-first.
  - `note(index: number, octave: number): number` (MIDI), quantized to `SCALE`
  - `mapVoice(name: 'drums'|'bass'|'lead'|'pad', raw: number)` returns:
    - drums: `{ drum: 'kick'|'snare'|'hat', velocity }`
    - bass/lead: `{ notes: [midi], velocity, cutoff }`
    - pad: `{ notes: [midi, midi, midi], velocity, cutoff }`
    - `velocity` is 0.4–1, `cutoff` is in Hz (200–2450)

- [ ] **Step 1: Write the failing test**

Append to `web/test.mjs`:

```js
import { fields, note, mapVoice } from './audio/mapping.js';

assert.deepEqual(fields((10 << 10) | (6 << 6) | (5 << 3) | 3, [3, 3, 4, 4]), [3, 5, 6, 10]);
assert.equal(note(0, 0), 45);   // A2
assert.equal(note(5, 0), 57);   // wraps to next octave: A3
assert.equal(note(7, 1), 74);   // index 7 = octave+1, degree 2 (D)
// raw = fields a=1, b=0, c=15, d=0, shifted past the 2 skipped low bits
assert.deepEqual(mapVoice('drums', ((15 << 6) | 1) << 2), { drum: 'snare', velocity: 1 });
assert.deepEqual(mapVoice('pad', 0), { notes: [57, 62, 67], velocity: 0.4, cutoff: 200 });
assert.deepEqual(mapVoice('bass', 0), { notes: [45], velocity: 0.4, cutoff: 200 });
console.log('mapping ok');
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node web/test.mjs`
Expected: `serial ok`, `signal ok`, then FAIL with `ERR_MODULE_NOT_FOUND` for `mapping.js`.

- [ ] **Step 3: Implement**

`web/audio/mapping.js`:

```js
// Chop a raw sample into bit fields; map fields to musical params.

export const SCALE = [0, 3, 5, 7, 10];  // minor pentatonic
export const ROOT = 45;                 // A2
export const WIDTHS = [3, 3, 4, 4];     // a, b, c, d
// ponytail: lowest bits are pure sensor noise; raise to make voices calmer, lower for glitchier
export const SKIP_BITS = 2;
const DRUMS = ['kick', 'snare', 'hat'];

export function fields(value, widths) {
  return widths.map((w) => {
    const f = value & ((1 << w) - 1);
    value >>>= w;
    return f;
  });
}

export function note(index, octave) {
  const n = SCALE.length;
  return ROOT + 12 * (octave + Math.floor(index / n)) + SCALE[index % n];
}

export function mapVoice(name, raw) {
  const [a, b, c, d] = fields(raw >>> SKIP_BITS, WIDTHS);
  const velocity = 0.4 + (c / 15) * 0.6;
  const cutoff = 200 + d * 150;
  switch (name) {
    case 'drums': return { drum: DRUMS[a % DRUMS.length], velocity };
    case 'bass':  return { notes: [note(a, 0)], velocity, cutoff };
    case 'lead':  return { notes: [note(a + b, 2)], velocity, cutoff };
    case 'pad':   return { notes: [note(a, 1), note(a + 2, 1), note(a + 4, 1)], velocity, cutoff };
  }
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `node web/test.mjs`
Expected: `serial ok`, `signal ok`, `mapping ok`

- [ ] **Step 5: Commit**

```bash
git add web/audio/mapping.js web/test.mjs
git commit -m "feat: bit-field mapping from raw samples to voice params"
```

---

### F5: Event bus contract + core

**Files:**
- Create: `web/bus.js`, `web/core.js`
- Modify: `web/test.mjs` (append)

**Interfaces:**
- Consumes: `connectSerial`, `startSim` (F2); `createChannel` (F3).
- Produces:
  - `bus.js`: `VOICES`, `emit(type, detail)`, `on(type, fn)`. The full event table is in the overview plan and in the header comment below. Sticky events (`status`, `kits`, `analyser`) replay their last value to anyone who subscribes later, so module load order never matters.
  - `core.js`: `start(source): Promise<void>`. At load it subscribes to `connect` / `simulate` and emits `status: 'idle'`. Every sample it emits `frame`.

- [ ] **Step 1: Write the failing test**

Append to `web/test.mjs`:

```js
import { on } from './bus.js';
import { start } from './core.js';

{
  let got = null;
  const status = [];
  on('frame', (d) => (got = d));
  on('status', (s) => status.push(s)); // sticky: replays 'idle' right away
  await start((onFrame) => { onFrame([100000, 0, 0, 0]); return async () => {}; });
  assert.deepEqual(got.raws, [100000, 0, 0, 0]);
  assert.equal(got.ch.length, 4);
  assert.ok(got.ch[0].finger && !got.ch[1].finger);
  assert.deepEqual(Object.keys(got.ch[0]).sort(), ['ac', 'beat', 'bpm', 'finger']);
  assert.deepEqual(status, ['idle', 'running']);
}
console.log('contract ok');
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node web/test.mjs`
Expected: `serial ok`, `signal ok`, `mapping ok`, then FAIL with `ERR_MODULE_NOT_FOUND` for `bus.js`.

- [ ] **Step 3: Implement**

`web/bus.js`:

```js
// flatline shared contract. web/audio and web/ui never import each other;
// they only talk through these events. Change this table only through a
// contract/* branch (see docs/superpowers/plans/2026-11-14-flatline.md).
//
// event      from   detail
// frame      core   { raws: number[4], ch: {finger, ac, beat, bpm}[4] }   ~50 Hz
// status*    core   'idle' | 'running' | 'disconnected' | 'error: <message>'
// connect    ui     none. Emit inside the click handler (needs a user gesture).
// simulate   ui     none. Same rule.
// mode       ui     'beats' | 'bits'
// kit        ui     one of the names from 'kits'
// kits*      audio  string[]
// analyser*  audio  { wave, fft }, each with .getValue(): Float32Array
// note       audio  { voice, ...mapVoice params }, fired when the sound is heard
//
// * sticky: a late subscriber gets the last value immediately.
// Listeners ignore fields and values they don't know, so either side can add some.

export const VOICES = ['drums', 'bass', 'lead', 'pad']; // channel i -> VOICES[i]
const STICKY = new Set(['status', 'kits', 'analyser']);
const bus = new EventTarget();
const last = {};

export function emit(type, detail) {
  if (STICKY.has(type)) last[type] = detail;
  bus.dispatchEvent(new CustomEvent(type, { detail }));
}

export function on(type, fn) {
  if (type in last) fn(last[type]);
  bus.addEventListener(type, (e) => fn(e.detail));
}
```

`web/core.js`:

```js
// Sources -> per-channel signal -> 'frame' events. Owns connect/simulate and status.
import { emit, on, VOICES } from './bus.js';
import { connectSerial, startSim } from './serial.js';
import { createChannel } from './signal.js';

let stop = null;
let run = null;      // identifies the active source, so a stale onClose is ignored
let channels = [];

function onFrame(raws) {
  emit('frame', { raws, ch: raws.map((raw, i) => channels[i](raw)) });
}

export async function start(source) {
  const me = (run = {});
  await stop?.();
  stop = null;
  channels = VOICES.map(() => createChannel(50));
  stop = await source(onFrame, () => run === me && emit('status', 'disconnected'));
  emit('status', 'running');
}

const go = (source) => () => start(source).catch((e) => emit('status', `error: ${e.message}`));
on('connect', go(connectSerial));
on('simulate', go(startSim));
emit('status', 'idle');
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `node web/test.mjs`
Expected: `serial ok`, `signal ok`, `mapping ok`, `contract ok`

- [ ] **Step 5: Commit**

```bash
git add web/bus.js web/core.js web/test.mjs
git commit -m "feat: event bus contract and core frame source"
```

---

### F6: Stub audio, stub UI, entry point (walking skeleton)

**Files:**
- Create: `web/audio/kits.js`, `web/audio/audio.js`, `web/ui/ui.js`, `web/index.html`, `web/main.js`

**Interfaces:**
- Consumes: the bus (F5), `mapVoice` (F4).
- Produces: every event in the contract table, so each teammate can build against real data from day one.
  - `kits.js`: `KITS: { [name]: (out: Tone.ToneAudioNode) => Kit }`. A `Kit` is `{ drums, bass, lead, pad, silence(), dispose() }`, and each voice is `(params, time) => void`. A kit connects only to `out`, so the master chain and the analysers hear every kit.
  - `audio.js`: no exports. Listens to `frame`, `status`, `connect`, `simulate`, `mode`, `kit`. Emits `kits`, `analyser`, `note`.
  - `ui.js`: no exports. Emits `connect`, `simulate`, `mode`, `kit`. Listens to `status`, `kits`, `frame`, `note`.

These are deliberately plain. They are the original single-person voices and page, rewired through the bus. The sound teammate replaces `web/audio/` and the visuals teammate replaces `web/ui/` and `index.html`.

Mode rules (in `audio.js`):
- `beats`: a detected beat on channel i triggers voice i. The pad fires only on every 4th beat.
- `bits`: a fixed 110 BPM 16th-note clock. Each finger-on voice fires every `DIV.bits[name]` steps (drums 1, bass 2, lead 2, pad 16).
- A finger-off channel never triggers. Any status other than `running` releases the pad and stops `bits` triggering.

Audio isn't unit tested. Verification is manual in the browser.

- [ ] **Step 1: Write `web/audio/kits.js`**

```js
// Sound kits. A kit builder makes its instruments, connected only to `out`.
import * as Tone from 'https://cdn.jsdelivr.net/npm/tone@15.0.4/+esm';

const midi = (m) => Tone.Frequency(m, 'midi').toNote();

function basic(out) {
  const verb = new Tone.Reverb(3).connect(out);
  const kick = new Tone.MembraneSynth().connect(out);
  const snare = new Tone.NoiseSynth({ envelope: { attack: 0.001, decay: 0.15, sustain: 0 } }).connect(out);
  const hat = new Tone.MetalSynth({ envelope: { decay: 0.05 }, volume: -18 }).connect(out);
  const bass = new Tone.MonoSynth({ oscillator: { type: 'sawtooth' }, volume: -6 }).connect(out);
  const vibrato = new Tone.Vibrato(5, 0.1).connect(verb);
  const lead = new Tone.Synth({ oscillator: { type: 'square' }, volume: -14 }).connect(vibrato);
  const padFilter = new Tone.Filter(800, 'lowpass').connect(verb);
  const pad = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'fatsawtooth' },
    envelope: { attack: 1, release: 2 },
    volume: -20,
  }).connect(padFilter);
  const nodes = [verb, kick, snare, hat, bass, vibrato, lead, padFilter, pad];

  return {
    drums(p, t) {
      if (p.drum === 'kick') kick.triggerAttackRelease('C1', '8n', t, p.velocity);
      else if (p.drum === 'snare') snare.triggerAttackRelease('16n', t, p.velocity);
      else hat.triggerAttackRelease(200, '32n', t, p.velocity);
    },
    bass(p, t) {
      bass.filterEnvelope.baseFrequency = p.cutoff;
      bass.triggerAttackRelease(midi(p.notes[0]), '8n', t, p.velocity);
    },
    lead(p, t) {
      lead.triggerAttackRelease(midi(p.notes[0]), '8n', t, p.velocity);
    },
    pad(p, t) {
      padFilter.frequency.rampTo(p.cutoff * 2, 1);
      pad.triggerAttackRelease(p.notes.map(midi), '1n', t, p.velocity);
    },
    silence() { pad.releaseAll(); },
    dispose() { nodes.forEach((n) => n.dispose()); },
  };
}

export const KITS = { basic };
```

- [ ] **Step 2: Write `web/audio/audio.js`**

```js
// Frames -> notes. Owns the trigger mode, the active kit, and the master chain.
import * as Tone from 'https://cdn.jsdelivr.net/npm/tone@15.0.4/+esm';
import { emit, on, VOICES } from '../bus.js';
import { mapVoice } from './mapping.js';
import { KITS } from './kits.js';

// Fire a voice on every Nth event (event = beat in 'beats' mode, 16th step in 'bits' mode).
const DIV = {
  beats: { drums: 1, bass: 1, lead: 1, pad: 4 },
  bits: { drums: 1, bass: 2, lead: 2, pad: 16 },
};

const master = new Tone.Gain().toDestination();
const wave = new Tone.Waveform(256);
const fft = new Tone.FFT(64);
master.fan(wave, fft);

let kit = KITS.basic(master);
let mode = 'beats';
let last = [0, 0, 0, 0];
let fingers = [];
let counts = [0, 0, 0, 0];

function fire(i, time = Tone.now()) {
  const voice = VOICES[i];
  if (++counts[i] % DIV[mode][voice]) return;
  const p = mapVoice(voice, last[i]);
  kit[voice](p, time);
  Tone.getDraw().schedule(() => emit('note', { voice, ...p }), time); // fires when audible
}

on('frame', ({ raws, ch }) => {
  last = raws;
  fingers = ch.map((c) => c.finger);
  if (mode === 'beats') ch.forEach((c, i) => c.beat && fire(i));
});

const transport = Tone.getTransport();
transport.bpm.value = 110; // ponytail: fixed tempo for bits mode; tune by ear
transport.scheduleRepeat((time) => {
  if (mode === 'bits') fingers.forEach((f, i) => f && fire(i, time));
}, '16n');

const begin = () => Tone.start(); // runs inside the click: browsers need a gesture for audio
on('connect', begin);
on('simulate', begin);
on('status', (s) => {
  counts = [0, 0, 0, 0];
  if (s === 'running') return transport.start();
  fingers = [];
  kit.silence();
});
on('mode', (m) => { mode = m; counts = [0, 0, 0, 0]; });
on('kit', (name) => {
  kit.silence();
  kit.dispose();
  kit = KITS[name](master);
});

emit('kits', Object.keys(KITS));
emit('analyser', { wave, fft });
```

- [ ] **Step 3: Write `web/index.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>flatline</title>
  <style>
    body { font: 16px system-ui, sans-serif; margin: 2rem; background: #111; color: #eee; }
    button, select { font: inherit; padding: .4rem .8rem; }
    #meters { display: flex; flex-wrap: wrap; gap: .5rem; margin-top: 1rem; }
    .ch { width: 9rem; padding: 1rem; border: 1px solid #444; border-radius: 8px; transition: background .1s; }
    .ch.beat { background: #c33; }
    .ch.off { opacity: .4; }
  </style>
</head>
<body>
  <h1>flatline</h1>
  <button id="connect">Connect sensors</button>
  <button id="sim">Simulate</button>
  <label>Mode
    <select id="mode">
      <option value="beats">beats trigger</option>
      <option value="bits">bits only</option>
    </select>
  </label>
  <label>Kit <select id="kit"></select></label>
  <p id="status"></p>
  <div id="meters"></div>
  <script type="module" src="main.js"></script>
</body>
</html>
```

- [ ] **Step 4: Write `web/ui/ui.js` and `web/main.js`**

`web/ui/ui.js`:

```js
// Stub UI: controls, status, four text meters. The visuals teammate replaces all of this.
import { emit, on, VOICES } from '../bus.js';

const $ = (id) => document.getElementById(id);
$('connect').onclick = () => emit('connect');
$('sim').onclick = () => emit('simulate');
$('mode').onchange = (e) => emit('mode', e.target.value);
$('kit').onchange = (e) => emit('kit', e.target.value);

on('status', (s) => ($('status').textContent = s));
on('kits', (names) => $('kit').replaceChildren(...names.map((n) => new Option(n))));

const meters = VOICES.map(() =>
  $('meters').appendChild(Object.assign(document.createElement('div'), { className: 'ch off' })));

on('frame', ({ ch }) => ch.forEach((s, i) => {
  meters[i].textContent = `${VOICES[i]}: ${s.finger ? `${Math.round(s.bpm)} bpm` : 'no finger'}`;
  meters[i].classList.toggle('off', !s.finger);
}));

on('note', ({ voice }) => {
  const m = meters[VOICES.indexOf(voice)];
  m.classList.add('beat');
  setTimeout(() => m.classList.remove('beat'), 100);
});
```

`web/main.js`:

```js
// Entry point. Import order doesn't matter: sticky events replay to late subscribers.
import './core.js';
import './audio/audio.js';
import './ui/ui.js';
```

- [ ] **Step 5: Confirm the unit tests still pass**

Run: `node web/test.mjs`
Expected: `serial ok`, `signal ok`, `mapping ok`, `contract ok`

- [ ] **Step 6: Manual check with the simulator**

```bash
cd web && python3 -m http.server 8000
```

Open http://localhost:8000 in Chrome. The status reads `idle` and the kit select shows `basic`. Click **Simulate**.
Expected:
- The status reads `running`.
- All four meters light up and flash each time their voice plays.
- After a few seconds the BPMs settle near drums 72, bass 64, lead 88, pad 58.
- Drums, bass and lead are audible right away. The pad joins about every 4 seconds.
- With the mode set to **bits only**, playback switches to a steady 110 BPM grid.
- In DevTools, `(await import('./bus.js')).on('analyser', a => console.log(a.fft.getValue()))` prints a Float32Array.
- The DevTools console shows no errors.

- [ ] **Step 7: Manual check with hardware (when wired)**

Click **Connect sensors** and pick the Arduino port.
Expected:
- The status reads `running`.
- Putting a finger on sensor N un-dims meter N, and voice N plays with your pulse.
- Lifting the finger dims meter N and silences voice N.
- Unplugging the USB cable shows `disconnected` and releases the pad.

If the parts aren't wired yet, record this step as skipped.

- [ ] **Step 8: Commit, push, merge**

```bash
git add web/audio/kits.js web/audio/audio.js web/ui/ui.js web/index.html web/main.js
git commit -m "feat: walking skeleton with stub audio and stub UI on the bus"
git push -u origin foundation
gh pr create --base main --head foundation --title "Foundation: firmware, signal, bus contract, stubs"
```

Both teammates read the PR (especially `web/bus.js`) before it merges. After the merge, start the [sound](2026-11-14-flatline-sound.md) and [visuals](2026-11-14-flatline-visuals.md) tracks.
