# flatline Part A: Sound

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Overview, contract, and branching rules:** [`2026-11-14-flatline.md`](2026-11-14-flatline.md). Read it first.

**Owner:** Teammate A. **Branch:** `sound`, off `main` after the [foundation](2026-11-14-flatline-foundation.md) merges.

**Goal:** turn incoming sensor frames into music that sounds deliberate and good. This is the functional half: Tone.js setup, the trigger logic, and above all **instrument choice and sound design** for the four voices.

**Follow-up direction (2026-11-14):** replace the three instrument-only kits with
French house (Daft Punk inspired), UK garage, ambient, and Russian hardbass.
The owner selected smooth sensor-driven sound changes together with evolving
musical phrases; kit selection is the only creative control. The experience
should feel like the body signals are composing an evolving piece, without
requiring deliberate gestures. The proposed
[genre and evolution design](../specs/2026-11-14-genre-evolution-design.md)
records the scope and behavior. The self-contained
[implementation plan](2026-11-14-genre-evolution.md) directs another LLM to use
subagent-driven development on a new branch. The original tasks below describe
the earlier sound work.

**Files you own:** `web/audio/**` (`audio.js`, `kits.js`, `mapping.js`, `samples/`). You may append your own section to `web/test.mjs`. Anything else in `web/` is either shared (contract branch only) or the visuals teammate's.

**Contract you work against** (full table in the overview):
- You consume: `frame`, `status`, `connect`, `simulate`, `mode`, `kit`.
- You produce: `kits` (sticky), `analyser` (sticky), `note`.
- `note` must keep firing through `Tone.getDraw()` so the visuals stay in sync with what is heard. You may add fields to `note` (for example `pan`, `duration`, `kit`); the visuals side ignores what it doesn't know.

**Running with the other half stubbed:** the stub UI from the foundation is already on your branch. `cd web && python3 -m http.server 8000`, open Chrome, use **Simulate**, the mode select and the kit select. You never need the visuals branch to do this work.

**How to work:** these tasks are by ear. For every choice, build at least two candidates, switch between them with the kit select, and keep the one you prefer. Write what you tried and why you kept the winner in the commit message, so the decisions survive.

**Tone.js reference:** https://tonejs.github.io/ (docs for 15.x, plus runnable examples). Useful pages: Instruments (`Synth`, `MonoSynth`, `FMSynth`, `AMSynth`, `DuoSynth`, `PluckSynth`, `MembraneSynth`, `MetalSynth`, `NoiseSynth`, `PolySynth`, `Sampler`, `Players`), Effects (`Reverb`, `FeedbackDelay`, `PingPongDelay`, `Chorus`, `Phaser`, `Distortion`, `BitCrusher`, `AutoFilter`, `Compressor`, `Limiter`), and `Transport`.

**Every task ends with:** the sim run sounds right to you, `node web/test.mjs` passes, the DevTools console has no errors, then commit and push.

---

### A1: Tone.js orientation and kit switching

**Files:** `web/audio/audio.js`, `web/audio/kits.js`

The foundation already has a kit `basic`, a `kit` listener that swaps kits, and `kits` emitted at load. This task is about learning how it all fits and making switching solid.

- [ ] **Step 1:** Read `web/bus.js`, `web/audio/audio.js` and `web/audio/kits.js` end to end. Trace one note: `frame` → `fire()` → `mapVoice()` → `kit.bass()` → `master` → speakers, and → `Tone.getDraw()` → `note`.
- [ ] **Step 2:** Add a second kit, `test`, that is `basic` with every oscillator changed (for example sine bass, triangle lead). Confirm it shows in the kit select and switching back and forth during playback works.
- [ ] **Step 3:** Fix anything that misbehaves on a switch: stuck pad notes, a click, effects tails cut off. A common fix is to dispose the old kit after its release time instead of instantly (`setTimeout(() => old.dispose(), 3000)` after `old.silence()`).
- [ ] **Step 4:** Commit: `feat(sound): reliable kit switching`.

---

### A2: Drums

**Files:** `web/audio/kits.js`, `web/audio/mapping.js`, `web/test.mjs`, optionally `web/audio/samples/`

The drum voice gets `{ drum, velocity }`. Today `drum` is one of `kick`, `snare`, `hat`, picked by `fields(...)[0] % 3`.

- [ ] **Step 1: Synthesized vs sampled.** Build both and compare:
  - Synthesized: tune `MembraneSynth` (`pitchDecay`, `octaves`, envelope) for the kick, `NoiseSynth` with a band-pass filter for the snare, `MetalSynth` (`harmonicity`, `resonance`, `modulationIndex`) for hats.
  - Sampled: `new Tone.Players({ kick: url('kick.wav'), ... })` with ``const url = (f) => new URL(`./samples/${f}`, import.meta.url).href``. Use only samples you are allowed to redistribute (CC0 packs). Players throw if a buffer isn't loaded, so guard with `if (players.loaded)`.
- [ ] **Step 2: More pieces.** Try a bigger set, for example `kick, snare, clap, closed hat, open hat, tom, rim`. Change `DRUMS` in `mapping.js` (the field `a` has 3 bits, so up to 8 pieces). Decide whether some pieces should be rarer (list a piece twice to weight it).
- [ ] **Step 3: Velocity feel.** `velocity` is 0.4–1. Decide if it should also change pitch or decay on some pieces (a harder kick = longer decay).
- [ ] **Step 4: Tests.** Update the drums assertion in `web/test.mjs` for your new `DRUMS` list. Run `node web/test.mjs`.
- [ ] **Step 5:** Commit: `feat(sound): drum kit choices`.

---

### A3: Bass

**Files:** `web/audio/kits.js`, maybe `web/audio/mapping.js`

The bass voice gets `{ notes: [midi], velocity, cutoff }`, one note in the lowest octave.

- [ ] **Step 1: Candidates.** `MonoSynth` (sawtooth or square, filter envelope), `FMSynth` (growly or bell-like; try `harmonicity` 0.5–3, `modulationIndex` 2–20), `AMSynth` (softer), and a sub-sine layered under any of them.
- [ ] **Step 2: Shape.** Tune the filter envelope (attack, decay, `octaves`) and decide how `cutoff` maps in. Try `portamento` (glide between notes) of 0.02–0.1 s.
- [ ] **Step 3: Register.** Listen for mud with the pad and kick. If the bass clashes, move its octave in `mapVoice` (and update the bass assertion in `web/test.mjs`) or high-pass the pad (A5).
- [ ] **Step 4:** Commit: `feat(sound): bass voice`.

---

### A4: Lead

**Files:** `web/audio/kits.js`

The lead voice gets one note two octaves up. It is the most exposed sound, so it needs the most character.

- [ ] **Step 1: Candidates.** `Synth` (square/triangle/`fatsawtooth`), `FMSynth`, `DuoSynth` (two detuned voices, wide), `PluckSynth` (short, plucked; ignores velocity, so check the level).
- [ ] **Step 2: Motion.** `Vibrato` depth and rate; `portamento`; a short `FeedbackDelay` or `PingPongDelay` synced to the transport (`'8n.'`, `'4n'`) with feedback 0.2–0.4 and wet 0.2–0.3.
- [ ] **Step 3: Note length.** `'8n'` vs `'16n'` vs longer. Longer notes with delay can turn sparse heartbeats into a melody.
- [ ] **Step 4:** Commit: `feat(sound): lead voice`.

---

### A5: Pad

**Files:** `web/audio/kits.js`, maybe `web/audio/mapping.js`

The pad gets a three-note chord and fires rarely (every 4th beat, or every 16 steps in bits mode). It sets the mood of the whole piece.

- [ ] **Step 1: Candidates.** `PolySynth` of `Synth` (`fatsawtooth`, `fattriangle`, with `spread` and `count`), of `AMSynth`, of `FMSynth`. Long attack and release (1–4 s).
- [ ] **Step 2: Space.** `Chorus` (depth, frequency), `Reverb` (`decay` 2–8 s, `preDelay`), maybe `Phaser`. Put a slow `AutoFilter` or an LFO on the filter so the pad moves between triggers.
- [ ] **Step 3: Voicing.** In `mapVoice` try 7ths or sus chords (`note(a + 6, 1)` for a 4th note), and an open voicing (root an octave down). Update the pad assertion in `web/test.mjs`.
- [ ] **Step 4:** Commit: `feat(sound): pad voice`.

---

### A6: Musical frame (key, scale, tempo, mode)

**Files:** `web/audio/mapping.js`, `web/audio/audio.js`, `web/test.mjs`

- [ ] **Step 1: Scale and key.** Minor pentatonic (`[0,3,5,7,10]`) is safe. Try Dorian (`[0,2,3,5,7,9,10]`), major pentatonic, Phrygian, and a different `ROOT`. Every scale must keep the `note()` tests meaningful: update them.
- [ ] **Step 2: Kit-specific musical settings (optional).** If a kit wants its own scale or root, let kits carry `{ scale, root }` and pass them to `mapVoice`. Only do this if two kits really need different keys.
- [ ] **Step 3: Bits-mode tempo.** Compare the fixed 110 BPM against following the players: `transport.bpm.rampTo(avg, 2)`, where `avg` is the mean `bpm` of finger-on channels from `frame` (clamped to 60–140, kept at the last value when nobody has a finger on).
- [ ] **Step 4: Noise.** Tune `SKIP_BITS` (higher = calmer, lower = glitchier) and the `DIV` table (how often each voice fires per mode).
- [ ] **Step 5: Mode verdict.** Listen to beats vs bits with real fingers if the hardware is ready, else the sim. Write a recommendation in the commit message. The final call is made together in Part I.
- [ ] **Step 6:** Commit: `feat(sound): scale, tempo, and trigger tuning`.

---

### A7: Mix, master, and the finished kits

**Files:** `web/audio/audio.js`, `web/audio/kits.js`

- [ ] **Step 1: Master chain.** In `audio.js` change `master → Destination` to `master → Compressor → Limiter(-1) → Destination`, and feed `wave`/`fft` from the limiter so the visuals see the final mix. Keep `analyser` emitting the same `{ wave, fft }` objects.
- [ ] **Step 2: Levels.** With all four fingers on (sim), balance the voices. Nothing should clip: watch for distortion, or temporarily log `Math.max(...wave.getValue())` and keep it under 1.
- [ ] **Step 3: Finish at least three named kits** with distinct characters (for example a dry 808 kit, a lo-fi kit with `BitCrusher` and a soft pad, and an ambient kit with long reverb and plucks). Remove `test`. Order `KITS` so the best one is first: it is the default.
- [ ] **Step 4: Stress check.** Switch kits and modes rapidly for a minute in the sim. No stuck notes, no console errors, no growing CPU (check the Performance monitor in DevTools).
- [ ] **Step 5:** Commit and push: `feat(sound): master chain and final kits`. Then tell Teammate B the kit names and any new `note` fields, and move to Part I in the overview plan.
