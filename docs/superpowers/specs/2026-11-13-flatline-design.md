# flatline: biometric-to-music device

## Context
Four MAX30102 heart-rate sensors feed a Raspberry Pi Zero 2 W. The data goes to a laptop over USB serial. In the browser, Tone.js turns each sensor's signal into one voice of an electronic band: drums, bass, lead and pad. The sensors may be worn by four people or by one person (either must work). Whether beats trigger notes or raw bits alone drive the music is undecided, so the design keeps that choice swappable.

Decisions made in brainstorming:
- Signal: undecided, so the Pi streams RAW samples only. Beat detection and bit mapping live in the browser.
- Link: USB serial. The Pi runs as a USB gadget (`g_serial`), so the laptop sees an ordinary serial port.
- Synth: Tone.js in the browser, reading serial directly with the Web Serial API (Chrome/Edge). No Node bridge.
- Voices: ch0 drums, ch1 bass, ch2 lead, ch3 pad.
- Not used: Wi-Fi (USB is simpler and keeps Web Serial).
- Changed 2026-11-14: the original Arduino Uno + TCA9548A mux design was dropped because we have no mux. The old sketch stays in `firmware/flatline/` for reference.

## Hardware
- The MAX30102's I2C address is fixed (0x57), so each sensor gets its own bus instead of a mux: sensor 0 on hardware `i2c-1` (GPIO2/3), sensors 1-3 on bit-banged `i2c-gpio` buses `i2c-3`/`-4`/`-5` (GPIO17/27, 22/23, 24/25). Pin table in the README.
- Sensors run from the Pi's 3.3V pin; the Pi's logic is 3.3V too, so there are no level issues. Breakout pull-ups do the real work. Weak internal pull-ups on the bit-banged pins (`gpio=17,22-25,27=pu`) keep an empty bus from hanging on clock-stretch timeouts.
- One micro-USB cable (the Pi's USB port, not PWR IN) powers the Pi and carries the data. It takes about 30 s to boot.

## Sensor reader: `pi/flatline.py`
- Python with `smbus2`, talking to the MAX30102 registers directly (the SparkFun library is Arduino-only). Same settings as the old sketch: LED 0x1F, 4-sample average, red+IR, 200 sps -> 50 Hz.
- One thread per sensor drains its FIFO and keeps the newest IR sample, so a dead bus can't stall output. A lost sensor reads 0 and is retried every 2 s.
- The main loop writes one CSV line every 20 ms: `ir0,ir1,ir2,ir3\n` to `/dev/ttyGS0`, dropping lines while no host is reading.
- No processing on the device. Runs at boot as `flatline.service`; `pi/setup.sh` does the one-time Pi config.

## Browser app: `web/` (no build step, Tone.js from a CDN, served with `python3 -m http.server`)
- `serial.js`: Web Serial connect + line parser -> emits `{ch: [4 raw ints]}` per tick. Also exposes a **simulator source** with the same interface (four fake pulses at different BPMs plus noise), so the app can be developed with no hardware.
- `signal.js`: per channel, DC removal and band-pass filter (~0.7-3.5 Hz), finger-present check (raw IR below a threshold means voice muted), and beat detection (rising-edge threshold with refractory period). Emits `beat(ch, bpm)`.
- `mapping.js`: the swappable core. It chops the raw 18-bit value into bit fields (for example 3+3+4+4 bits) and maps each field to a voice parameter: note index in a fixed scale, filter cutoff, velocity, effect send. Two modes behind one interface: `beats` (beats trigger, bits shape) and `bits` (internal clock steps, bits decide). Notes are quantized to one global key and scale so it always sounds musical.
- `voices.js`: Tone.js instruments. Drums use MembraneSynth plus NoiseSynth for kick, snare and hat. Bass uses MonoSynth. Lead uses Synth with vibrato. Pad uses PolySynth with a slow filter. Each has `trigger(params)`.
- `index.html` and `main.js`: Connect and Simulate buttons, mode toggle, and four small live meters (signal, BPM, finger-on).

## Team split
Two teammates build the browser app in parallel after a shared foundation (sensor reader, `serial.js`, `signal.js`, and a working stub of everything).
- `bus.js`: the contract. A native `EventTarget` with `emit`/`on` and a fixed event table (`frame`, `status`, `connect`, `simulate`, `mode`, `kit`, `kits`, `analyser`, `note`). Audio and UI never import each other.
- `core.js` (shared): sources → `signal.js` → `frame` events; handles `connect`/`simulate`; emits `status`.
- `audio/` (sound teammate): `mapping.js`, `kits.js` (the voices above, as switchable kits), `audio.js` (mode gate, master chain, analysers; emits `note`).
- `ui/` and `index.html` (visuals teammate): controls, states, aesthetic, and visuals driven by `frame`, `note` and `analyser`.
- Plans: `docs/superpowers/plans/2026-11-14-flatline.md` (overview, contract, branching) plus the foundation, sound and visuals plans.

## Error handling
- Serial disconnect: show status, voices go silent.
- Finger off: that voice mutes and the others continue.
- Bad or partial CSV line: drop it.

## Testing
- `web/test.mjs` (plain Node `assert`, no framework): beat detector finds the expected BPM on a synthetic pulse, and the bit-chunker returns the expected fields for known inputs.
- Hardware check: `python3 /opt/flatline/flatline.py -` on the Pi (service stopped) shows 4 changing IR values, and each drops to ~0 when its finger is removed.
- End-to-end: the simulator plays all four voices without hardware. Then use real sensors with the serial source.

## Verification
1. Run `pi/setup.sh` on the Pi, reboot, and check `i2cdetect -y 1/3/4/5` each shows `57`; watch the CSV with the reader in `-` mode (4 live channels).
2. `cd web && python3 -m http.server`, open in Chrome, press Simulate and confirm all four voices play.
3. Press Connect, select the Pi's port (`usbmodem…` on a Mac), put fingers on and confirm the meters and beats respond.
4. `node web/test.mjs` passes.

## Open items (deferred on purpose)
- Beats vs raw-bit triggering: try both with the mode toggle and keep what sounds better.
- Scale, key and tempo feel: tuned by ear after the first sound.
