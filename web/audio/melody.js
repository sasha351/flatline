// Personal lead-voice motif from the heart: a seeded random walk over scale
// degrees (0..9), plus A A' A B development per phrase. Pure, no Math.random.

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Snap the last sounding note to the nearest of root / 5th / octave root.
function resolve(m) {
  const i = m.findLastIndex((d) => d !== null);
  if (i >= 0) m[i] = [0, 4, 5].reduce((b, c) => (Math.abs(c - m[i]) < Math.abs(b - m[i]) ? c : b));
  return m;
}

export function makeMotif(seed, heart) {
  const r = rng(seed);
  const leap = clamp((heart.hr - 55) / 50, 0, 0.4);
  const bias = Math.sign(heart.breath);
  let d = 2 + Math.floor(r() * 6);
  const m = [d];
  for (let i = 1; i < 16; i++) {
    const size = r() < leap ? 3 + Math.floor(r() * 2) : 1 + Math.floor(r() * 2);
    let dir = r() < 0.5 ? -1 : 1;
    const pull = r() < 0.7; // always drawn so the stream stays aligned
    if (i < 8 && bias && pull) dir = bias;
    d = clamp(d + dir * size, 0, 9);
    m.push(r() < 0.15 ? null : d);
  }
  return resolve(m);
}

export function develop(motif, phrase, seed, heart) {
  if (phrase % 4 === 0) return [...motif];
  const r = rng((seed + phrase) >>> 0);
  const first = motif.find((d) => d !== null);
  const shift = (1 + Math.floor(r() * 2)) * (heart.breath >= 0 ? 1 : -1);
  const pick = Math.floor(r() * 3);
  let m = [...motif];
  if (pick === 2) m.reverse();
  else m = m.map((d) => (d === null ? null : clamp(pick === 0 ? d + shift : 2 * first - d, 0, 9)));
  if (heart.press > 0.7) {
    let prev = first;
    m = m.map((d) => (d === null ? prev : (prev = d)));
  } else if (heart.press < 0.3) {
    const idx = m.map((d, i) => (d !== null && i > 0 ? i : -1)).filter((i) => i >= 0);
    if (idx.length > 1) m[idx[Math.floor(r() * idx.length)]] = null; // keep >=1 sounding
  }
  return resolve(m);
}
