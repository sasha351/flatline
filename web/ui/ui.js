// Controls + status. The canvas (stage and notes lane) is drawn in stage.js.
import { emit, on, VOICES } from '../bus.js';
import './stage.js';

const $ = (id) => document.getElementById(id);
const buttons = [$('connect'), $('sim'), $('reconnect')];
const noSerial = !('serial' in navigator); // Web Serial: Chrome and Edge only
const enable = () => {
  buttons.forEach((b) => (b.disabled = false));
  if (noSerial) $('connect').disabled = $('reconnect').disabled = true; // permanently
};
$('unsup').hidden = !noSerial;

// emit synchronously in the click: Web Serial and audio need the user gesture
function press(type) {
  buttons.forEach((b) => (b.disabled = true));
  emit(type);
}
$('connect').onclick = () => press('connect');
$('reconnect').onclick = () => press('connect');
$('sim').onclick = () => press('simulate');
if (new URLSearchParams(location.search).has('demo')) press('simulate'); // dev: ?demo starts the simulation for screenshots
$('kit').onchange = (e) => emit('kit', e.target.value);
on('button', () => { // the Pi's push button: next genre, wrapping from the last to the first
  const k = $('kit');
  if (!k.options.length) return;
  k.selectedIndex = (k.selectedIndex + 1) % k.options.length;
  emit('kit', k.value);
});

// Debugging with ?fill=sim: click a voice's column to put the real sensor on it.
$('stage').addEventListener('click', (e) => {
  const b = e.currentTarget.getBoundingClientRect();
  const ch = Math.min(VOICES.length - 1, Math.floor(((e.clientX - b.left) / b.width) * VOICES.length));
  emit('route', ch);
  emit('tap', ch); // an unplugged sensor's blob: start or stop its stand-in heartbeat (core.js)
});
on('sensor', (s) => ($('stage').style.cursor = s == null ? '' : 'pointer'));

const LINES = {
  idle: 'Ready', // the stage carries the full instruction
  running: 'Playing',
  disconnected: 'Sensors disconnected',
};
on('status', (s) => {
  const err = typeof s === 'string' && s.startsWith('error:');
  const state = err ? 'error' : typeof s === 'string' && Object.hasOwn(LINES, s) ? s : 'other';
  const cancelled = err && /no port selected/i.test(s);
  const msg = cancelled ? 'No port chosen. Connect sensors to try again.'
    : err ? s.slice(6).trim() || 'Something went wrong.' : LINES.disconnected;
  $('status').dataset.state = state;
  $('status').textContent = cancelled ? 'No port chosen' : err ? 'Needs attention' : state === 'other' ? String(s) : LINES[s]; // full error is in the banner
  $('bmsg').textContent = msg;
  $('banner').hidden = !(err || s === 'disconnected');
  $('reconnect').hidden = noSerial;
  $('idle').hidden = s !== 'idle';
  $('tempo').hidden = s !== 'running';
  if (s !== 'running') $('songbpm').textContent = $('avgbpm').textContent = '--';
  $('unsup').hidden = !noSerial || s === 'running'; // don't cover the traces during Simulate
  enable();
});
enable();

// performance view: fullscreen, header hidden, cursor hides after 2 s idle. Esc exits natively.
const root = document.documentElement;
let still;
const wake = () => {
  root.classList.remove('still');
  clearTimeout(still);
  if (document.fullscreenElement) still = setTimeout(() => root.classList.add('still'), 2000);
};
function perf() {
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  else root.requestFullscreen?.().catch(() => {}); // fail quietly: header stays
}
$('fs').onclick = perf;
document.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() !== 'f' || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.repeat) return;
  if (e.target.closest?.('textarea, select, [contenteditable]') || e.target.matches?.('input:not([type=radio]):not([type=checkbox]):not([type=button]):not([type=submit])')) return;
  perf();
});
document.addEventListener('fullscreenchange', () => {
  root.classList.toggle('perf', !!document.fullscreenElement);
  wake();
});
document.addEventListener('mousemove', wake);

// screen readers: plain list refreshed once a second from the latest frame (not aria-live)
let last = null, lastAt = 0;
on('frame', (f) => { last = f; lastAt = performance.now(); });
const sr = $('sr');
sr.replaceChildren(...VOICES.map(() => document.createElement('li')));
setInterval(() => {
  const live = last && performance.now() - lastAt < 500;
  VOICES.forEach((v, i) => {
    const ch = live ? last.ch?.[i] : null, bpm = Math.round(ch?.bpm);
    sr.children[i].textContent = ch?.finger ? `${v}: finger on, ${ch.stable && bpm > 0 ? bpm + ' BPM' : 'finding pulse'}` : `${v}: no finger`;
  });
}, 1000);

// Song tempo and the average heart rate that sets it (audio/tempo.js). No hearts: the song runs at the kit's own tempo.
on('tempo', ({ song, heart }) => {
  $('songbpm').textContent = Math.round(song);
  $('avgbpm').textContent = heart > 0 ? Math.round(heart) : '--';
});

// Diagnostics (?perf): is the sound breaking up because this thread stalls? Late steps and long stalls say yes;
// if both stay at 0 while the sound breaks up, the cause is outside the page (CPU or the audio device).
if (new URLSearchParams(location.search).has('perf')) {
  const box = document.body.appendChild(document.createElement('pre'));
  box.style.cssText = 'position:fixed;right:8px;bottom:8px;margin:0;padding:6px 10px;z-index:99;font:13px/1.4 monospace;color:#fff;background:rgba(0,0,0,.75);border-radius:6px;pointer-events:none';
  let stalls = 0, longest = 0, slow = 0, frames = 0, prev = performance.now(), audio = null;
  try { new PerformanceObserver((l) => l.getEntries().forEach((e) => { stalls++; longest = Math.max(longest, e.duration); })).observe({ entryTypes: ['longtask'] }); } catch { /* not supported */ }
  (function tick(now) { frames++; if (now - prev > 34) slow++; prev = now; requestAnimationFrame(tick); })(prev);
  on('perf', (p) => (audio = p));
  setInterval(() => {
    box.textContent = [
      audio ? `steps ${audio.steps}   late ${audio.late}   smallest lead ${Math.round(audio.worst * 1000)} ms   audio ${audio.state}` : 'audio: not playing',
      `stalls over 50 ms: ${stalls}   longest ${Math.round(longest)} ms`,
      `slow frames (under 30 fps): ${slow} of ${frames}`,
    ].join('\n');
  }, 500);
}

on('kits', (names) => $('kit').replaceChildren(...names.map((n) => new Option(n))));
