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
    sr.children[i].textContent = ch?.finger ? `${v}: finger on, ${bpm > 0 ? bpm + ' BPM' : 'no BPM yet'}` : `${v}: no finger`;
  });
}, 1000);

on('kits', (names) => $('kit').replaceChildren(...names.map((n) => new Option(n))));
