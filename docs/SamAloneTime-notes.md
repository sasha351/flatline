# SamAloneTime: BPM stability work

Working notes for the `SamAloneTime` branch. The branch covers four requests from Sasha (2026-11-14):

1. Test and investigate how good the BPM variation is.
2. Don't show BPM on the dashboard until it has stabilised; show a ghost animation while it calibrates.
3. Make the OLED heart-rate display consistent with the dashboard's.
4. Give the BPM setter more rules and consistency, and maybe add a song BPM and an average heart BPM readout to the dashboard.

Status: investigation done, nothing built yet.

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

## Open decisions

1. Which hearts set the tempo: the drum finger averaged over time, or the mean of all stabilised fingers?
2. OLED fix: browser-sent BPM, or a re-port of the detector?

Suggested build order: 2, then 4, then 3 (the "stabilised" flag from 2 feeds the other two).

## Squeeze is kept out of this branch

The experimental squeeze-for-volume work (`?squeeze`) is not on `SamAloneTime`, so it cannot affect the BPM tests. It is on the `squeeze-experiment` branch as a single commit on top of this branch's "Pi genre button" commit: `git diff SamAloneTime squeeze-experiment` (at the time it was split) is exactly the squeeze change.
