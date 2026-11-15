// Per-finger heart features for the music. Pure: call the tracker once per frame
// with that finger's `ch` ({ finger, beat, bpm, amp, inst, stable }).
// Returns { on, settled, hr, press, breath }:
//   hr      smoothed heart rate; HR_DEFAULT until settled
//   settled true once the detector calls the BPM stable (signal.js): until then it is still calibrating
//   press   pulse amplitude against this finger's own ~10 s average, 0..1 (0.5 = usual)
//   breath  breathing swing (RSA): (inst - slow hr) / 10, -1..1; 0 until settled

export const HR_DEFAULT = 75;
export const HEART_OFF = Object.freeze({ on: false, settled: false, hr: HR_DEFAULT, press: 0.5, breath: 0 });

const AMP_FLOOR = 20; // keeps press finite when the pulse almost vanishes
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

export function createHeart(rate = 50) {
  const slowA = 1 / (rate * 10); // ~10 s EMA
  let beats, slowAmp, slowHr, breath;
  const reset = () => { beats = 0; slowAmp = null; slowHr = null; breath = 0; };
  reset();

  return function update(ch) {
    if (!ch.finger) {
      reset();
      return HEART_OFF;
    }
    if (ch.beat) beats++;
    // The envelope is still rising before the first beat, so start the average there.
    if (slowAmp === null && beats > 0) slowAmp = Math.max(ch.amp, AMP_FLOOR);
    else if (slowAmp !== null) slowAmp += (ch.amp - slowAmp) * slowA;
    const press = slowAmp === null ? 0.5 : clamp(ch.amp / Math.max(slowAmp, AMP_FLOOR) - 0.5, 0, 1);

    const settled = !!ch.stable && ch.bpm > 0;
    if (!settled) return { on: true, settled, hr: HR_DEFAULT, press, breath: 0 };

    const hr = ch.bpm;
    slowHr = slowHr === null ? hr : slowHr + (hr - slowHr) * slowA;
    // Missed or doubled beats give wild inst values; skip those.
    if (ch.beat && ch.inst > 0.6 * slowHr && ch.inst < 1.6 * slowHr) {
      breath = clamp((ch.inst - slowHr) / 10, -1, 1);
    }
    return { on: true, settled, hr, press, breath };
  };
}
