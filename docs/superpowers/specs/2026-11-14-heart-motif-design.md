# Heart-generated lead motif — design

Status: accepted 2026-11-14.

## Context
The lead loops one of 3 hard-coded 16-step patterns per genre (`web/audio/patterns.js`, e.g. `4·2·3·1·4·2·3·1`), so it sounds like an arpeggiator and every session sounds alike. The heart only picks the variant (`phraseSeed`, `mapping.js:36`; `evolution.js:55-64`).

Goal: when the lead finger settles, its heart generates a **personal motif** for that session. Later phrases **develop** the motif from live heart features. The genre's lead patterns stay as the **rhythm template** (onset slots + gates). The heart decides pitches and rests.

Decisions so far:
- uniqueness = personal motif that evolves
- rhythm = keep the genre template; generate pitches + rests

## Design

### New pure module `web/audio/melody.js` (~50 lines)
- `rng(seed)` is a mulberry32 PRNG. Both functions below use it, and stdlib has no seeded RNG.
- `makeMotif(seed, heart)` returns 16 entries, each a scale degree or `null` (rest):
  - Random walk on degrees with steps ±1/±2.
  - Leap chance (±3/±4) rises with `hr`: `clamp((hr-55)/50, 0, 0.4)`. Calm hearts give stepwise lines, fast hearts give jumpier ones.
  - The sign of `breath` sets the first half's contour (rising or falling).
  - Degrees are clamped to 0..9 (two pentatonic octaves). `fitNotes` already folds them into the lead range 57–93.
  - About 15% of slots are rests, never slot 0.
  - The last sounding note snaps to degree 0 or 4 (root or 5th), so the phrase resolves.
- `develop(motif, phrase, seed, heart)` returns the degrees for this phrase. The form is **A A' A B**:
  - `phrase % 4 === 0` plays the original, so the hook comes back.
  - Other phrases apply one transform picked by `(seed + phrase)`: transpose ±1–2 degrees (direction from `breath` at that moment), invert around the first note, or retrograde.
  - `press` sets density. High press (> 0.7) fills rests with the neighbouring degree. Low press (< 0.3) adds one extra rest.

### `web/audio/evolution.js` changes
- Lead state: `motif = null`, `phraseDegrees = null`, `onset = 0`.
- **Generate:** the first step where `hearts[lead].settled` is true and `motif` is null runs `motif = makeMotif(phraseSeed(raws[lead]>>>0, heart), heart)`. The raw-sample bits make each session different.
- **Finger lift** (`!heart.on`): set `motif = null`. Re-landing produces a new tune.
- **Phrase start** (existing block): `phraseDegrees = develop(...)`, `onset = 0`. The variant choice for rhythm is unchanged.
- **Lead step:** if the template cell is non-null and a motif exists:
  - Take `deg = phraseDegrees[onset++ % len]`, where `len = min(16, 2 × onsets-per-bar of the selected variant)`. The motif then spans 2 bars and repeats inside the phrase.
  - `deg === null` means a rest: no event.
  - Otherwise call `voiceEvent` with `{...cell, degree: deg}`, which keeps the cell's gate, velocity and octave.
- Before the lead settles (the first 4 beats), the fixed pattern plays as it does today. That is the fallback, so there is no silent gap.
- Genre change recreates the evolution (`audio.js:77`), so the motif regenerates. That's acceptable: the new genre gets a fresh tune.

No changes are needed in `kits.js`, `lane.js` or `pi/oled.py`. They already consume `notes[0]` from note events.

### Cleanup
- Fix the stale "arp step" comment at `web/audio/kits.js:268`.

## Files
- add `web/audio/melody.js`
- edit `web/audio/evolution.js` (lead branch + phrase block)
- edit `web/audio-test.mjs` (new tests)
- add spec `docs/superpowers/specs/2026-11-14-heart-motif-design.md` and commit it (brainstorming flow), then the writing-plans step

## Verification
- `node web/audio-test.mjs`. New asserts:
  - `makeMotif` is deterministic per seed, and different seeds give different motifs.
  - Degrees stay in 0..9, and the last sounding note is 0 or 4.
  - `develop(phrase 0)` equals the motif.
  - Through `createEvolution`, lead MIDI stays in 57–93 (the existing test). Two different raw seeds give different lead note sequences. A lift then re-land regenerates the motif.
- Existing tests still pass.
- Manual check: `python3 -m http.server` in `web/`, sim mode. Listen to the lead, lift and re-land the lead finger (or reload the sim), and confirm a different tune with the same groove. Check the notes-lane melody curve.
