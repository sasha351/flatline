import assert from 'node:assert/strict';
import { isButton, parseLine, simChannels, simFill, simSensors, simTapped } from './serial.js';

assert.deepEqual(parseLine('1,2,3,4'), [1, 2, 3, 4]);
assert.deepEqual(parseLine('100000,0,262143,5\r'), [100000, 0, 262143, 5]);
assert.equal(parseLine('1,2,3'), null);       // too few
assert.equal(parseLine('1,2,,4'), null);      // empty field
assert.equal(parseLine('3,4\n1,2'), null);    // partial / garbage
assert.equal(parseLine(''), null);
assert.equal(parseLine('b'), null);         // the Pi's button line is not a frame
assert.ok(isButton('b') && isButton('b\r') && !isButton('1,2,3,4') && !isButton(''));
{
  // simFill: zeros (missing sensors) become simulated pulses, real values pass through
  const out = [];
  const fill = simFill((r) => out.push(r));
  for (let i = 0; i < 50; i++) fill([123456, 0, 0, 7]);
  assert.ok(out.every((r) => r[0] === 123456 && r[3] === 7));
  assert.ok(out.every((r) => r[1] > 99000 && r[1] < 101000 && r[2] > 99000));
  assert.ok(new Set(out.map((r) => r[1])).size > 10); // it actually pulses
}
{
  // simFill with a route: the connected sensor's value moves there, the rest are simulated
  const out = [];
  let to = 2;
  const fill = simFill((r) => out.push(r), () => to);
  for (let i = 0; i < 50; i++) fill([123456, 0, 0, 0]);
  assert.ok(out.every((r) => r[2] === 100000 && r[1] > 99000 && r[3] > 99000)); // steady real value re-centred
  to = 3;
  fill([1000, 0, 0, 0]);                 // finger off still routes (reads low, not 0)
  assert.equal(out.at(-1)[3], 1000);
  fill([0, 0, 0, 0]);                    // no sensor at all: the routed voice reads 0
  assert.equal(out.at(-1)[3], 0);
}
{
  // Switching the routed voice: no level jump on either side, and the beat detector on
  // the newly routed voice keeps beating and keeps a BPM (no re-settling ramp).
  let to = 2;
  const out = [];
  const fill = simFill((r) => out.push(r), () => to);
  const real = (i) => Math.round(123000 - 300 * Math.sin((2 * Math.PI * 1.1 * i) / 50)); // 66 BPM, own DC
  for (let i = 0; i < 50 * 8; i++) fill([real(i), 0, 0, 0]);
  to = 1;                                // bass was simulated, now gets the real pulse
  for (let i = 50 * 8; i < 50 * 20; i++) fill([real(i), 0, 0, 0]);
  const near = (v) => Math.abs(v - 100000) < 1200;
  assert.ok(out.slice(50 * 2).every((r) => near(r[1]) && near(r[2]) && near(r[3])), 'no DC jump');
  const ch = createChannel(50);
  let beatsAfter = 0, bpmGap = false, s;
  out.forEach((r, i) => {
    s = ch(r[1]);
    if (i > 50 * 8 && i < 50 * 10 && s.bpm === 0) bpmGap = true;
    if (i >= 50 * 8 && i < 50 * 11 && s.beat) beatsAfter++;
  });
  assert.ok(!bpmGap, 'bpm carried over the switch');
  assert.ok(beatsAfter >= 2, `beats in the 3 s after switching: ${beatsAfter}`);
  assert.ok(Math.abs(s.bpm - 66) < 4, `bpm settles on the real heart: ${s.bpm}`);
}
console.log('serial ok');

import { createChannel } from './signal.js';

{
  // 72 BPM synthetic pulse with deterministic noise, 20 s at 50 Hz
  let seed = 1;
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 100;
  const ch = createChannel(50);
  let beats = 0, s;
  for (let i = 0; i < 50 * 20; i++) {
    s = ch(Math.round(100000 - 400 * Math.sin((2 * Math.PI * 1.2 * i) / 50) + noise()));
    if (i >= 50 * 10 && s.beat) beats++;
  }
  assert.ok(s.finger);
  assert.ok(Math.abs(s.bpm - 72) < 3, `bpm ${s.bpm}`);
  assert.ok(Math.abs(s.inst - 72) < 8, `inst ${s.inst}`); // unsmoothed, so looser
  assert.ok(s.amp > 100 && s.amp < 600, `amp ${s.amp}`);  // pulse is +-400
  assert.ok(beats >= 11 && beats <= 13, `beats in last 10 s: ${beats}`); // expect 12
}
{
  // no finger: never beats, bpm stays 0
  const ch = createChannel(50);
  for (let i = 0; i < 200; i++) {
    const s = ch(1000);
    assert.ok(!s.finger && !s.beat && s.bpm === 0);
  }
}
{
  // bad-read filter: a 72 BPM pulse with noise, run through filtered and unfiltered channels
  let seed = 7;
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 100;
  const wave = Array.from({ length: 50 * 30 }, (_, i) => Math.round(100000 - 400 * Math.sin((2 * Math.PI * 1.2 * i) / 50) + noise()));
  const run = (raws, filter) => { const ch = createChannel(50, { filter }); return raws.map((r) => ch(r)); };

  // clean signal: the filter changes nothing at all
  const on = run(wave, true), off = run(wave, false);
  assert.ok(on.every((s, i) => !s.held && s.ac === off[i].ac && s.beat === off[i].beat && s.bpm === off[i].bpm), 'filter is a no-op on clean data');

  const at = 50 * 20; // glitches land 20 s in, after the BPM has locked
  const bpmAfter = (out) => out[at + 50].bpm;
  // a 2-sample drop to "no finger" (a slip or a bus error reading 0): unfiltered loses the BPM
  const drop = wave.map((r, i) => (i === at || i === at + 1 ? 0 : r));
  assert.equal(bpmAfter(run(drop, false)), 0);
  const d = run(drop, true);
  assert.ok(d[at].held && d[at].finger && Math.abs(bpmAfter(d) - 72) < 3, `drop held, bpm ${bpmAfter(d)}`);
  // a lone spike far off the wave, and a saturated reading: held, BPM unaffected
  for (const bad of [wave[at] + 60000, 262143]) {
    const g = run(wave.map((r, i) => (i === at ? bad : r)), true);
    assert.ok(g[at].held && !g[at + 1].held && Math.abs(bpmAfter(g) - 72) < 3, `glitch ${bad} held`);
  }
  // a real lift (stays low) still reads as no finger, 100 ms late at most
  const lift = run(wave.map((r, i) => (i >= at ? 1000 : r)), true);
  assert.ok(lift[at + 5].finger === false && lift[at + 5].bpm === 0, 'real lift goes through');
  // a pressure change within 12 swings (+8000 on a +-400 pulse) is not a glitch: never held
  assert.ok(run(wave.map((r, i) => (i >= at ? r + 8000 : r)), true).every((s) => !s.held), 'moderate shift untouched');
  // a big jump that stays (+20000) is held for HOLD samples, then accepted; beats come back
  const shift = run(wave.map((r, i) => (i >= at ? r + 20000 : r)), true);
  assert.ok(shift[at].held && shift[at + 4].held && !shift[at + 5].held && !shift[at + 6].held, 'big shift passes after HOLD');
  assert.ok(shift.slice(at + 50 * 4).some((s) => s.beat) && Math.abs(shift.at(-1).bpm - 72) < 3, `beats after shift, bpm ${shift.at(-1).bpm}`);
}
{
  // Quality filter, on real recordings: 30 s each from the four bare sensors, one finger held on
  // (testdata/bare-sensors.json, IR only). Touches 2 and 4 are clean, 1 and 3 are shaky. The heart
  // was at 75-80 throughout. Before the filter the BPM shown ranged 53-107, 68-154, 34-107 and 67-97.
  const { readFileSync } = await import('node:fs');
  const bare = JSON.parse(readFileSync(new URL('./testdata/bare-sensors.json', import.meta.url)));
  const shown = (raws, from) => { const ch = createChannel(50); return raws.map((r) => ch(r).bpm).slice(50 * from); };
  const within = (name, from, lo, hi) => {
    const b = shown(bare[name], from), min = Math.min(...b), max = Math.max(...b);
    assert.ok(min >= lo && max <= hi, `${name}: bpm ${min.toFixed(0)}-${max.toFixed(0)} after ${from} s, want ${lo}-${hi}`);
  };
  within('touch2-sensor1', 8, 74, 85);   // clean
  within('touch4-sensor2', 5, 68, 80);   // clean
  within('touch3-sensor3', 5, 70, 84);   // shaky: was reading 48
  within('touch1-sensor4', 4, 65, 95);   // too shaky to lock: the fallback, steadier than before
  for (const name in bare) assert.ok(shown(bare[name], 0)[50 * 5] > 0, `${name}: a BPM within 5 s`);

  // Synthetic: a locked 72 BPM pulse, then 6 s of shaking far larger than the pulse. The BPM holds.
  let seed = 3;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5;
  let wob = 0;
  const ch = createChannel(50), out = [];
  for (let i = 0; i < 50 * 30; i++) {
    const shake = i >= 50 * 14 && i < 50 * 20;
    wob = shake ? wob * 0.9 + rnd() * 1500 : wob * 0.9;   // smoothed noise: lands in the pulse band
    out.push(ch(Math.round(100000 - 400 * Math.sin((2 * Math.PI * 1.2 * i) / 50) + rnd() * 100 + wob)).bpm);
  }
  const during = out.slice(50 * 14, 50 * 22), after = out.at(-1);
  assert.ok(during.every((b) => Math.abs(b - 72) < 4), `bpm held through a shake: ${Math.min(...during).toFixed(1)}-${Math.max(...during).toFixed(1)}`);
  assert.ok(Math.abs(after - 72) < 2, `bpm after the shake: ${after}`);

  // A heart that really changes rate is followed: 66 -> 96 BPM in one step takes over within 10 s.
  const ch2 = createChannel(50);
  let ph = 0, b2 = 0;
  for (let i = 0; i < 50 * 30; i++) {
    ph += (2 * Math.PI * (i < 50 * 15 ? 1.1 : 1.6)) / 50;
    b2 = ch2(Math.round(100000 - 400 * Math.sin(ph) + rnd() * 100)).bpm;
    if (i === 50 * 15 - 1) assert.ok(Math.abs(b2 - 66) < 2, `locked at 66: ${b2}`);
    if (i === 50 * 25) assert.ok(Math.abs(b2 - 96) < 3, `followed to 96: ${b2}`);
  }
}
console.log('signal ok');

import { fields, note } from './audio/mapping.js';

assert.deepEqual(fields((10 << 10) | (6 << 6) | (5 << 3) | 3, [3, 3, 4, 4]), [3, 5, 6, 10]);
assert.equal(note(0, 0), 45);   // A2
assert.equal(note(5, 0), 57);   // wraps to next octave: A3
assert.equal(note(7, 1), 74);   // index 7 = octave+1, degree 2 (D)
console.log('mapping ok');

import { createHeart, HR_DEFAULT } from './audio/heart.js';

{
  // heart: breath follows a +-6 BPM breathing sine on a 70 BPM heart; press tracks amp
  const heart = createHeart(50);
  let t = 0, nextBeat = 0, s, prevBeat = 0, amp = 300, pressBefore, pressAfter;
  const swing = [];
  for (let i = 0; i < 50 * 60; i++, t += 0.02) {
    if (i === 50 * 50) amp = 450;                                  // press harder for the last 10 s
    const rateNow = 70 + 6 * Math.sin((2 * Math.PI * t) / 4);
    const beat = t >= nextBeat;
    let inst = 0;
    if (beat) { inst = prevBeat ? 60 / (t - prevBeat) : 0; prevBeat = t; nextBeat = t + 60 / rateNow; }
    s = heart({ finger: true, beat, bpm: i > 100 ? 70 : 0, amp, inst, stable: i > 200 });
    if (beat && i > 50 * 20 && i < 50 * 50) swing.push([rateNow, s.breath]);
    if (i === 50 * 50 - 1) pressBefore = s.press;
    if (i === 50 * 51) pressAfter = s.press;          // 1 s after pressing harder
    if (i === 50 || i === 150) assert.ok(!s.settled && s.hr === HR_DEFAULT && s.breath === 0); // no BPM yet; then a BPM still calibrating
  }
  assert.ok(s.settled && s.hr === 70);
  const hi = Math.max(...swing.map(([, br]) => br)), lo = Math.min(...swing.map(([, br]) => br));
  assert.ok(hi > 0.4 && hi < 0.8 && lo < -0.4 && lo > -0.8, `breath range ${lo}..${hi}`);
  const corr = swing.reduce((a, [r, br]) => a + (r - 70) * br, 0);
  assert.ok(corr > 0, 'breath has the same sign as the rate swing');
  assert.ok(Math.abs(pressBefore - 0.5) < 0.05, `steady press ${pressBefore}`);
  assert.ok(pressAfter > 0.9, `press after pressing harder: ${pressAfter}`);
  assert.ok(s.press < pressAfter, 'press re-centres as the slow average adapts');
  assert.equal(heart({ finger: false }).on, false);
  assert.equal(heart({ finger: true, beat: false, bpm: 70, amp: 300, inst: 70, stable: false }).settled, false); // a new finger calibrates again

}
console.log('heart ok');

import { on } from './bus.js';
import { start, standInBpms } from './core.js';

{
  let got = null;
  const status = [];
  on('frame', (d) => (got = d));
  on('status', (s) => status.push(s)); // sticky: replays 'idle' right away
  await start((onFrame) => { onFrame([100000, 0, 0, 0]); return async () => {}; });
  assert.deepEqual(got.raws, [100000, 0, 0, 0]);
  assert.equal(got.ch.length, 4);
  assert.ok(got.ch[0].finger && !got.ch[1].finger);
  assert.deepEqual(Object.keys(got.ch[0]).sort(), ['ac', 'amp', 'beat', 'bpm', 'finger', 'held', 'inst', 'stable']);
  assert.deepEqual(status, ['idle', 'running']);
}
{
  // a stand-in heartbeat (clicked blob) runs at about the real finger's BPM, not a rate of its own
  const { simTapped: wrap } = await import('./serial.js');
  const { emit } = await import('./bus.js');
  let frame = null, tappedNow = [];
  on('frame', (d) => (frame = d));
  on('tapped', (t) => (tappedNow = t));
  globalThis.location = { search: '' };
  emit('tap', 1);
  assert.deepEqual(tappedNow, [], 'no ?standin: a click starts nothing');
  globalThis.location = { search: '?standin=2' };
  let feed;
  await start((onFrame) => { feed = onFrame; return async () => {}; });
  emit('tap', 1);
  assert.deepEqual(tappedNow, [false, true, false, false]);
  // drive it the way the connect handler does: real finger at 92 BPM on sensor 1, a stand-in on sensor 2
  const viaStandIn = wrap(feed, standInBpms);
  assert.deepEqual(standInBpms(), [0, 73, 0, 0], 'before any real reading: the starting rate');
  for (let i = 0; i < 50 * 40; i++) viaStandIn([Math.round(100000 - 400 * Math.sin((i * 2 * Math.PI * 92) / 60 / 50)), 0, 0, 0]);
  assert.ok(Math.abs(standInBpms()[1] - 90) < 2, `stand-in rate follows the real finger: ${standInBpms()[1]}`);
  assert.ok(frame.ch[0].stable && Math.abs(frame.ch[0].bpm - 92) < 2, `real finger reads 92: ${frame.ch[0].bpm}`);
  assert.ok(frame.ch[1].stable && Math.abs(frame.ch[1].bpm - 90) < 3, `stand-in sits near the real rate: ${frame.ch[1].bpm}`);
  emit('tap', 1);
  assert.deepEqual(tappedNow, [false, false, false, false]);
  delete globalThis.location;
}
console.log('stand-in ok');
{
  // overlapping starts are serialized; resolvers are held by hand
  const log = [];
  on('status', (s) => log.push(s));
  on('frame', () => log.push('frame'));
  const defer = () => { let resolve, reject; const p = new Promise((a, b) => { resolve = a; reject = b; }); return { p, resolve, reject }; };
  const tick = () => new Promise((r) => setImmediate(r)); // let queued jobs run to their next await
  const noop = async () => {};

  // (a) B waits for A's source and A's stop; A's frames/onClose are silent
  log.length = 0;
  const aSrc = defer(), aStopped = defer();
  let aFrame, aClose, aStops = 0, bCalled = false;
  const pa = start((f, c) => { aFrame = f; aClose = c; return aSrc.p; });
  await tick();                    // A is now inside its source
  const pb = start(async () => { bCalled = true; return noop; });
  await tick();
  assert.ok(!bCalled);
  aSrc.resolve(() => { aStops++; return aStopped.p; });
  await tick();
  assert.equal(aStops, 1);
  assert.ok(!bCalled);             // A's stop still in flight
  aStopped.resolve();
  await Promise.all([pa, pb]);
  assert.ok(bCalled);
  aFrame([1, 2, 3, 4]);
  aClose();
  assert.deepEqual(log, ['running']);

  // (b) B and C arrive while a stop is pending: one stop call, B never opens, C waits
  const hold = defer();
  let stops = 0, bOpened = false, cOpened = false;
  await start(async () => () => { stops++; return hold.p; });
  const pb2 = start(async () => { bOpened = true; return noop; });
  const pc2 = start(async () => { cOpened = true; return noop; });
  await tick();
  assert.equal(stops, 1);
  assert.ok(!cOpened);
  hold.resolve();
  await Promise.all([pb2, pc2]);
  assert.equal(stops, 1);
  assert.ok(!bOpened && cOpened);

  // (c) superseded failures stay quiet: source rejects / previous stop rejects
  log.length = 0;
  const dSrc = defer();
  const pd = start(() => dSrc.p);
  await tick();                    // D is inside its source
  const pe = start(async () => noop);
  dSrc.reject(new Error('late source'));
  await Promise.all([pd, pe]);
  const fStop = defer();
  await start(async () => () => fStop.p);
  const pf = start(async () => noop);
  await tick();                    // F is awaiting the held stop
  const pg = start(async () => noop);
  fStop.reject(new Error('late stop'));
  await Promise.all([pf, pg]);
  assert.deepEqual(log.filter((x) => x.startsWith('error')), []);
}
console.log('contract ok');

import { ring, pitch01 } from './ui/lane.js';

{
  assert.equal(pitch01(0), 0);                 // clamped low
  assert.equal(pitch01(200), 1);               // clamped high
  assert.ok(pitch01(60) > 0 && pitch01(60) < pitch01(72) && pitch01(72) < 1);
  const r = ring(4);
  for (let i = 1; i <= 6; i++) r.add(i * 1000).v = i; // 6 into 4 slots: oldest two overwritten
  assert.equal(r.live(6000, 1e9), 4);
  assert.deepEqual([0, 1, 2, 3].map((k) => r.at(k).v), [6, 5, 4, 3]); // newest first
  assert.equal(r.live(7000, 2500), 2);         // 6000 and 5000 are within 2.5 s
  assert.equal(r.live(7000, 1e9), 2);          // pruned for good
  r.add(8000);
  assert.equal(r.live(8000, 1e9), 3);
}
console.log('lane ok');

{
  const { mergeStep, newField, stepField, SPLIT_MS } = await import('./ui/dynamics.js');
  const all = [true, true, true, true], three = [true, true, false, true];
  let st = { merged: false, upAt: null };
  assert.equal(mergeStep(st, three, 0).merged, false);              // not everyone is ready
  st = mergeStep(st, all, 1000);
  assert.deepEqual(st, { merged: true, upAt: null });               // all four ready: merge
  st = mergeStep(st, three, 2000);
  assert.deepEqual(st, { merged: true, upAt: 2000 });               // one lifts: the clock starts, still merged
  assert.equal(mergeStep(st, three, 2000 + SPLIT_MS).merged, true); // exactly at the limit: still merged
  assert.equal(mergeStep(st, three, 2001 + SPLIT_MS).merged, false);// past it: split
  assert.deepEqual(mergeStep(st, all, 3000), { merged: true, upAt: null }); // finger back in time: clock cleared

  const f = newField(), dt = 1 / 60;
  stepField(f, true, dt);
  assert.ok(f.lift > 0.85 && f.fl > 0.9, 'beat sets lift and flash');
  let peak = 0, lagged = false;
  for (let i = 0; i < 60; i++) { stepField(f, false, dt); peak = Math.max(peak, f.F); if (f.F > 0.4 && f.L < f.F) lagged = true; }
  assert.ok(peak > 0.5 && peak < 1.3, `crown rises on a beat: peak ${peak}`);
  assert.ok(lagged, 'L lags behind F');
  for (let i = 0; i < 240; i++) stepField(f, false, dt);
  assert.ok(Math.abs(f.F) < 0.01 && Math.abs(f.L) < 0.01 && f.lift < 0.01 && f.fl < 0.01, 'settles between beats');
  stepField(f, false, 0);
  assert.ok(Number.isFinite(f.F) && Number.isFinite(f.L), 'dt = 0 is safe');
}
console.log('dynamics ok');

{
  const out = [];
  const f = simChannels((r) => out.push(r), [3]);
  f([60000, 70000, 80000, 3700]);  // three real fingers on: sensor 4 is simulated
  assert.deepEqual(out[0].slice(0, 3), [60000, 70000, 80000]);
  assert.ok(out[0][3] > 90000, 'simulated finger on');
  f([60000, 1000, 80000, 3700]);   // one real finger lifts: the simulated one lifts too
  assert.equal(out[1][3], 0);
  // the simulated channel beats at a steady BPM through the real signal chain
  const { createChannel } = await import('./signal.js');
  const chan = createChannel(50); let bpm = 0;
  for (let i = 0; i < 50 * 20; i++) { f([60000, 70000, 80000, 0]); bpm = chan(out.at(-1)[3]).bpm; }
  assert.ok(bpm > 50 && bpm < 66, `sim pad bpm ${bpm}`);
}
assert.deepEqual(simSensors(''), []);             // no broken sensors: nothing is simulated by default
assert.deepEqual(simSensors('?sim=none'), []);
assert.deepEqual(simSensors('?sim=2,4,9'), [1, 3]);
console.log('simChannels ok');

{
  // simTapped: a tapped channel gets a pulse the detector reads at the chosen rate; others pass through
  let bpms = [0, 0, 0, 0], got = null;
  const feed = simTapped((raws) => (got = raws), () => bpms), ch = createChannel(50);
  feed([1, 2, 3, 4]);
  assert.deepEqual(got, [1, 2, 3, 4]);
  bpms = [0, 0, 84, 0];
  let out;
  for (let i = 0; i < 50 * 15; i++) { feed([1, 2, 3, 4]); out = ch(got[2]); }
  assert.deepEqual([got[0], got[1], got[3]], [1, 2, 4]);
  assert.ok(out.finger && Math.abs(out.bpm - 84) < 3, `stand-in reads 84: ${out.bpm}`);
  bpms = [0, 0, 0, 0];
  feed([1, 2, 3, 4]);
  assert.equal(got[2], 3, 'tapping again hands the channel back');
}
console.log('simTapped ok');
{
  // connectSerial over a fake port: frames and the button come in, stop.send writes a line out,
  // and a kit change (from the button or the menu) reaches the Pi as `k,<name>` for its OLED banner.
  const { connectSerial } = await import('./serial.js');
  const { emit } = await import('./bus.js');
  const fakePort = () => {
    const port = { written: '', closed: false };
    port.readable = new ReadableStream({ start(c) { port.feed = (s) => c.enqueue(new TextEncoder().encode(s)); } });
    port.writable = new WritableStream({ write(chunk) { port.written += new TextDecoder().decode(chunk); } });
    port.open = async () => {};
    port.close = async () => { port.closed = true; };
    return port;
  };
  let port = fakePort();
  Object.defineProperty(globalThis.navigator, 'serial', { configurable: true, value: { requestPort: async () => port } });
  const frames = [];
  let presses = 0;
  const stop = await connectSerial((f) => frames.push(f), () => {}, () => presses++);
  port.feed('1,2,3,4\nb\n5,6,7,8\n');
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(frames, [[1, 2, 3, 4], [5, 6, 7, 8]]);
  assert.equal(presses, 1);
  stop.send('k,R&B');
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(port.written, 'k,R&B\n');
  await stop();
  assert.ok(port.closed, 'stop closes the port with the writer released');

  port = fakePort();
  emit('connect');
  await new Promise((r) => setTimeout(r, 50));
  emit('kit', 'Drum and bass');
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(port.written, 'k,Drum and bass\n', 'core forwards kit changes to the Pi');
  const first = port;                    // reconnecting closes the old port; kit changes go to the new one only
  port = fakePort();
  emit('connect');
  await new Promise((r) => setTimeout(r, 50));
  emit('kit', 'Lo-fi');
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(first.closed, 'switching source closes the old port');
  assert.equal(first.written, 'k,Drum and bass\n');
  assert.equal(port.written, 'k,Lo-fi\n');
  delete globalThis.navigator.serial;
}
console.log('serial send ok');
