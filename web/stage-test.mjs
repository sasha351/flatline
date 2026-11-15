import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { mergeStep, newField, stepField } from './ui/dynamics.js';

// Drive the real stage loop; only the browser drawing and DOM boundaries are recorded.
const source = readFileSync(new URL('./ui/stage.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '');
function stage(noFluid = false) {
  let now = 0, raf, observer, latest, lane, sizes = [], paths = [], path = [];
  const handlers = {}, media = { matches: false }, loaded = [];
  const element = () => ({ style: {}, children: [], classList: { toggle() {} }, append(...els) { this.children.push(...els); }, getBoundingClientRect: () => ({ width: 1200, height: 800 }) });
  const els = Object.fromEntries(['stage', 'gl', 'text', 'err'].map((id) => [id, element()]));
  const context = new Proxy({
    clearRect() { paths = []; }, beginPath() { path = []; }, lineTo(x, y) { path.push([x, y]); }, stroke() { paths.push(path); },
    createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }),
  }, { get: (o, k) => o[k] ?? (() => {}) });
  els.stage.getContext = () => context;
  const tokens = { '--drums': '#ff3b1f', '--bass': '#1f6bff', '--lead': '#ffd400', '--pad': '#ff2d87', '--num': 'Fraunces, Georgia, serif' };
  const env = { VOICES: ['drums', 'bass', 'lead', 'pad'], mergeStep, newField, stepField,
    on: (name, fn) => { handlers[name] = fn; }, drawLane: (...args) => { lane = args; },
    createFluid: (canvas, colours, fail) => {
      if (noFluid) { fail('No WebGL'); return null; }
      return { resize: (...args) => sizes.push(args), frame: (s) => { latest = structuredClone(s); } };
    },
    document: { getElementById: (id) => els[id], createElement: element, documentElement: {}, fonts: { load: (font) => loaded.push(font) } },
    getComputedStyle: () => ({ getPropertyValue: (name) => tokens[name] ?? '#ffffff' }),
    matchMedia: () => media, performance: { now: () => now }, devicePixelRatio: 3, innerHeight: 800,
    requestAnimationFrame: (fn) => { raf = fn; }, ResizeObserver: class { constructor(fn) { observer = fn; } observe() {} },
  };
  runInNewContext(source, env); observer();
  return { els, media, env, loaded, sizes, get latest() { return latest; }, get lane() { return lane; }, get paths() { return paths; },
    tick(ms) { now = ms; raf(ms); }, send(ms, ch) { now = ms; handlers.frame({ ch }); }, note: (voice) => handlers.note({ voice }), sensor: (i) => handlers.sensor(i) };
}
const ch = (beat = false, finger = true, bpm = 72, ac = 100) => ({ finger, beat, bpm, ac, amp: 100, inst: bpm, stable: bpm > 0 });
const s = stage(); s.tick(16);
assert.equal(s.els.text.children.length, 8, 'BPM and label use the DOM');
assert.equal(s.loaded[0], '10px Fraunces, Georgia, serif');
assert.deepEqual(s.sizes.at(-1), [1200, 800, 2], 'DPR is capped');
s.env.devicePixelRatio = 1.5; s.tick(17);
assert.deepEqual(s.sizes.at(-1), [1200, 800, 1.5], 'DPR changes resize both canvases');
s.sensor(0); s.send(20, [ch(true), ch(false, true, 0, 1000), ch(), ch()]);
s.send(25, [ch(false, true, 72, -100), ch(false, true, 0, -1000), { ...ch(), stable: false }, ch()]); s.tick(32);
assert.equal(s.els.text.children[0].textContent, 72);
assert.equal(s.els.text.children[1].textContent, 'drums · bpm · sensor');
assert.equal(s.els.text.children[2].textContent, '00', 'a calibrating BPM is a ghost, not a number');
assert.equal(s.els.text.children[3].textContent, 'bass · finding your pulse');
assert.equal(s.els.text.children[4].textContent, '00', 'a BPM that is not stable yet stays hidden');
assert.ok(s.latest.flash[0] > .95, 'beat survives an intervening non-beat frame');
assert.equal(s.paths[0].length, 2);
assert.equal(s.paths[0][0][1], s.paths[1][0][1], 'each trace uses its own maximum');
assert.ok(s.paths[0][0][0] < s.paths[0][1][0], 'newest sample is on the right');
const flash = s.latest.flash[0]; s.tick(48);
assert.ok(s.latest.flash[0] < flash, 'latched beat is consumed once');
s.note('unknown'); s.note('pad'); s.tick(64);
assert.ok(s.latest.state[14] > 0, 'notes ripple on their voice');
s.media.matches = true; s.send(70, [ch(true), ch(), ch(), ch()]); s.tick(80);
assert.equal(s.latest.rm, true); assert.equal(s.latest.state[0], 0); assert.equal(s.latest.state[1], 0); assert.equal(s.latest.state[2], 0);
assert.ok(s.latest.lift[0] > .85, 'live reduced motion uses brightness lift');
s.media.matches = false;
for (let ms = 100; ms <= 2300; ms += 16) { s.send(ms, [ch(), ch(), ch(), ch()]); s.tick(ms); }
assert.ok(s.latest.blobs[14] > 100, 'four ready channels merge');
assert.equal(s.latest.dye.x, 600); assert.equal(s.latest.dye.y, 304);
s.tick(3000);
assert.equal(s.els.text.children[0].textContent, '--', 'stale readings lose their BPM');
assert.equal(s.els.text.children[1].textContent, 'rest a finger on sensor 1', 'stale route suffix disappears');
s.send(3010, [ch(false, false), ch(), ch(), ch()]); s.tick(3020);
s.send(3030, [ch(false, true, 72, 1), ch(), ch(), ch()]);
s.send(3040, [ch(false, true, 72, -1), ch(), ch(), ch()]);
for (let ms = 3050; ms <= 7000; ms += 16) { s.send(ms, [ch(false, true, 0, 1), ch(), ch(), ch()]); s.tick(ms); }
assert.equal(s.latest.blobs[14], 0, 'missing readiness eventually splits the layout');
assert.ok(s.paths[0].length <= 200, 'trace ring remains bounded');
const reset = stage(); reset.tick(16);
const one = (c) => [c, ch(false, false), ch(false, false), ch(false, false)];
reset.send(20, one(ch(true, true, 0, 1000)));
reset.send(21, one(ch(false, false))); reset.tick(32);
assert.equal(reset.latest.flash[0], 0, 'lifting cancels an unconsumed beat');
reset.send(40, one(ch(false, true, 0, 1))); reset.send(50, one(ch(false, true, 0, -1))); reset.tick(64);
assert.equal(reset.paths[0].length, 2, 'lifting clears the previous trace');
assert.equal(reset.paths[0][0][1], 590.4, 'lifting resets the channel scale');
reset.tick(600);
assert.equal(reset.paths.length, 0, 'stale traces disappear');
reset.send(610, one(ch(false, true, 0, 2))); reset.send(620, one(ch(false, true, 0, -2))); reset.tick(632);
assert.equal(reset.paths[0].length, 2, 'stale gap clears the previous trace');
assert.equal(reset.paths[0][0][1], 590.4, 'stale gap resets the channel scale');
const fallback = stage(true); fallback.tick(16); fallback.send(20, [ch(), ch(), ch(), ch()]); fallback.tick(32);
assert.equal(fallback.els.err.textContent, 'No WebGL');
assert.equal(fallback.els.text.children[0].textContent, 72, 'text survives unavailable WebGL');
assert.equal(fallback.lane[1].y, 672, 'lane survives unavailable WebGL');
console.log('stage integration self-check ok');
