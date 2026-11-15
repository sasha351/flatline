// Song tempo from the average heart rate of every stabilised finger. Pure.
import { GENRES } from './patterns.js'; // only for each genre's default (idle) tempo

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// Song tempo is the heart rate times the genre's ratio: doubled for most (70 -> 140, 90 -> 180), less for
// slow genres (`tempo.ratio` in patterns.js: disco 1.5, so 80 -> 120). The 60..220 clamp only guards against glitches.
export const songBpm = (hr, ratio = 2) => clamp(hr * ratio, 60, 220);

export const AVG_S = 10;   // ponytail: the average heart rate forgets over about this many seconds
export const STEP = 4;     // ponytail: the song only moves once it is this many song BPM (2 heart BPM) off
export const HOLD_S = 8;   // ponytail: with every finger gone, the song keeps its tempo this long

// Tempo follower. update(hearts, dt) -> { song, heart }: the song's target BPM (a whole number
// while hearts drive it) and the average heart BPM behind it (0 = no hearts). dt: seconds since
// the last call. The rules:
//   average  the mean of the stabilised fingers' rates, smoothed over AVG_S. A finger that is
//            still calibrating (heart.settled false) does not count.
//   lock     the first stabilised finger sets the song to twice the average, rounded
//   follow   after that the song moves only when twice the average is STEP or more away
//   hold     when the last finger lifts, the song keeps its tempo and its average for HOLD_S
//   release  then it goes back to the genre default
// The caller applies a new target at a bar line and glides to it over 2 bars.
export function createTempo(genreName) {
  const genre = GENRES[genreName]?.tempo;
  const ratio = genre?.ratio ?? 2;
  if (!genre) throw new RangeError(`Unknown genre: ${genreName}`);
  let target = genre.default, avg = null, locked = false, idle = 0;
  return function update(hearts, dt = 0) {
    const hrs = hearts.filter((h) => h?.on && h.settled).map((h) => h.hr);
    if (hrs.length) {
      const mean = hrs.reduce((a, b) => a + b, 0) / hrs.length;
      avg = avg === null ? mean : avg + (mean - avg) * (1 - Math.exp(-dt / AVG_S));
      idle = 0;
      const want = Math.round(songBpm(avg, ratio));
      if (!locked || Math.abs(want - target) >= STEP) target = want;
      locked = true;
    } else if (locked && (idle += dt) >= HOLD_S) {
      locked = false; avg = null; target = genre.default;
    }
    return { song: target, heart: avg ?? 0 };
  };
}
