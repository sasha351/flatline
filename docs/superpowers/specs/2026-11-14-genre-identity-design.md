# Genre identity: distinct French house, UK garage and hardbass — design

Status: accepted 2026-11-14.

## Context
French house and Russian hardbass share the same drum kit (`DRUMS.punchy`), the same four-on-the-floor kick, the same snare on 2 and 4, and the same square lead (`LEAD.square`). UK garage uses the crushed boom-bap `dusty` kit. Every lead rhythm template is about 8 even notes per bar. All genres use A minor pentatonic, and the pads play the same three triads. The result: three genres that sound alike.

Goal: each genre gets a different vibe through its harmony, rhythm and synth sounds. Reference styles:
- **French house:** filtered disco loop (Daft Punk *Homework/Discovery*, Stardust).
- **UK garage:** modern revival (Interplanetary Criminal, Sammy Virji).
- **Russian hardbass:** classic (XS Project).

Ambient is unchanged.

Out of scope: samples, new heart features, UI changes. Approach: keep the current architecture. `patterns.js` stays pure data, `kits.js` holds presets and voice factories, and `evolution.js` turns cells into events.

## Part 1 — Harmony

### Per-genre key
Each genre in `GENRES` gets `key: { root, scale, chords }`. `chords` is a progression of scale-degree stacks, one chord per bar, cycling.

| Genre | Root (MIDI) | Scale | Progression |
|---|---|---|---|
| French house | G (43) | Dorian `[0,2,3,5,7,9,10]` | i7 `[0,2,4,6]` → IV7 `[3,5,7,9]` → i7 → ♭VIImaj7 `[6,8,10,12]` (Gm7 C7 Gm7 Fmaj7) |
| UK garage | F (41) | natural minor `[0,2,3,5,7,8,10]` | i9 `[0,2,4,6,8]` → ♭VImaj7 `[5,7,9,11]` → iv9 `[3,5,7,9,11]` → v7 `[4,6,8,10]` (Fm9 D♭maj7 B♭m9 Cm7) |
| Russian hardbass | A (45) | harmonic minor `[0,2,3,5,7,8,11]` | i `[0,2,4]` → VI `[5,7,9]` → iv `[3,5,7]` → V `[4,6,8]` (Am F Dm E) |
| Ambient | A (45) | minor pentatonic (current) | none; pad cells keep explicit degrees |

- Each kit's kick `note` is tuned to the genre root: G1 house, F1 garage, A1 hardbass.

### `mapping.js`
- `note(index, octave, scale = SCALE, root = ROOT)`. The defaults keep current behaviour.

### `evolution.js`
- The current chord is `key.chords[barInPhrase % chords.length]`, or `null` when the genre has no progression.
- **Bass:** cell degrees are relative to the chord root, so degree 0 plays `chord[0]`. With no chord they stay absolute.
- **Pad:** a cell with no `degrees` plays the current chord. Explicit `degrees` (Ambient) still win.
- **Lead:** the motif degree is used as today. On strong steps (`position % 4 === 0`), with a chord present, it snaps to the nearest chord tone. Distance is measured in scale degrees, comparing chord tones and their ±octave (`± scale.length`) copies.
- All note calls pass the genre's `scale` and `root`.

### `melody.js`
- `makeMotif` and `develop` take the scale length `n` (default 5). The motif resolves to the nearest of {0, 4, n} (root, 5th, octave root). Pentatonic behaviour, and so Ambient, is unchanged.

## Part 2 — Patterns and sounds

### Grid notation
- Grids are 16 steps per bar. `x` is a hit, `g` a ghost hit at half weight, `.` a rest.
- `drum()` returns weights (1, 0.5, 0). `voiceEvent` multiplies the drum velocity by the weight.
- The existing drum lookups treat any truthy weight as a hit.

### French house — filtered disco loop
- **Tempo:** 120–126 BPM, default 123. No swing. Pump on.
- **Drums:** new `disco` kit.
  - Tight 909-style kick: short decay (~0.3 s), click, light drive.
  - A real clap replaces the snare.
  - Soft noise hats, and open hats on the off-beat.
  - v0: kick `x...x...x...x...` · clap `....x.......x...` · hat `x.x.x.x.x.x.x.x.` · openhat `..x...x...x...x.`
  - v1: hat `xgxgxgxgxgxgxgxg`, kick `x...x...x...x..x`, the rest as v0
  - v2: kick, clap and openhat only
- **Bass:** disco octave, relative to the chord root.
  - v0: 8ths alternating octave −1 / 0 on the root.
  - v1: as v0, with the 5th (degree +4) on steps 6 and 14.
  - v2: syncopated funk `x..x..x...x.x...` mixing root, octave and 5th.
  - Sound: new `pluck` MonoSynth (square), snappy filter envelope, no sub, short `16n` default.
- **Pad:** the "filtered loop".
  - Current-chord chops on `x..x..x...x.x...`, gates 1–2.
  - v1 and v2 shift the chops (`..x..x..x.x...x.`, `x.....x..x..x...`).
  - Sound: new `discoStab` preset. Brassy fatsawtooth, phaser + chorus, and a slow AutoFilter sweep (`motion` ≈ 0.06 Hz) so the loop opens and closes over several bars. The kit pump ducks it.
- **Lead:** new `talkbox` type.
  - A sawtooth through two parallel band-pass formant filters (F1, F2) with legato glide (~0.05 s).
  - Each note sets the vowel targets. The vowel index comes from `degree % 5` over `[u, o, a, e, i]`, shifted toward "a" by `breath > 0` (exhale opens). Use `setTargetAtTime` with a ~40 ms glide.
  - Rhythm templates: v0 `x..x..x.x...x.x.`; v1 the same, with gate-2 holds on steps 6 and 12; v2 `x.x...x..x..x...`.
  - Vowel formants (Hz): u 325/700, o 450/800, a 800/1150, e 400/1600, i 300/2300.

### UK garage — modern revival
- **Tempo:** 130–136 BPM, default 133. Swing 0.30. Light pump on (shallower duck depth than house: `pump` accepts a depth number).
- **Drums:** new `crisp` kit, replacing `dusty` for this genre.
  - Punchy short kick (~0.35 s) with a click.
  - Snare with a body, layered with a clap on the same steps.
  - Crisp metal hats.
  - New `rim` piece: a very short, high, band-passed click (MembraneSynth or MetalSynth, decay ~0.03 s).
  - v0: kick `x.........x.....` · snare+clap `....x.......x...` · hat `gxgxgxgxgxgxgxgx` · rim `......x......x..`
  - v1: kick `x......x..x.....`, rim `...x......x.....`
  - v2: kick `x.........x...x.`, openhat `..............x.`
- **Bass:** new `rubber` type.
  - A sine plus a quiet FM-square layer, short punchy envelope (decay ~0.2 s, sustain ~0.3), glide ~0.06 s so notes slide.
  - Relative to the chord root, with octave jumps.
  - v0 `x..x..x...x.x...`; v1 `x...x..x..x..x..`; v2 `x..x....x.x..x..`.
- **Pad:** new `organ` preset.
  - Short current-chord stabs, gate 1, on `...x..x...x..x..`; v1 `..x...x..x...x..`; v2 `...x.....x..x...`.
  - Organ tone: Synth with oscillator `{ type: 'custom', partials: [1, 0.6, 0.3, 0.2, 0.1] }`, fast attack, short release, light chorus.
- **Lead:** new `chop` type.
  - A vocal chop: square/saw through a fixed formant pair (alternating "ah"/"oh" per note).
  - Each note starts 2 semitones sharp and ramps down to pitch in ~40 ms (`frequency.setValueAtTime` + `exponentialRampToValueAtTime`).
  - Short gates, stuttery templates: v0 `x.xx..x...x.x...`; v1 `..x.xx....x..x..`; v2 `x.x.x....xx...x.`.

### Russian hardbass — classic
- **Tempo:** 150–160 BPM, default 155. No swing. Pump on.
- **Drums:** new `hard` kit.
  - Massive kick: long decay (~0.7 s), heavy drive (~0.9), click, loudest element.
  - Big dry clap on 2 and 4. Hats nearly absent.
  - v0: kick `x...x...x...x...` · clap `....x.......x...`
  - v1: as v0, plus quiet openhat `..x...x...x...x.`
  - v2: kick `x...x...x...x.xx`, clap as v0
- **Bass:** new `pump` type, the defining off-beat bass.
  - Detuned fatsawtooth MonoSynth with drive and a fast filter-envelope "pop", short `16n`, on the chord root.
  - v0 `..x...x...x...x.`; v1 gallop `..xx..xx..xx..xx`; v2 as v0 with the octave on step 14.
- **Pad:** new `rave` preset.
  - One short current-chord saw stab per bar on step 0 (gate 2), quiet, dry.
  - The kit reverb is short (decay ~1 s).
- **Lead:** new `supersaw` type.
  - Synth with `{ type: 'fatsawtooth', count: 7, spread: 40 }`, plus a second identical synth one octave up at −8 dB, Distortion ~0.3, glide ~0.02 s.
  - Templates: v0 driving 8ths `x.x.x.x.x.x.x.x.`; v1 gallop `x.xxx.xxx.xxx.xx`; v2 held notes on steps 0 and 8 (gate 8).

### Heart mappings
- **Unchanged:** heart rate sets brightness and filter, press sets velocity and grit, breath sets the echo send and pad filter.
- **New:** breath moves the talkbox vowel.

### `kits.js` structure
- New presets go into the existing `DRUMS`, `BASS`, `LEAD` and `PAD` tables.
- New behaviour goes into the existing factories as new `type` branches: lead `talkbox` / `chop` / `supersaw`; bass `rubber` / `pump` (or `pump` as a `mono` preset with `osc: 'fatsawtooth'` plus drive if that suffices).
- New drum piece `rim`.
- `pump` accepts `true` (current depth 0.62) or a number (the duck gain).
- `DRUMS.dusty`, `DRUMS.punchy`, `LEAD.square`, `LEAD.keys`, `BASS.saw` and `PAD.warm` are deleted if nothing uses them afterwards.

## Files
- `web/audio/patterns.js` — keys, new grids, `g` weights, pad cells without degrees.
- `web/audio/mapping.js` — `note()` takes scale and root.
- `web/audio/evolution.js` — chord tracking, bass relative to chord, pad current chord, lead strong-beat snap, drum weights.
- `web/audio/melody.js` — scale-length parameter for the resolve set.
- `web/audio/kits.js` — new kits, voice types and the `rim` piece.
- `web/audio-test.mjs` — updated and new tests; the fake Tone gains any new classes.

## Verification
- `node web/audio-test.mjs`, `node web/test.mjs`, `node web/stage-test.mjs`, `node web/fluid-test.mjs` all pass.
- New or updated tests (the tempo-range test is updated to the new ranges):
  - Every pitched note is in its genre's scale relative to its genre root.
  - On strong steps with a chord, the lead MIDI note's pitch class is a chord tone.
  - Bass degree 0 plays the current chord root.
  - Pad cells without degrees play the current chord.
  - A `g` hit gives a lower drum velocity than an `x` hit.
  - All four kits build, play every voice and piece (including `rim` and the new lead/bass types) and dispose.
  - Ambient output is unchanged against a snapshot taken before the change.
- **Manual:** `python3 -m http.server` in `web/`, sim mode. Switch through the genres and confirm each has its signature:
  - **House:** off-beat open hats, octave bass, pumping filtered chord chops, talkbox.
  - **UKG:** a 2-step kick that skips beat 3, swung ghost hats, sliding bass, organ stabs, pitched vocal chops.
  - **Hardbass:** a pounding distorted kick, the off-beat pumping bass, a supersaw lead in harmonic minor.
