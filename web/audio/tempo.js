// Song tempo from the drum finger's heart. Pure.
import { GENRES } from './patterns.js';

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// Heart rate 50..110 maps linearly into the selected genre's bounded range.
export function songBpm(hr, genreName) {
  const { min, max } = GENRES[genreName].tempo;
  return min + (max - min) * clamp((hr - 50) / 60, 0, 1);
}

// Tempo follower. update(drumHeart) -> target BPM.
//   genre default while the drum finger is off or unsettled
//   lock    first settled reading jumps the target to songBpm(hr)
//   follow  then moves only for changes of 2 BPM or more
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
      const want = songBpm(drum.hr, genreName);
      if (!locked || Math.abs(want - target) >= 2) target = want;
      locked = true;
    }
    return target;
  };
}
