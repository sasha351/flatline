# Genre Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make French house, UK garage and Russian hardbass sound like three different genres, through per-genre harmony, rhythm grids and synth voices.

**Architecture:**
- `patterns.js` stays pure data. Each genre gains `key: { root, scale, chords }`, and drum grids carry weights (`x` = 1, `g` = 0.5).
- `evolution.js` tracks the current chord per bar:
  - bass cells become chord-relative;
  - pad cells without degrees play the chord;
  - lead notes on strong steps snap to chord tones.
- `kits.js` gains new presets and voice-type branches inside the existing `drums`, `bass`, `lead` and `pad` factories.

**Tech Stack:** Plain ES modules, Tone.js 15 (CDN), node:test + node:assert/strict. Run tests with `node web/audio-test.mjs`.

**Spec:** `docs/superpowers/specs/2026-11-14-genre-identity-design.md`. Read it first; its tables hold the exact grids and values.

## Global Constraints
- Branch: `genre-identity`. Commit after each task and end messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Ambient must not change. Its events must be byte-identical to before. Task 1 adds a snapshot test for this.
- No new dependencies. No `Math.random` in music code.
- The bus and UI contract (`web/bus.js` events, `note` event shape) is untouched.
- Every test suite must pass at the end of every task: `node web/audio-test.mjs && node web/test.mjs && node web/stage-test.mjs && node web/fluid-test.mjs`.
- Voice ranges stay `LIMITS` in `evolution.js` (bass 33–64, lead 57–93, pad 45–88).

---

### Task 1: Harmony core (keys, chord-aware evolution, drum weights)

**Files:**
- Modify: `web/audio/mapping.js` (`note`)
- Modify: `web/audio/patterns.js` (add `key` to each genre; `drum()` returns weights)
- Modify: `web/audio/evolution.js` (chord tracking, bass/pad/lead, drum weight)
- Modify: `web/audio/melody.js` (scale-length param `n` for the resolve set)
- Test: `web/audio-test.mjs`

**Interfaces:**
- Produces:
  - `note(index, octave, scale = SCALE, root = ROOT)`.
  - `makeMotif(seed, heart, n = 5)`, `develop(motif, phrase, seed, heart, n = 5)`.
  - `GENRES[name].key = { root: number, scale: number[], chords: number[][] | null }`.
  - Drum grid entries are numbers in {0, 0.5, 1}.
  - Pad cells may omit `degrees`, meaning "current chord".
  - `snapToChord(degree, chord, n)` is exported from `evolution.js`. It returns the nearest degree (≥ 0) whose `% n` is in `chord.map(c => c % n)`.

- [ ] **Step 1: Snapshot Ambient before touching anything**

Run this and save the output as `web/ambient-snapshot.json`. It is committed and used by a test.

```bash
cd web && node --input-type=module -e "
import { createEvolution } from './audio/evolution.js';
const h = (press, breath, hr = 80) => ({ on: true, settled: true, hr, press, breath });
const e = createEvolution('Ambient'); const out = [];
const hearts = [h(0.6,0.1), h(0.4,-0.2), h(0.8,0), h(0.5,0.3)];
for (let s = 0; s < 16 * 24; s++) out.push(e.next({ raws: [0x1234,0x5678,0x9abc,0xdef0], hearts, stepSeconds: 0.125 }));
console.log(JSON.stringify(out));" > ambient-snapshot.json
```

- [ ] **Step 2: Write the failing tests** (append to `web/audio-test.mjs`; also import `snapToChord` from `./audio/evolution.js` and `readFileSync` is already imported)

```js
const settledAt = (press, breath, hr = 80) => ({ on: true, settled: true, hr, press, breath });
const fourHearts = () => [settledAt(0.6, 0.1), settledAt(0.4, -0.2), settledAt(0.8, 0), settledAt(0.5, 0.3)];
const runSteps = (name, steps, raws = [0x1234, 0x5678, 0x9abc, 0xdef0]) => {
  const e = createEvolution(name); const out = [];
  for (let s = 0; s < steps; s++) out.push(e.next({ raws, hearts: fourHearts(), stepSeconds: 0.125 }));
  return out;
};
const pc = (midi) => ((midi % 12) + 12) % 12;
const chordPcs = (key, chord) => chord.map((d) => pc(note(d, 0, key.scale, key.root)));

test('Ambient output is unchanged', () => {
  const snap = JSON.parse(readFileSync(new URL('./ambient-snapshot.json', import.meta.url), 'utf8'));
  assert.deepEqual(JSON.parse(JSON.stringify(runSteps('Ambient', 16 * 24))), snap);
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

for (const name of ['French house', 'UK garage', 'Russian hardbass']) {
  test(`${name}: notes in key, bass on chord root, pad plays chord, lead strong beats on chord tones`, () => {
    const { key } = GENRES[name];
    const steps = runSteps(name, 16 * GENRES[name].phraseBars * 2);
    const scalePcs = key.scale.map((s) => pc(key.root + s));
    steps.forEach((events, step) => {
      const chord = key.chords[Math.floor(step / 16) % key.chords.length];
      for (const ev of events) {
        if (ev.voice === 'drums') continue;
        ev.params.notes.forEach((m) => assert.ok(scalePcs.includes(pc(m)), `${name} ${ev.voice} ${m} in scale`));
        if (ev.voice === 'lead' && step % 4 === 0) assert.ok(chordPcs(key, chord).includes(pc(ev.params.notes[0])));
      }
    });
  });
}
```

Pad-chord, bass-root and ghost-hit assertions need Task 2's grids, so they are added in Task 2.

- [ ] **Step 3: Run and verify failure**

Run: `node web/audio-test.mjs`
Expected: FAIL. `snapToChord` is not exported, `note` ignores scale, and `GENRES[...].key` is undefined.

- [ ] **Step 4: Implement**

`mapping.js`:
```js
export function note(index, octave, scale = SCALE, root = ROOT) {
  const n = scale.length;
  return root + 12 * (octave + Math.floor(index / n)) + scale[index % n];
}
```

`patterns.js`:
- Change `const drum = (s) => [...s].map((c) => (c === 'x' ? 1 : c === 'g' ? 0.5 : 0));` and delete `grid`.
- Add keys, using the values from the spec table:
  ```js
  const DORIAN = [0, 2, 3, 5, 7, 9, 10], MINOR = [0, 2, 3, 5, 7, 8, 10], HARMONIC_MINOR = [0, 2, 3, 5, 7, 8, 11];
  // French house
  key: { root: 43, scale: DORIAN, chords: [[0, 2, 4, 6], [3, 5, 7, 9], [0, 2, 4, 6], [6, 8, 10, 12]] },
  // UK garage
  key: { root: 41, scale: MINOR, chords: [[0, 2, 4, 6, 8], [5, 7, 9, 11], [3, 5, 7, 9, 11], [4, 6, 8, 10]] },
  // Russian hardbass
  key: { root: 45, scale: HARMONIC_MINOR, chords: [[0, 2, 4], [5, 7, 9], [3, 5, 7], [4, 6, 8]] },
  // Ambient (import SCALE, ROOT from mapping.js)
  key: { root: ROOT, scale: SCALE, chords: null },
  ```
- Add `const stab = (gate = 1, velocity = 0.6) => ({ gate, velocity });` for chord-less pad cells. It is used in Task 2.

`evolution.js`:
```js
export function snapToChord(degree, chord, n) {
  const tones = chord.map((c) => c % n);
  let best = degree, dist = Infinity;
  for (let m = Math.floor(degree / n) - 1; m <= Math.floor(degree / n) + 1; m++) {
    for (const t of tones) {
      const cand = t + m * n;
      if (cand < 0) continue;
      const d = Math.abs(cand - degree);
      if (d < dist || (d === dist && cand < best)) { best = cand; dist = d; }
    }
  }
  return best;
}
```
- Inside `next()`, compute `const { key } = genre; const chord = key.chords ? key.chords[Math.floor(step / 16) % key.chords.length] : null;`.
- `voiceEvent` gets `key` and `chord` arguments:
  - pad: `const degrees = cell.degrees ?? chord;` then `degrees.map((d) => note(d, cell.octave ?? 0, key.scale, key.root))`.
  - bass: `note((chord ? chord[0] : 0) + cell.degree, cell.octave, key.scale, key.root)`.
  - lead: `note(cell.degree, cell.octave, key.scale, key.root)`.
  - drums: velocity `clamp((0.35 + pressure * 0.45) * weight, 0, 1)`, where `weight` is the grid value passed in. Ambient grids are all 0/1, so Ambient is unchanged.
- In the lead motif branch, after `deg` is chosen (non-null): `if (chord && position % 4 === 0) deg = snapToChord(deg, chord, key.scale.length);`.

`melody.js`: `makeMotif(seed, heart, n = 5)` and `develop(motif, phrase, seed, heart, n = 5)` gain a scale-length parameter; `resolve(m, n)` snaps to the nearest of `[0, 4, n]` (root, 5th, octave root) — identical to today for pentatonic (n = 5), so Ambient is unchanged. `evolution.js` passes `key.scale.length`. Add a melody test: with `n = 7` the last sounding note is in {0, 4, 7}.

Update the existing test `phrase evolution is reproducible...`. Its scale assertion `SCALE.includes(...)` must use the genre's key:
```js
const { key } = GENRES[name];
assert.ok(key.scale.map((s) => pc(key.root + s)).includes(pc(midi)));
```

- [ ] **Step 5: Run all suites**

Run: `node web/audio-test.mjs && node web/test.mjs && node web/stage-test.mjs && node web/fluid-test.mjs`
Expected: all pass. The Ambient snapshot matches.

- [ ] **Step 6: Commit**

```bash
git add web/audio web/audio-test.mjs web/ambient-snapshot.json
git commit -m "feat(audio): per-genre keys and chord-aware bass, pad and lead"
```

---

### Task 2: New rhythm grids and tempos for house, UKG, hardbass

**Files:**
- Modify: `web/audio/patterns.js` (the three genres' `tempo`, `patterns`)
- Test: `web/audio-test.mjs`

**Interfaces:**
- Consumes: `drum()` weights, `note()` cells (bass degrees are chord-relative), and `stab(gate, velocity)` for chord-less pad cells (Task 1).
- Produces: drum piece names used per genre:
  - house: `kick`, `clap`, `hat`, `openhat`
  - UKG: `kick`, `snare`, `clap`, `hat`, `openhat`, `rim`
  - hardbass: `kick`, `clap`, `openhat`

  Task 3 must make each of these sound.

- [ ] **Step 1: Update tests first**
- Tempo test table: French house `112,128,120` → `120,126,123`; UK garage `128,138,132` → `130,136,133`; hardbass is not in that table, so add `['Russian hardbass', 150, 160, 155, 4]`. `songBpm(80, name)` must equal the midpoint, so check `songBpm` in `tempo.js` still maps 50–110 linearly (it does).
- Ghost hits: `assert.ok(GENRES['UK garage'].patterns.drums[0].hat.includes(0.5))`, and run UKG through `createEvolution` with fixed hearts; hat events at ghost steps have lower `params.velocity` than at full steps.
- Add to the genre test from Task 1:
  - pad: `if (ev.voice === 'pad') assert.deepEqual(new Set(ev.params.notes.map(pc)), new Set(chordPcs(key, chord)));`
  - bass: `if (ev.voice === 'bass' && step % 16 === firstBassStep) ...` is fragile. Instead assert that in every bar at least one bass note's pitch class equals `chordPcs(key, chord)[0]`.
- Add a distinctness test: the kick grids of variant 0 differ between UK garage and French house, and hardbass bass variant 0 hits only off-beat 8ths:
```js
test('genre signatures', () => {
  const g = GENRES;
  assert.notDeepEqual(g['UK garage'].patterns.drums[0].kick, g['French house'].patterns.drums[0].kick);
  assert.equal(g['UK garage'].patterns.drums[0].kick[8], 0, 'UKG kick skips beat 3');
  const pumpSteps = g['Russian hardbass'].patterns.bass[0].map((c, i) => (c ? i : -1)).filter((i) => i >= 0);
  assert.deepEqual(pumpSteps, [2, 6, 10, 14]);
  assert.ok(g['French house'].patterns.drums[0].openhat.every((w, i) => (w > 0) === (i % 4 === 2)));
});
```

- [ ] **Step 2: Run, expect failures** (tempo values, signatures)

- [ ] **Step 3: Rewrite the three genres' patterns**
- Use the spec's "Part 2" grids exactly, 3 variants per voice. Keep 16 cells per grid, and give every variant the same drum piece set (missing pieces as `drum('................')`).
- Bass cells use `note(degree, octave, gate, velocity)` with chord-relative degree (0 = chord root, 4 = 5th, 7 = octave in 7-note scales). Use `octave -1` for the low root.
- House octave bass v0: `note(0,-1), null, note(0,0), null` repeated ×4.
- Pad cells use `stab(gate, velocity)` at the spec's steps.
- Lead templates: cells are `note(0, 0, gate, velocity)`. The degree is ignored once the motif plays, but it is the fallback before the lead settles, so give the fallback a sensible contour (degrees 0, 2, 4, 3…).
- Hardbass lead v2: `note(0, 0, 8)` at steps 0 and 8.
- Tempo:
  - house `{ min: 120, max: 126, default: 123 }`, swing 0
  - UKG `{ min: 130, max: 136, default: 133 }`, swing 0.30
  - hardbass `{ min: 150, max: 160, default: 155 }`, swing 0
- Delete the now-unused `HOUSE_KICKS`, `GARAGE_KICKS`, `HARDBASS_KICKS`, `chord`, `empty` constants only if nothing (Ambient!) still uses them. Ambient uses `chord` and `empty`, so keep those.

- [ ] **Step 4: Run all suites, expect pass.** Also re-run the Ambient snapshot test. It must still pass.

- [ ] **Step 5: Commit** `feat(audio): distinct house, UKG and hardbass grids and tempos`

---

### Task 3: Drum kits `disco`, `crisp`, `hard`, the `rim` piece and pump depth

**Files:**
- Modify: `web/audio/kits.js` (`drums()`, `DRUMS`, `makeKit` pump, `KITS`)
- Test: `web/audio-test.mjs` (kit harness tests)

**Interfaces:**
- Consumes: the piece names from Task 2.
- Produces:
  - `DRUMS.disco`, `DRUMS.crisp`, `DRUMS.hard`.
  - Kit spec `pump: true | number`, where a number is the duck gain and `true` means 0.62.

- [ ] **Step 1: Tests first** (in the `kit boundaries...` test, after building each kit)
```js
for (const drum of ['kick', 'snare', 'clap', 'hat', 'openhat', 'rim']) kit.drums({ drum, velocity: 0.7 }, hearts.drums, 6);
```
Plus: `UK garage` now ducks too. Assert a dip below 1 at time 4 for house, UKG and hardbass. The UKG dip must be shallower (a higher min value) than house.

- [ ] **Step 2: Run, expect failure** (UKG has no pump yet; `rim` falls to hat but must exist as its own node, so assert a node whose `options.envelope.decay <= 0.04` exists after building UKG)

- [ ] **Step 3: Implement**
- `rim`: in `drums()`, add `const rim = add(new Tone.MembraneSynth({ pitchDecay: 0.005, octaves: 1, envelope: { attack: 0.001, decay: o.rim?.decay ?? 0.03, sustain: 0, release: 0.01 }, volume: o.rim?.volume ?? -10 })).connect(rimBp)`, where `rimBp` is `new Tone.Filter({ type: 'bandpass', frequency: 1800, Q: 2 })` connected to `bus`. Play it with `case 'rim': rim.triggerAttackRelease(o.rim?.note ?? 'D5', 0.02, t, v); break;`.
- Presets, tuned with the spec values:
  - `disco`: kick `{ note: 'G1', pitchDecay: 0.04, octaves: 4, decay: 0.3, click: -12, drive: 0.15 }`; clap `{ freq: 1300, volume: -2 }`; snare kept quiet (unused); hat `{ kind: 'noise', closed: 0.03, open: 0.25, hp: 8000, volume: -16 }`.
  - `crisp`: kick `{ note: 'F1', pitchDecay: 0.03, octaves: 4, decay: 0.35, click: -10, drive: 0.3 }`; snare `{ body: 'D3', bodyDecay: 0.09, noise: 'white', hp: 2000, lp: 10000, decay: 0.14 }`; clap `{ freq: 1400 }`; hat `{ kind: 'metal', closed: 0.025, open: 0.2, hp: 9000, volume: -18 }`; rim `{ note: 'D5', volume: -12 }`.
  - `hard`: kick `{ note: 'A1', pitchDecay: 0.06, octaves: 6, decay: 0.7, click: -8, drive: 0.9, volume: 0 }`; clap `{ freq: 1000, volume: 0 }`; hat `{ kind: 'noise', closed: 0.03, open: 0.18, hp: 7000, volume: -22 }`; level -3, no verb send (`verb` undefined).
- `makeKit`: `const depth = spec.pump === true ? 0.62 : spec.pump;` and use `depth` in the ramp.
- `KITS`: house uses `DRUMS.disco`; UKG uses `DRUMS.crisp` with `pump: 0.8`; hardbass uses `DRUMS.hard` with `pump: true` and reverb `{ decay: 1, preDelay: 0.01, wet: 0.4 }`.

- [ ] **Step 4: Run all suites, expect pass**

- [ ] **Step 5: Commit** `feat(audio): disco, crisp and hard drum kits with rim and pump depth`

---

### Task 4: Bass and pad voices

**Files:**
- Modify: `web/audio/kits.js` (`bass()`, `BASS`, `pad()`, `PAD`, `KITS`)
- Test: `web/audio-test.mjs`

**Interfaces:**
- Produces: `BASS.pluck`, `BASS.rubber`, `BASS.pump`, `PAD.discoStab`, `PAD.organ`, `PAD.rave`.
- The pad factory accepts `o.osc` set to an object (custom partials) as well as a string.

- [ ] **Step 1: Tests first**
- Update `live kit controls...`. The hardbass bass is no longer FM, so the `FM modulation is smoothed` assertion must use the UKG kit (the `rubber` bass keeps an FM layer whose `modulationIndex` follows heart rate).
- The house pad motion becomes 0.06, so change `node.options.frequency === 0.08` to `0.06`.
- In the kit boundaries test, the bass/lead/pad duration-forwarding assertions must keep passing for all kits.

- [ ] **Step 2: Run, expect failure**

- [ ] **Step 3: Implement**
- `BASS.pluck` (house): `{ type: 'mono', osc: 'square', glide: 0, level: -8, dur: '16n', octaves: 3, filterLo: 250, filterHi: 1200, q: 4 }`. No `sub`.
- `BASS.rubber` (UKG): a new `type: 'rubber'` branch.
  - Main voice: `Tone.Synth({ oscillator: { type: 'sine' }, portamento: o.glide, envelope: { attack: 0.003, decay: 0.2, sustain: 0.3, release: 0.15 } })`.
  - Plus a layer: `Tone.FMSynth({ harmonicity: 1, modulationIndex: 2, modulation: { type: 'square' }, portamento: o.glide, envelope: same, volume: -10 })`.
  - Both go into the existing distortion chain. `setTone` sets the layer's `modulationIndex` via `setTargetAtTime(hrLin(hr, 1, 4), t, 0.1)`.
  - The `play` method must trigger the layer too: generalise `sub?.triggerAttackRelease` to a `layers` array.
  - Preset: `{ type: 'rubber', glide: 0.06, level: -4, dur: '16n', filter: 900 }`.
- `BASS.pump` (hardbass): `{ type: 'mono', osc: 'fatsawtooth', glide: 0, level: -6, dur: '16n', octaves: 4, filterLo: 300, filterHi: 1400, q: 3, grit: 1.2 }`. In the mono branch, pass `{ type: o.osc, count: 3, spread: 25 }` when `o.osc` starts with `fat`. Tone's MonoSynth accepts fat types with count/spread.
- `PAD.discoStab`: `{ osc: 'fatsawtooth', spread: 20, attack: 0.005, release: 0.25, hold: 0.25, phaser: true, chorus: { rate: 0.8, depth: 0.4 }, motion: 0.06, verb: -10, level: -12 }`.
- `PAD.organ`: `{ osc: { type: 'custom', partials: [1, 0.6, 0.3, 0.2, 0.1] }, attack: 0.003, release: 0.12, hold: 0.15, chorus: { rate: 1.5, depth: 0.3 }, verb: -12, level: -10 }`. In `pad()`, when `typeof o.osc === 'object'` use it as the oscillator directly.
- `PAD.rave`: `{ osc: 'fatsawtooth', spread: 35, attack: 0.003, release: 0.3, hold: 0.3, verb: -14, level: -14 }`.
- The pad envelope must use `o.attack` / `o.release` (it already does). Short pads need `decay: 0.3, sustain: 0.5`, so make those `o.decay ?? 1`, `o.sustain ?? 0.8`, and set `decay: 0.15, sustain: 0.4` in the three stab presets.
- `KITS`:
  - house bass `BASS.pluck`, pad `{ ...PAD.discoStab, filterLo: 600, filterHi: 4000 }`
  - UKG bass `BASS.rubber`, pad `{ ...PAD.organ, filterLo: 800, filterHi: 4500 }`
  - hardbass bass `BASS.pump`, pad `{ ...PAD.rave, filterLo: 900, filterHi: 5000 }`

- [ ] **Step 4: Run all suites, expect pass**

- [ ] **Step 5: Commit** `feat(audio): disco pluck, rubber and pumping basses; disco, organ and rave stabs`

---

### Task 5: Lead voices `talkbox`, `chop`, `supersaw`

**Files:**
- Modify: `web/audio/kits.js` (`lead()`, `LEAD`, `KITS`)
- Test: `web/audio-test.mjs` (both kit harnesses' `Param` gain `exponentialRampToValueAtTime(value, time)`, recorded as method `'expRamp'`)

**Interfaces:**
- Produces: `LEAD.talkbox`, `LEAD.chop`, `LEAD.supersaw`.

- [ ] **Step 1: Tests first** (append)
```js
// in the kit boundaries harness, after kit.lead(...) for each kit:
if (name === 'French house') {
  kit.lead({ notes: [60], duration: 0.2, velocity: 0.7 }, { hr: 85, press: 0.5, breath: 1 }, 7);
  assert.ok(automation.some((a) => a.time === 7 && a.method === 'target' && a.value >= 700 && a.value <= 900), 'talkbox opens to "a" F1 on exhale');
}
if (name === 'UK garage') {
  kit.lead({ notes: [60], duration: 0.2, velocity: 0.7 }, hearts.lead, 8);
  assert.ok(automation.some((a) => a.method === 'expRamp' && a.time > 8 && a.time <= 8.05), 'chop pitch drops into the note');
}
```
Add `exponentialRampToValueAtTime(value, time) { automation.push({ method: 'expRamp', value, time, node: this.node }); this.value = value; }` to both `Param` classes. The bounded-automation check (`<= 18000`) must still hold, so the chop ramp values are Hz below 18000.

- [ ] **Step 2: Run, expect failure**

- [ ] **Step 3: Implement new `type` branches in `lead()`**
- **`talkbox`:**
  - `syn = Tone.Synth({ oscillator: { type: 'fatsawtooth', count: 2, spread: 10 }, portamento: o.glide ?? 0.05, envelope: { attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.15 } })`.
  - Connect `syn` to two parallel `Tone.Filter({ type: 'bandpass', Q: 6 })` (`f1`, `f2`), both into `lp`.
  - `VOWELS = [[325,700],[450,800],[800,1150],[400,1600],[300,2300]]` (u o a e i).
  - In `play`: `let v = midiNote % 5; if (heart.breath > 0.3) v = 2; f1.frequency.setTargetAtTime(VOWELS[v][0], t, 0.04); f2.frequency.setTargetAtTime(VOWELS[v][1], t, 0.04);`.
  - The test sends `breath: 1`, so F1 = 800.
- **`chop`:**
  - `syn = Tone.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.003, decay: 0.12, sustain: 0.2, release: 0.06 } })`, through a fixed band-pass pair that alternates per note between "ah" `[800,1150]` and "oh" `[450,800]`.
  - In `play`, after `triggerAttackRelease`:
    ```js
    const hz = Tone.Frequency(p.notes[0], 'midi').toFrequency();
    syn.frequency.setValueAtTime(hz * 2 ** (2 / 12), t);
    syn.frequency.exponentialRampToValueAtTime(hz, t + 0.04);
    ```
  - Extend the test's fake `Tone.Frequency` to `({ toNote: ..., toFrequency: () => 440 })` in both harnesses.
- **`supersaw`:**
  - `syn = Tone.Synth({ oscillator: { type: 'fatsawtooth', count: 7, spread: 40 }, portamento: o.glide ?? 0.02, envelope: { attack: 0.003, decay: 0.15, sustain: 0.6, release: 0.12 } })`.
  - Add a second identical synth `up` with `volume: -8`, triggered at `p.notes[0] + 12`.
  - Both go through `Tone.Distortion({ distortion: 0.3, wet: 0.6 })` into `lp`.
  - `silence()` releases both.
- **Presets:**
  - `LEAD.talkbox = { type: 'talkbox', glide: 0.05, delay: { pingpong: true, time: '8n.', feedback: 0.25, send: -12 }, verb: -12, level: -6 }`
  - `LEAD.chop = { type: 'chop', delay: { time: '8n', feedback: 0.2, send: -14 }, verb: -10, level: -6 }`
  - `LEAD.supersaw = { type: 'supersaw', glide: 0.02, verb: -16, level: -10 }`
- **`KITS`:**
  - house lead `{ ...LEAD.talkbox, brightLo: 1200, brightHi: 6000, echoBase: 0.18 }`
  - UKG `{ ...LEAD.chop, brightLo: 1500, brightHi: 6500, echoBase: 0.12 }`
  - hardbass `{ ...LEAD.supersaw, brightLo: 2000, brightHi: 8000 }`

- [ ] **Step 4: Run all suites, expect pass**

- [ ] **Step 5: Commit** `feat(audio): talkbox, vocal-chop and supersaw leads`

---

### Task 6: Cleanup, docs and verification

**Files:**
- Modify: `web/audio/kits.js` (delete unused presets), `README.md` (genre descriptions, lines ~97–108), the `KITS` comments

- [ ] **Step 1:** `grep -n "DRUMS\.\|BASS\.\|LEAD\.\|PAD\." web/audio/kits.js`. Delete presets no kit references (expected: `DRUMS.punchy`, `DRUMS.dusty`, `BASS.saw`, `BASS.fm`, `LEAD.square`, `LEAD.keys`, `PAD.saw`, `PAD.warm`). Delete `type` branches only if no preset uses them. Keep `fm` lead/bass branches if anything still uses them.
- [ ] **Step 2:** Rewrite each `KITS` entry comment and the README genre paragraph to describe the new sound in 1–2 lines each.
- [ ] **Step 3:** Run all four suites. Expect pass.
- [ ] **Step 4:** Commit `chore(audio): drop unused presets; describe new genre sounds`.
- [ ] **Step 5 (manual, user):** run `cd web && python3 -m http.server`, open the page, use sim mode, and switch through the genres. Check the signatures listed in the spec's Verification section. Tune the levels by ear: the `level` fields and the kick `drive`.
