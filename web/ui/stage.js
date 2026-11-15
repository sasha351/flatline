// One animation loop drives the fluid, pulse traces, DOM labels and notes lane.
import { on, VOICES } from '../bus.js';
import { drawLane } from './lane.js';
import { mergeStep, newField, stepField } from './dynamics.js';
import { createFluid } from './fluid.js';

const N = 200;          // ring buffer: ~4 s of frames at 50 Hz
const STALE_MS = 500;   // no frame for this long = treat every channel as no finger
const SLIDE_S = 1.6;    // assign <-> merged transition
// blob body radii, in u (1% of app height); the window behind each body is WINDOW_K times its body radius
const ASSIGN_R_MAX = 7.92, ASSIGN_R_COL = .176;   // assigning state: at most this many u, and at most this fraction of a column width
const ROW_R = 3.52, MERGED_R = 13.2;              // bottom row blobs; the big merged blob
const WINDOW_K = 1.67;                            // window radius / body radius (body is 12% smaller than before, windows unchanged)
const PRES_TAU = .25;                             // seconds: finger presence easing
const rm = matchMedia('(prefers-reduced-motion: reduce)'); // live: .matches is read each frame
const lerp = (a, b, k) => a + (b - a) * k, clamp01 = (x) => Math.min(1, Math.max(0, x));
const ease = (x) => (x < .5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);

const $ = (id) => document.getElementById(id);
const cv = $('stage'), c = cv.getContext('2d'), text = $('text');
const css = getComputedStyle(document.documentElement);
const tok = (name) => css.getPropertyValue(name).trim();
// shortcut: tokens are 6-digit hex, parse more formats if style.css changes that.
const hex3 = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
const COLS = VOICES.map((v) => tok(`--${v}`));
const COL = { other: tok('--other'), text: tok('--text'), muted: tok('--muted'), line: tok('--line'), serif: tok('--num') };
COL.v = Object.assign(Object.create(null), ...VOICES.map((v, i) => ({ [v]: COLS[i] }))); // unknown voices fall back to --other
COL.lead = COL.v.lead;
document.fonts.load(`10px ${COL.serif}`); // roman Fraunces isn't used by the DOM, so ask for it
const fluid = createFluid($('gl'), COLS.map(hex3), (msg) => { $('err').textContent = msg; });

const P = VOICES.map(() => ({ buf: new Float32Array(N), head: 0, count: 0, max: 1, field: newField(), beat: false, pres: 0, m: 0, cx: 0, bump: false }));
// DOM writes only when the value changes: a write, even of the same text, makes the browser redo style and
// layout that frame, and time lost on this thread is time the audio scheduler does not get.
const put = (target, key, value) => { if (target[key] !== value) target[key] = value; };
const els = P.map(() => { // per-player text: BPM and label
  const bpm = document.createElement('div'), lab = document.createElement('div');
  bpm.className = 'bpm'; lab.className = 'lab'; text.append(bpm, lab);
  return { bpm, lab };
});
const UB = new Float32Array(15), US = new Float32Array(16), ULf = new Float32Array(4), UFl = new Float32Array(4);
let sensorCh = null; // ?fill=sim debugging: the voice the real sensor plays
on('sensor', (s) => (sensorCh = s));
on('note', (n) => {
  const i = VOICES.indexOf(n.voice);
  if (i >= 0) P[i].field.rip = 1;
});

function reset(p) {
  p.count = 0; p.max = 1; p.beat = false; p.field = newField();
}
// Frames only update state; a beat stays latched until the animation loop consumes it.
let frame = null, frameAt = -1e9;
on('frame', (f) => {
  const now = performance.now(), gap = now - frameAt > STALE_MS;
  frame = f; frameAt = now;
  for (let i = 0; i < P.length; i++) {
    const p = P[i], ch = f.ch?.[i];
    if (gap || !ch?.finger) reset(p); // fresh scale and field for a new finger
    if (!ch?.finger) continue;
    p.buf[p.head] = ch.ac;
    p.head = (p.head + 1) % N;
    p.count = Math.min(N, p.count + 1);
    let m = 1; // floor: a flat signal shouldn't divide by zero
    for (let k = 1; k <= p.count; k++) m = Math.max(m, Math.abs(p.buf[(p.head - k + N) % N]));
    p.max = m;
    if (ch.beat) p.beat = true;
  }
});

let W = 0, H = 0, dpr = 1, u = 1;
function resize() {
  dpr = Math.min(devicePixelRatio || 1, 2);
  const b = cv.getBoundingClientRect();
  W = b.width; H = b.height; u = H / 100;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  fluid?.resize(W, H, dpr);
}
new ResizeObserver(resize).observe(cv);

function overlay(now, fade) {
  c.clearRect(0, 0, W, H);
  c.lineJoin = c.lineCap = 'round';
  const colW = W / 4, tw = colW * .56, mid = 77 * u, amp = 3.2 * u;
  P.forEach((p, i) => {
    const a = p.pres * (1 - p.m) * fade;
    if (a < .01 || p.count < 2) return;
    const x0 = p.cx - tw / 2, g = c.createLinearGradient(x0, 0, x0 + tw, 0);
    g.addColorStop(0, COLS[i] + '00'); g.addColorStop(.6, COLS[i] + 'b0'); g.addColorStop(1, COLS[i]);
    c.globalAlpha = a; c.strokeStyle = g; c.lineWidth = Math.max(1.5, .35 * u);
    c.beginPath();
    for (let k = p.count - 1; k >= 0; k--) { // newest sample at the right, scaled by this channel's own max
      c.lineTo(x0 + tw - (k / (N - 1)) * tw, mid - (p.buf[(p.head - 1 - k + N) % N] / p.max) * amp);
    }
    c.stroke();
  });
  c.globalAlpha = 1;
  drawLane(c, { x: 0, y: 84 * u, w: W, h: 16 * u }, now, u, dpr, COL);
}

let st = { merged: false, upAt: null }, prog = 0, prev = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const t = now / 1000, dt = Math.min(.033, Math.max(0, t - prev)); prev = t;
  if (Math.min(devicePixelRatio || 1, 2) !== dpr) resize(); // moved to a screen with another pixel ratio
  if (!W || !H) return;
  const live = frame && now - frameAt < STALE_MS, reduced = rm.matches;
  const down = P.map((p, i) => !!(live && frame.ch?.[i]?.finger));
  const ready = down.map((d, i) => d && frame.ch[i].bpm > 0); // shown as soon as there is a BPM (core.js), same as the OLED
  P.forEach((p, i) => {
    if (!live) reset(p);
    p.pres += (+down[i] - p.pres) * (1 - Math.exp(-dt / PRES_TAU));
    p.bump = p.beat; p.beat = false;
    stepField(p.field, p.bump, dt);
  });
  st = mergeStep(st, ready, now);
  const step_ = dt / (reduced ? .5 : SLIDE_S);
  prog = clamp01(prog + Math.min(step_, Math.max(-step_, +st.merged - prog)));
  const fade = reduced ? Math.abs(2 * prog - 1) : 1; // reduced motion: cross-fade between the two layouts, no slide

  const colW = W / 4, RA = Math.min(colW * ASSIGN_R_COL, ASSIGN_R_MAX * u), RS = ROW_R * u, RB = MERGED_R * u;
  const RW = RB * WINDOW_K, TXO = RS * WINDOW_K + 2.4 * u;   // window radius of the big one; text offset right of a row blob
  const big = reduced ? +(prog > .5) : ease(clamp01((prog - .35) / .65));
  P.forEach((p, i) => {
    const f = p.field, m = reduced ? +(prog > .5) : ease(clamp01((prog - i * .07) / .79)); // the four leave one after another
    const cx = colW * (i + .5), bx = cx - 5 * u, x = lerp(cx, bx, m), y = lerp(37 * u, 74 * u, m), Rr = lerp(RA, RS, m);   // assign column centre -> row slot; y in u
    const top = lerp(13, 62, m) * u, bot = lerp(56, 81, m) * u, cy = Math.min(Math.max(y, top + Rr), bot - Rr), sc = lerp(.6, 1, p.pres);   // sc: body grows with presence
    UB.set([x * dpr, (H - cy) * dpr, Rr * sc * dpr], i * 3);
    US.set([reduced ? 0 : Math.max(f.F, 0), reduced ? 0 : Math.max(f.L, 0), reduced ? 0 : f.rip, p.pres], i * 4); ULf[i] = reduced ? f.lift : 0; UFl[i] = reduced ? 0 : f.fl;
    const e = els[i], tx = lerp(cx, bx + TXO, m), sh = `translate(${-50 * (1 - m)}%, -50%)`;
    const ghost = down[i] && !ready[i]; // finger on, no BPM yet: a shimmering placeholder, no number (style.css .ghost)
    put(e.bpm, 'textContent', ready[i] ? Math.round(frame.ch[i].bpm) : ghost ? '00' : '--');
    e.bpm.classList.toggle('off', !down[i]);
    e.bpm.classList.toggle('ghost', ghost);
    const label = (ready[i] ? `${VOICES[i]} · bpm` : ghost ? `${VOICES[i]} · finding your pulse` : `rest a finger on sensor ${i + 1}`) + (live && i === sensorCh ? ' · sensor' : '');
    put(e.lab, 'textContent', label);
    const place = (el, top, size) => { put(el.style, 'left', `${tx}px`); put(el.style, 'top', `${top * u}px`); put(el.style, 'fontSize', `${size * u}px`); put(el.style, 'transform', sh); };
    place(e.bpm, lerp(62, 73, m), lerp(9, 4.4, m));
    place(e.lab, lerp(69, 76.8, m), lerp(2.1, 1.7, m));
    p.m = m; p.cx = cx;
  });
  const Rg = RB * big, cyB = Math.min(Math.max(38 * u, 13 * u + Rg), 62 * u - Rg);   // merged blob centre y, kept inside its band
  UB.set([W / 2 * dpr, (H - cyB) * dpr, big > .02 ? Rg * dpr : 0], 12);
  const dye = prog <= .05 ? null : { x: W / 2, y: 38 * u, cyB, RW, big, bumps: P.map((p) => p.bump) };
  fluid?.frame({ t, dt, fade, rm: reduced, blobs: UB, state: US, lift: ULf, flash: UFl, dye });
  put(text.style, 'opacity', String(fade));
  overlay(now, fade);
}
requestAnimationFrame(loop);
