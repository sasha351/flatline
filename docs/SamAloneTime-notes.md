# SamAloneTime: BPM stability work

Working notes for the `SamAloneTime` branch. The branch covers four requests from Sasha (2026-11-14):

1. Test and investigate how good the BPM variation is.
2. Don't show BPM on the dashboard until it has stabilised; show a ghost animation while it calibrates.
3. Make the OLED heart-rate display consistent with the dashboard's.
4. Give the BPM setter more rules and consistency, and maybe add a song BPM and an average heart BPM readout to the dashboard.

Status (2026-11-14): all four are built on this branch and pass the repo's tests and replays of the recordings. Not yet tried on the real sensors or the real OLED: see "Still to test" at the bottom.

## Test setup: two sensors

Sensors 2 and 3 got unplugged, so every hardware test on this branch is run on two sensors: **sensor 1 (drums) and sensor 4 (pad)**. Bass and lead can be played by a stand-in heartbeat (click their blob after connecting). A stand-in runs at a random 60-100 BPM, so it is left out of the average heart rate and the song tempo.

## 1. BPM variation (measured)

Four 30 s bare-sensor recordings (one still finger each, true rate about 75-80 BPM) replayed through `web/signal.js`, `web/audio/heart.js` and `web/audio/tempo.js`. The recordings are not in the repo; they live in `~/flatline-handoff/data/bare-sensors/` on Sam's laptop.

| Recording | First number after | Dashboard BPM range | Song tempo range | Tempo retargets |
|---|---|---|---|---|
| touch4, sensor 2 (clean) | 4.6 s | 69-79 | 138-158 | 35 in 25 s |
| touch3, sensor 3 (shaky) | 3.6 s | 72-90 | 144-179 | 15 in 26 s |
| touch2, sensor 1 (clean) | 4.5 s | 75-99 | 150-198 | 36 in 26 s |
| touch1, sensor 4 (shaky) | 3.5 s | 68-92 | 136-185 | 20 in 27 s |

- The first few seconds are the worst: touch2 shows 97-99 for three seconds before dropping to about 80, and touch3 opens at 90 before settling at 72.
- Steady state is decent on a clean signal: after the opening, touch3 holds 72-73 and touch4 stays within about +-5.
- A shaky finger still wanders: touch1 goes 87 -> 68 -> 92 inside 30 s.
- In two later play logs (16:35 and 16:41, mounting unknown) the drum sensor's rate typically moved 11-16 BPM over any 10 s.

## 2. Hide BPM until stabilised

`web/ui/stage.js` shows the number as soon as `bpm > 0`. That first value is the quick two-beat estimate in `signal.js` (`robustBpm`), which is the 97 and 90 above. The detector has an internal `locked` flag from its quality filter, but it is not in the frame.

Plan: expose the flag in the frame, add a short "held steady" condition, and draw the ghost animation until both are true. `heart.js`'s `settled` (4 beats today) should use the same flag.

## 3. OLED and dashboard disagree

`pi/oled.py` says it mirrors `signal.js` but is an older port: no band-pass, no quality lock, a 5-beat median instead of 15. Same recordings, per-second readings:

| Recording | Dashboard | OLED |
|---|---|---|
| touch3 | 72-90, settles at 72 | 34-107, sits at 45-48 for 17 s |
| touch2 | 75-99 | 68-154 |
| touch1 | 68-92 | 53-107 |
| touch4 | 69-79 | 67-97 |

Options:
- Send the browser's BPM to the Pi over the serial link, with the OLED's own detector as the fallback when no browser is connected. `pi/flatline.py` already parses `n,` lines from the host; `web/serial.js` has no writer yet.
- Re-port the current detector to Python. Works without a browser, but is a second copy to keep in sync.

## 4. The BPM setter

Today (`web/audio/tempo.js`, `web/audio/audio.js`):
- Song tempo is 2 x the drum finger's rate, so every wobble is doubled.
- It retargets on any change of 0.5 song BPM (0.25 heart BPM), in practice every half second, and each retarget restarts a 2-bar glide.
- It snaps to the genre default the moment the drum finger lifts or slips, then jumps back.

Proposed rules:
- Drive the tempo from an average heart rate over roughly 10 s.
- Whole-BPM steps with a dead band: move only when the average has shifted 3 or more BPM for a few seconds.
- Change tempo only at a bar boundary.
- Hold the last tempo for a few seconds after a finger lifts.
- Show "song BPM" and "avg heart BPM" on the dashboard.

## Decisions (Sam, 2026-11-14)

1. The tempo follows the mean of all stabilised fingers, not the drum finger alone.
2. Squeeze stays out of this branch (below).
3. OLED: Claude went with browser-sent BPM (its recommendation; Sam has not confirmed this one).

## What was built

**Stabilised flag** (`web/signal.js`, frame field `stable`). True once the BPM has stayed within 3 BPM for 3 s after the quality filter locks. A finger too shaky to lock counts after its beat-median BPM holds for 6 s. It stays true until the finger lifts. Knobs: `STABLE_S`, `STABLE_LOOSE_S`, `STABLE_BPM`.

| Recording | Number appears after | Range shown afterwards (was) |
|---|---|---|
| touch4 (clean) | 8.0 s | 69-79 (69-79) |
| touch3 (shaky) | 7.5 s | 72-79 (72-90) |
| touch2 (clean) | 14.0 s | 77-83 (75-99) |
| touch1 (shaky) | 14.5 s | 68-92 (68-92) |

The bad opening numbers (97-99, 90) are no longer shown. touch1 never locks, so it still wanders once shown.

**Ghost animation** (`web/ui/stage.js`, `.bpm.ghost` in `web/ui/style.css`). Finger on but not stable: a shimmering bar in place of the number, label "finding your pulse". The four blobs only merge once all four are stable. `heart.js` `settled` now means "stable", so a calibrating BPM does not steer the music either.

**Tempo rules** (`web/audio/tempo.js`, applied in `web/audio/audio.js`):
- average heart = mean of the stabilised fingers, smoothed over 10 s (`AVG_S`)
- song = 2 x average, in whole BPM
- it moves only when 2 x average is 4 or more song BPM away (`STEP`)
- a new tempo starts at a bar line and glides in over 2 bars
- with every finger off it holds for 8 s (`HOLD_S`), then returns to the kit's default
- stand-in heartbeats do not count

| Recording | Song range before | after | Tempo changes before | after |
|---|---|---|---|---|
| touch4 | 138-158 | 150 | 35 in 25 s | 0 in 22 s |
| touch3 | 144-179 | 146-158 | 15 in 26 s | 3 in 23 s |
| touch2 | 150-198 | 153-157 | 36 in 26 s | 1 in 16 s |
| touch1 | 136-185 | 156-164 | 20 in 27 s | 4 in 16 s |

On the two play logs (sensors 1-3 together): 21-40 changes a minute before, 8-10 after.

**Readouts** (`#tempo` in `web/index.html`): "song bpm" and "avg heart bpm" under the header, from the new `tempo` bus event.

**OLED** (`web/serial.js` `bpmLine`/`sendLine`, `web/core.js`, `pi/flatline.py`, `pi/oled.py`). Twice a second the browser sends `h,b0,b1,b2,b3,avg`: the numbers on the dashboard, 0 where it shows none. The OLED prints those (and `avg` on the merged ball) for as long as they keep arriving, and falls back to its own older estimate 2 s after they stop. Not sent in `?fill=sim` mode, where channel numbers do not match the Pi's.

## Still to test

- **On the real sensors (1 and 4):** how long the ghost lasts, whether the number is steady once shown, how the song tempo feels. Everything above was measured on recordings and the simulator.
- **OLED:** the new `pi/flatline.py` and `pi/oled.py` are not on the Pi yet. Install: `scp pi/flatline.py pi/oled.py flatline:/tmp/`, then on the Pi `sudo install -m 755 /tmp/flatline.py /tmp/oled.py /opt/flatline/ && sudo systemctl restart flatline`. `python3 pi/oled.py --selftest` passes off the Pi.
- The ghost and readouts were checked once in headless Chrome with `?demo`; the shimmer itself has not been watched in motion.
- The OLED's own detector (no browser connected) is unchanged and still shows the wild numbers from section 3.

## More kits (2026-11-14)

**How a kit is added.** Two entries with the same name: the music in `web/audio/patterns.js` (`GENRES`: key, chords, idle tempo, swing, and three or more pattern variants for each of drums, bass, lead and pad) and the sound in `web/audio/kits.js` (`KITS`: one preset each from `DRUMS`, `BASS`, `LEAD`, `PAD`, plus reverb and sidechain `pump`). The kit menu, the Pi's genre button and the shared tests pick a new name up from those tables. `web/audio-test.mjs` lists the kit names in three places and needs the new name added.

**Added:** every kit has all four voices, so they are ready for when sensors 2 and 3 are plugged back in (until then, click the bass and lead blobs for stand-in heartbeats).

| Kit | Drums (sensor 1) | Bass (2) | Lead (3) | Pad (4) |
|---|---|---|---|---|
| Drum and bass | two-step break, cracking snare | dark reese | echoing plucks | held airy chords |
| Acid techno | four-on-the-floor, metal hats, rim | squelching resonant line | sparse saw bleeps | offbeat rave stabs |
| Lo-fi | half-time, dull kit | round soft bass | soft plucks | electric-piano chords |
| Boom bap | half-time, swung, hard kick and snare | sub under the kick | chopped piano loop | **record scratches** |

- Half-time kits put the snare on beat 3 only, so the beat you feel is the heart rate itself (the song still runs at twice the heart rate). `halfTime: true` in a genre moves the swing to the off 8ths.
- The scratch is synthesised (`scratch()` in `kits.js`): a buzzy voice through an "ah" formant plus vinyl hiss, with pitch and tone swept up and back in one hit, alternating push and pull. Knobs: `SWEEP`, `MAX_S`, `hiss`.
- New presets: drums `breaks`, `techno`, `dusty`, `boombap`; bass `reese`, `acid`, `sub`; lead `keys`; pad `keys`, `scratch`.

**Bug found and fixed on the way.** A closed hat and an open hat on the same step made Tone throw ("Start time must be strictly greater than previous start time"), which dropped every later note of that step. French house hit this on steps 2, 6, 10 and 14 of two of its three drum variants. Now the open hat wins (`web/audio/evolution.js`).

**How it was checked.** Unit tests, plus every kit rendered offline with the real Tone.js in headless Chrome, two bars per voice: all eight build, none throws, no bad samples, and the new kits' loudness is in the range of the old ones (whole-kit RMS -12.4 to -16.7 dB against -12.6 to -17.8 dB). **Nobody has listened to them yet**: the levels are measured, the character (especially the scratch) needs ears.

## Dropouts report (2026-11-15), not yet explained

Sam heard brief silences ("clipping"): all instruments stall for a few milliseconds, with no finger lost and no BPM re-search. Cause not found yet.

- **Ruled out:** tempo changes. In a real browser (offline render) the 16th-note clock stays even through the retargets this branch makes, with no stall and no tempo jump.
- **Likely contributor:** Claude's own test runs. They rendered audio in headless Chrome on the same laptop, used a lot of CPU, and played through the speakers (Sam heard them). Later test runs must use `--mute-audio`. Two older headless Chrome test browsers (profiles `/tmp/claude-1000/perf-prof-*`, PIDs 191685 and 191925, started about 9.5 h earlier) were also still running, one at about 30% CPU plus GPU.
- **Cannot be measured headless:** without a GPU the fluid takes about 400 ms a frame, so every note is late there. It has to be measured in Sam's real browser.
- **Added:** `?perf` readout (late notes, longest stall, slow frames), and the stage now writes to the DOM only when a value changes.
- **Next:** read `?perf` while the dropouts happen. Late notes or stalls: the page is held up (then raise Tone's look-ahead or cut main-thread work). All zeros: CPU load or the audio device.

## Squeeze is kept out of this branch

The experimental squeeze-for-volume work (`?squeeze`) is not on `SamAloneTime`, so it cannot affect the BPM tests. It is on the `squeeze-experiment` branch as a single commit on top of this branch's "Pi genre button" commit: `git diff SamAloneTime squeeze-experiment` (at the time it was split) is exactly the squeeze change.
