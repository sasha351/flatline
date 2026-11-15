// Per-channel pulse processing. One step() call per sample.

// ponytail: fixed threshold; tune per sensor/LED power. Raw IR below this = no finger.
// Measured on the Pi's four sensors (LED power 0x1F): no finger reads 500-7,000, and a finger
// reads 45,000-90,000, with sensor 2 at only 45,000-49,000 unless pressed hard. 50000 missed it.
export const FINGER_MIN = 30000;

// The pulse wave (ac) is the reading band-passed to PULSE_LO..PULSE_HI Hz: slower is the finger
// settling and pressure drift, faster is shake and room-light flicker.
const PULSE_LO = 0.7, PULSE_HI = 3.5; // Hz: 42-210 BPM
// One second-order Butterworth section (RBJ cookbook), as a step function.
function biquad(type, f, rate) {
  const w = (2 * Math.PI * f) / rate, c = Math.cos(w), al = Math.sin(w) / Math.SQRT2, a0 = 1 + al;
  const b1 = (type === 'hp' ? -(1 + c) : 1 - c) / a0, b0 = Math.abs(b1) / 2, a1 = (-2 * c) / a0, a2 = (1 - al) / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x) => {
    const y = b0 * (x + x2) + b1 * x1 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
}

// Beat detection follows the middle of the last WINDOW_S seconds of the pulse wave, so
// the reading creeping up while a finger settles doesn't hide beats. A beat is an upward
// crossing of that middle, after the wave has dipped below it, with at least MIN_SWING of
// peak-to-peak swing in the window (below that it's sensor noise, not a pulse).
const WINDOW_S = 1.5;       // must cover one beat: 1.5 s reaches down to 40 BPM
const MIN_SWING = 60;       // ponytail: raw counts; lower it if a weak finger never beats
const REARM = 0.1;          // dip this far (of the swing) below the middle before the next beat
// bpm, first reading: the median of the last BPM_BEATS beats (like the SparkFun example's
// average of recent beats), refined by averaging the beats within 10% of it. A missed or extra
// beat is far from the median and drops out; averaging the rest avoids the steps that
// whole-sample beat intervals give a plain median. It needs two beats that agree, so it is quick
// (about 3 s) but only as good as the beats: it is shown only until the quality filter below locks.
const BPM_BEATS = 15;
function robustBpm(a) {
  const m = [...a].sort((x, y) => x - y)[a.length >> 1];
  const near = a.filter((x) => Math.abs(x - m) <= 0.1 * m);
  return near.length < 2 ? 0 : near.reduce((sum, x) => sum + x, 0) / near.length; // 0: no two beats agree yet
}

// Bad-read filter. A reading that can't be part of a pulse while a finger is on: a brief drop
// below FINGER_MIN (the finger slips, a bus error reads 0), a saturated ADC, or a lone sample far
// off the wave (a bus glitch). It is replaced by the last good reading, for at most HOLD samples:
// anything that lasts longer is real (finger lifted, pressure changed) and goes through. Clean
// readings are never touched, so the filter changes nothing on a clean signal.
const HOLD = 5;                       // ponytail: 100 ms at 50 Hz; tune from logs (tools/analyze-log.mjs)
const SAT = 262000;                   // the 18-bit ADC tops out at 262143
const SPIKE_K = 12, SPIKE_MIN = 3000; // ponytail: a glitch is off the smoothed level by > max(12 swings, 3000 counts)

// Quality filter. A moving finger makes extra and missing beats, so beat-to-beat intervals jump.
// Instead, every EST_S the last RATE_WIN_S seconds of the pulse wave are compared with themselves
// shifted by each possible beat period (autocorrelation). A real pulse repeats, so the right
// period scores high (0.5-0.95 on a still finger); shake, landing and drift don't repeat and
// score low. The score is the quality: a low-quality second never changes the BPM, the last
// good one is held instead. Tuned on four 30 s bare-sensor recordings, two clean and two shaky.
const RATE_WIN_S = 6;      // the wave compared; long enough for four beats at 40 BPM
const EST_S = 0.5;         // how often the BPM is re-estimated
const SETTLE_S = 1.5;      // a landing finger drifts for 1-3 s: this much is left out of the window
const BPM_LO = 40, BPM_HI = 200;
const CYCLES = 4;          // a period must fit this many times in the window to be believed
const Q_LOCK = 0.45;       // ponytail: quality needed for the first lock
const Q_TRACK = 0.25;      // ponytail: once locked, quality needed to follow the rate
const TRACK = 0.15;        // once locked, only a rate within +-15% of the BPM is followed
const SLEW = 2;            // ponytail: and by at most this many BPM per estimate (4 BPM a second)
const Q_JUMP = 0.6, JUMP_N = 6; // a different rate needs this quality JUMP_N estimates running (3 s) to take over
const OCTAVE = 0.8;        // the fastest period scoring within this of the best wins (not its double)

// Normalised autocorrelation of w at each lag in [lo, hi]. r[lag - lo + 1]; one extra lag each side.
function autocorr(w, lo, hi) {
  const m = w.length, r = new Float32Array(hi - lo + 3);
  for (let L = lo - 1; L <= hi + 1; L++) {
    let a = 0, e1 = 0, e2 = 0;
    for (let j = L; j < m; j++) { a += w[j] * w[j - L]; e1 += w[j] * w[j]; e2 += w[j - L] * w[j - L]; }
    r[L - lo + 1] = e1 > 0 && e2 > 0 ? a / Math.sqrt(e1 * e2) : 0;
  }
  return r;
}

export function createChannel(rate = 50, { filter = true } = {}) {
  const lpA = 0.4;                             // light smoothing: the level the bad-read filter compares with
  const envDecay = 1 - 1 / (rate * 2);         // envelope forgets over ~2 s (amp only)
  const refractory = Math.round(rate * 0.3);   // caps at 200 BPM
  const N = Math.round(rate * WINDOW_S);
  const warmup = Math.round(rate * 0.5);       // need some wave before the middle means anything
  const win = new Float32Array(N);
  let dc = null, lp = 0, prevAc = 0, env = 0, n = 0, k = 0, armed = true; // dc: the level the finger landed at
  let lastBeat = -Infinity, bpm = 0, inst = 0, recent = [];
  let hp = null, lpf = null;                   // pulse band-pass, rebuilt for each finger
  // quality filter state: the wave window (a ring), and the lock
  const RN = Math.round(rate * RATE_WIN_S), settle = Math.round(rate * SETTLE_S), every = Math.round(rate * EST_S);
  const lagLo = Math.floor((60 * rate) / BPM_HI), lagHi = Math.ceil((60 * rate) / BPM_LO);
  const ring = new Float32Array(RN), lin = new Float32Array(RN);
  let rn = 0, locked = false, jump = 0, jumpBpm = 0;

  // One estimate from the window: follow the locked rate, take a first lock, or hold.
  function estimate() {
    const m = Math.min(rn, RN), hi = Math.min(lagHi, Math.floor(m / CYCLES));
    if (hi <= lagLo) return;
    const w = lin.subarray(0, m);
    for (let j = 0; j < m; j++) w[j] = ring[(rn - m + j) % RN];
    const r = autocorr(w, lagLo, hi), at = (L) => r[L - lagLo + 1];
    const peak = (L) => at(L) > 0 && at(L) > at(L - 1) && at(L) >= at(L + 1);
    const toBpm = (L) => { // parabola through the peak and its neighbours: finer than one whole sample
      const d = at(L - 1) - 2 * at(L) + at(L + 1);
      return (60 * rate) / (L + (d < 0 ? (at(L - 1) - at(L + 1)) / (2 * d) : 0));
    };
    let best = 0, pick = 0, near = 0;
    for (let L = lagLo; L <= hi; L++) if (peak(L) && at(L) > best) best = at(L);
    for (let L = lagLo; L <= hi && !pick; L++) if (peak(L) && at(L) >= OCTAVE * best) pick = L;
    if (!pick) return;
    if (!locked) {
      if (at(pick) >= Q_LOCK) { locked = true; bpm = toBpm(pick); }
      return;
    }
    const lag = (60 * rate) / bpm;
    for (let L = Math.max(lagLo, Math.ceil(lag / (1 + TRACK))); L <= Math.min(hi, lag * (1 + TRACK)); L++) {
      if (peak(L) && (!near || at(L) > at(near))) near = L;
    }
    if (near && at(near) >= Q_TRACK) bpm += Math.max(-SLEW, Math.min(SLEW, toBpm(near) - bpm));
    // else: hold the last good BPM through shake, drift and landing
    const other = toBpm(pick);
    if (pick !== near && Math.abs(other - bpm) > TRACK * bpm && at(pick) >= Q_JUMP && (!jump || Math.abs(other - jumpBpm) <= TRACK * jumpBpm)) {
      jumpBpm = other;
      if (++jump >= JUMP_N) { bpm = other; jump = 0; }
    } else jump = 0;
  }
  let bad = 0, good = 0, swing = 0;   // filter: run of bad readings, last good reading, last window swing

  return function step(raw) {
    n++;
    let held = false;
    if (filter && dc !== null) {      // a finger is on: screen this reading
      const off = raw < FINGER_MIN, sat = raw >= SAT;
      const spike = !off && !sat && k >= warmup && Math.abs(raw - lp) > Math.max(SPIKE_K * swing, SPIKE_MIN);
      if (off || sat || spike) {
        if (bad < HOLD) { bad++; raw = good; held = true; }
        else if (spike) { lp = raw; bad = 0; } // it lasted: a real level shift, so smoothing restarts there
        // off and sat that last past HOLD go through: the finger lifted, or the sensor really is saturated
      } else bad = 0;
    }
    if (raw < FINGER_MIN) {
      dc = null; env = 0; bpm = 0; inst = 0; recent = []; prevAc = 0; k = 0; armed = true; lastBeat = -Infinity; bad = 0;
      rn = 0; locked = false; jump = 0;
      return { finger: false, ac: 0, beat: false, bpm: 0, amp: 0, inst: 0, held: false, level: 0 };
    }
    if (!held) good = raw;
    if (dc === null) { dc = raw; lp = raw; hp = biquad('hp', PULSE_LO, rate); lpf = biquad('lp', PULSE_HI, rate); }
    lp += (raw - lp) * lpA;
    const ac = -lpf(hp(raw - dc));             // IR dips on each pulse; flip so beats point up
    env = Math.max(Math.abs(ac), env * envDecay);

    win[k++ % N] = ac;
    let hi = -Infinity, lo = Infinity;
    for (let j = 0, m = Math.min(k, N); j < m; j++) {
      if (win[j] > hi) hi = win[j];
      if (win[j] < lo) lo = win[j];
    }
    const mid = (hi + lo) / 2;
    swing = hi - lo;
    if (ac < mid - REARM * swing) armed = true;
    const beat = armed && prevAc < mid && ac >= mid && swing > MIN_SWING
      && k >= warmup && n - lastBeat > refractory;
    if (beat) armed = false;
    prevAc = ac;
    if (beat) {
      if (lastBeat !== -Infinity) {
        inst = (60 * rate) / (n - lastBeat);  // unsmoothed, latest beat only
        recent = [...recent.slice(1 - BPM_BEATS), inst];
        if (!locked) bpm = robustBpm(recent) || bpm; // no agreement: keep what was shown
      }
      lastBeat = n;
    }
    if (k > settle) {
      ring[rn++ % RN] = ac;
      if (rn % every === 0) estimate();
    }
    // amp: pulse envelope (finger pressure). inst: BPM of the latest beat, 0 until two beats.
    // held: this reading was a bad read, replaced by the last good one.
    // level: the lightly smoothed reading; it rises as the finger presses harder (audio/squeeze.js).
    return { finger: true, ac, beat, bpm, amp: env, inst, held, level: lp };
  };
}
