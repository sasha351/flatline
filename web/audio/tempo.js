// Song tempo from the drum finger's heart. Pure.
import { GENRES } from './patterns.js'; // only for each genre's default (idle) tempo

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// Song tempo is the heart rate doubled, the same for every genre: 70 -> 140, 90 -> 180.
// ponytail: x2 is a taste call; the 60..220 clamp only guards against sensor glitches.
export const songBpm = (hr) => clamp(hr * 2, 60, 220);

// Tempo follower. update(drumHeart) -> target BPM.
//   genre default while the drum finger is off or unsettled
//   lock    first settled reading jumps the target to songBpm(hr)
//   follow  then moves for changes of 0.5 BPM or more (fine steps)
//   release finger lifts: back to the genre default
// The caller glides the transport to each new target over 2 bars.
export function createTempo(genreName) {
  const genre = GENRES[genreName]?.tempo;
  if (!genre) throw new RangeError(`Unknown genre: ${genreName}`);
  let target = genre.default;
  let locked = false;
  return function update(drum) {
    if (!drum.on || !drum.settled) {
      locked = false;
      target = genre.default;
    } else {
      const want = songBpm(drum.hr);
      if (!locked || Math.abs(want - target) >= 0.5) target = want;
      locked = true;
    }
    return target;
  };
}
