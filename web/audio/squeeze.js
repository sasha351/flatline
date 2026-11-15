// Experimental (?squeeze): how hard a finger presses, from the light level alone. Pure: call once
// per frame with that finger's `ch` ({ finger, level }). Returns 0 (resting touch) .. 1 (hard).
//
// Pressing harder flattens the fingertip onto the chip and squeezes blood out from under it, so
// more of the LED's light comes back: +12% (sensor 1), +13-18% (2), +7% (3) from a light to a hard
// press in the 2026-11-14 press log. The level is proportional to LED current (~14,000 counts per
// mA in the LED test), so "how much less current would hold the level steady" is the same number:
// equivalent mA = LED mA * base / level. The level is read instead of moving the current because
// the chip's current steps are 0.2 mA, about 3,000 counts: three steps across the whole range.
//
// base is this press's lightest level: it drops at once when the finger eases off, and creeps up
// over LEAK_S so slow drift (and a squeeze held for a long time) becomes the new resting touch.
// ponytail: tuned on four bare-sensor recordings (light, comfortably hard, light; one per sensor,
// 2026-11-14): the comfortable hard press raised the level by 17-25%, and a light touch held
// "still" wandered by up to about 5%.
export const SQUEEZE_RANGE = 0.15; // level rise over base that counts as a full squeeze
export const SQUEEZE_DEAD = 0.04;  // rise that is still a resting touch
const SETTLE_S = 2;                // a landing finger's level climbs for 1-3 s: not a squeeze
const SMOOTH_S = 0.15;             // takes the edge off the pulse (up to 1.6% of the level, inside the dead zone anyway)
const LEAK_S = 30;                 // ponytail: seconds for base to catch up with a held level (at 20 a held squeeze lost a third in 10 s)
// base must not chase a dip: a finger rocking or half lifting for a moment (common while another
// finger of the same hand squeezes) would drop it, and the normal level then reads as a full
// squeeze for a minute. The level has to stay under base for LOW_S before base moves down to it.
const LOW_S = 1.5;
const MAX_RISE = 1.35;             // the hardest press measured was +25%: a base further below the level than this was a bad reading
// Changing grip often breaks contact for a moment (0.2 s when going from light to hard in the
// 2026-11-14 bare-sensor test). A gap up to GAP_S keeps the resting level, so re-landing harder
// still reads as a squeeze; the first RESETTLE_S back on the chip can't lower it.
const GAP_S = 1, RESETTLE_S = 0.5;

export function createSqueeze(rate = 50) {
  const a = 1 / (rate * SMOOTH_S), leak = 1 / (rate * LEAK_S);
  const settle = Math.round(rate * SETTLE_S), resettle = Math.round(rate * RESETTLE_S), gap = Math.round(rate * GAP_S);
  const hold = Math.round(rate * LOW_S);
  let n = 0, off = 0, low = 0, s = 0, base = 0; // base 0: no resting level yet
  return function update(ch) {
    if (!ch.finger || !(ch.level > 0)) {
      n = low = 0;
      if (++off > gap) base = 0;      // a real lift: the next press starts fresh
      return 0;
    }
    off = 0;
    s = n ? s + (ch.level - s) * a : ch.level;
    n++;
    if (!base) {                      // fresh press: wait out the landing, then this is the resting level
      if (n < settle) return 0;
      base = s;
    } else if (n >= resettle) {       // (just back from a slip: base is left alone while the level climbs back)
      if (s < base) { if (++low > hold) base = s; }
      else { low = 0; base += (s - base) * leak; }
    }
    base = Math.max(base, s / MAX_RISE);
    return Math.min(1, Math.max(0, (s / base - 1 - SQUEEZE_DEAD) / (SQUEEZE_RANGE - SQUEEZE_DEAD)));
  };
}

// Voice gain for a squeeze: the hardest touch is 8x a resting one, and plays at the normal level.
// Nothing goes over normal: the voices share the master compressor and limiter, so a voice boosted
// past it gets squashed and pulls the others down with it (two fingers squeezing at once then
// cancel each other out).
const G_REST = 0.125, G_HARD = 1;  // ponytail: resting and hardest voice level
export const squeezeGain = (x) => G_REST * (G_HARD / G_REST) ** x; // even steps in dB
