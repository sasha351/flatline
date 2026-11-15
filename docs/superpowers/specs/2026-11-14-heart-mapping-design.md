# flatline: heart-driven tempo, patterns and timbre

## Context
Today the music has two modes. In `beats` mode each heartbeat triggers a note. In `bits` mode a fixed 110 BPM grid runs. Neither mode uses what a heart actually does. This design replaces both with one grid:
- The drum finger's heart rate sets the song tempo.
- The tempo band picks the rhythm patterns.
- Each instrument's own finger shapes its timbre through heart rate, pressure and breathing.

Decisions made in brainstorming:
- One grid replaces both modes. The mode toggle and the `DIV` table are deleted.
- Raw bits still choose pitch and velocity. The patterns own rhythm, including which drum hits.
- The tempo locks once the drum finger has settled, then follows slowly.
- Each voice reads its own finger's features.
- A higher heart rate opens the filter, so the sound gets brighter.

## Heart features (optical PPG, per finger)

| Feature | Typical values | Player control | Used |
|---|---|---|---|
| Heart rate | Rest 60–100, athletes 45–60, nervous 80–110. A deliberate shift takes 10–30 s and moves about 5–15 BPM. | Calm, slow breathing lowers it. Tension, talking or moving raises it. | Yes: `hr` |
| Breathing swing (RSA) | ±3–10 BPM, one cycle every 3–5 s | Deep, slow breaths make a big swing. | Yes: `breath` |
| Pulse amplitude | Relative to each finger only. Drifts ±20–50%. | Finger pressure, instantly | Yes: `press` |
| Beat onset | About 1 per second | None | Only for settling (4 beats) |
| Finger on/off | — | Lift the finger or put it back | Voice gate |
| HRV (beat-to-beat jitter) | 20–80 ms | Indirect only | No. Add swing later if the groove feels stiff. |
| Dicrotic notch | Faint at 50 Hz | None | No |

## Architecture

### `signal.js` (core)
Each channel in `frame` gains two fields. Existing listeners ignore unknown fields, so the bus contract is unchanged.
- `amp`: the pulse envelope (`env`).
- `inst`: the instantaneous BPM of the latest beat, before smoothing. It is 0 until the second beat arrives.

### `audio/heart.js` (new, pure)
`createHeart()` returns a tracker for one finger, fed one `ch` per frame. It returns `{ on, settled, hr, press, breath }`:
- `hr`: `ch.bpm`. It reads 75 until `settled`.
- `settled`: true after 4 beats since the finger landed.
- `press`: `amp` divided by that finger's own slow average of `amp` (about 10 s EMA). The average has a floor so the division can't blow up. The result is mapped from the range 0.5–1.5 to 0–1 and clamped.
- `breath`: `(inst − slowHr) / 10`, clamped to −1 to 1. `slowHr` is a 10 s EMA of `hr`. `inst` values outside 0.6–1.6 × `slowHr` are ignored. `breath` is 0 until `settled`.
- The finger lifting resets everything.

### `audio/tempo.js` (new, pure)
- `songBpm(hr)`: maps heart rate 50–110 linearly to song tempo 100–180, clamped at both ends.
- `createTempo()`: the tempo follower, with `update(drumHeart) → targetBpm` and these states:
  - **Default:** 90 while the drum finger is off or not settled.
  - **Lock:** once the drum finger settles, it glides to `songBpm(hr)` over 2 bars.
  - **Follow:** after that it follows `songBpm(hr)`, ignoring changes under 2 BPM.
  - **Release:** when the finger lifts, it glides back to 90 over 2 bars.
  - Glides use `transport.bpm.rampTo(target, twoBarsInSeconds)`.
- `band(songBpm, prev)`: slow below 125, mid from 125 to 155, fast above 155, with ±3 BPM hysteresis around `prev`.

### `audio/patterns.js` (new, pure data)
A grid has 16 steps per bar (16ths), and `x` marks a hit.

Drums:
```
         slow              mid               fast
kick   x.......x.......  x.......x.x.....  x.....x...x...x.
snare  ....x.......x...  ....x.......x...  ....x.......x..x
hat    ................  x.x.x.x.x.x.x.x.  xxxxxxxxxxxxxxxx  (off-8th hats at half velocity)
```

Bass:
```
slow  x.......x.......
mid   x..x..x.x..x....
fast  x..x..x...x.x..x
```

Lead arp note length, from the lead finger's `hr`, with ±2 BPM hysteresis:

| Lead heart rate | <65 | 65–75 | 75–85 | 85–95 | ≥95 |
|---|---|---|---|---|---|
| Note | whole | half | quarter | 8th | 16th |
| Steps | 16 | 8 | 4 | 2 | 1 |

Pad chord change: every 16 steps in the slow and mid bands, every 8 steps in the fast band.

### `audio/mapping.js`
It keeps the bit fields and the pentatonic scale, but bits now pick only pitch and velocity. The drum-type choice is removed.
- Bass: degree `a % 5`, octave 0.
- Lead: chord root degree `d`. The arp cycles upward through degrees `d, d+2, d+4, d+5`, at octave 2.
- Pad: today's triad.

### `audio/kits.js` (`basic`)
- Bass: a new `Tone.Distortion` after the bass. `distortion = 0.4 · press`. `filterEnvelope.baseFrequency` maps `hr` 55–110 to 100–600 Hz.
- Lead: a new lowpass before the vibrato. The cutoff maps `hr` 55–110 exponentially to 400–4000 Hz.
- Pad: the cutoff maps `hr` 55–110 exponentially to 300–3000 Hz, multiplied by `2^breath` (±1 octave). It updates every 16th step with a short ramp.
- Drums: the hit type comes from the pattern. Velocity is `(0.5 + 0.5·press) · bitVelocity`.
- Lead velocity is `0.4 + 0.6·press`. Pad velocity comes from bits.
- All heart-rate inputs are clamped to 55–110 before mapping.

The kit API takes the heart state alongside the bit params, as `kit[voice](p, heart, t)`. Values not listed here stay as they are today.

### `audio.js`
- It keeps one `heart` tracker per channel, updated on each `frame`.
- It runs a single `scheduleRepeat('16n')` with a step counter. On each step:
  1. Update the tempo from the drum tracker.
  2. On step 0, apply any pending band change and re-pick the per-bar bits (bass degree, lead root, pad chord).
  3. For each voice whose finger is on, check its pattern or step rate. If it fires, call the kit and emit `note`.
- The `mode` listener and the `DIV` table are deleted.

### `serial.js` simulator
The drum channel outputs 0 (no finger) for the first 10 s, then a pulse at 72 BPM. The pad channel's rate swings ±6 BPM on a 4 s breathing cycle. This lets the no-drum default, the tempo lock and the pad wobble all be tested without hardware.

### UI
The mode `<fieldset>` is removed from `index.html`, along with its handler in `ui.js`. Nothing else in the UI changes.

## Edge cases

| Situation | Behavior |
|---|---|
| No drum finger, other fingers on | The tempo stays at 90 and the band is slow. The other voices play. |
| Drum finger lands | The tempo holds 90 for 4 beats, then glides to the mapped tempo over 2 bars. |
| Drum finger lifts | The drums go silent and the tempo glides back to 90 over 2 bars. |
| A finger lifts mid-note | The voice stops on the next step. The pad releases. Bass and lead finish their envelopes. |
| Finger not yet settled | The voice plays with `hr = 75` and `breath = 0`. |
| Band changes mid-bar | The change waits for the next step 0. |
| Missed or extra beat | The `inst` outlier is dropped from `breath`. The tempo ignores changes under 2 BPM. |
| `amp` near zero | `press` is clamped, and the slow average has a floor. |
| Kit switch | The trackers and the tempo live outside the kit and survive the switch. |
| Status leaves `running` | The step counter resets, the voices go silent and the trackers reset. |

## Testing (`web/test.mjs`, plain `assert`)
- `songBpm`: 50 maps to 100, 110 maps to 180, and values outside that range are clamped.
- `band`: the edges are right, and hysteresis stops it flipping at 125 ± 1.
- Tempo follower: it holds 90 until settled, ignores jitter under 2 BPM, and returns to 90 when the finger lifts.
- `heart`: `breath` follows a synthetic ±6 BPM breathing sine (correct sign, about ±0.6), and `press` rises when `amp` steps up.
- Lead arp step lookup at each threshold, including hysteresis.

## Verification
1. Run `node web/test.mjs` and confirm it passes.
2. Press Simulate. For the first 10 s, the bass, lead and pad should play at 90 with no drums.
3. After that, the drums come in. About 4 beats later, the tempo should glide to `songBpm(72)` ≈ 129 (mid band). The pad filter should wobble with the simulated breathing.
4. With real sensors:
   - Slow, deep breathing should make the pad filter audibly wobble.
   - Pressing harder should make the bass grittier.
   - A higher lead-finger heart rate should make the arp faster and brighter.
