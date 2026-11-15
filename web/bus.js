// flatline shared contract. web/audio and web/ui never import each other;
// they only talk through these events. Change this table only through a
// contract/* branch (see docs/superpowers/plans/2026-11-14-flatline.md).
//
// event      from   detail
// frame      core   { raws: number[4], ch: {finger, ac, beat, bpm, amp, inst, held, stable}[4] }   ~50 Hz
//                   held: that raw reading was a bad read, replaced by the last good one
//                   stable: the BPM has finished calibrating; show and use bpm only when this is true
// status*    core   'idle' | 'running' | 'disconnected' | 'error: <message>'
// connect    ui     none. Emit inside the click handler (needs a user gesture).
// simulate   ui     none. Same rule.
// kit        ui     one of the names from 'kits'
// route      ui     0..3: in ?fill=sim mode, the voice the real sensor plays
// kits*      audio  string[]
// analyser*  audio  { wave, fft }, each with .getValue(): Float32Array
// note       audio  { voice, ...mapVoice params }, fired when the sound is heard
// sensor*    core   0..3 = voice the real sensor plays (?fill=sim), null otherwise
// button     core   none. The Pi's push button was pressed: the UI steps to the next kit.
// tap        ui     0..3: that voice's blob was clicked (core toggles a stand-in heartbeat for an unplugged sensor)
// tapped     core   boolean[4]: which voices are played by a stand-in heartbeat
// tempo      audio  { song, heart }: the song's BPM and the average heart BPM behind it (0 = no hearts), on each change
//
// * sticky: a late subscriber gets the last value immediately.
// Listeners ignore fields and values they don't know, so either side can add some.

export const VOICES = ['drums', 'bass', 'lead', 'pad']; // channel i -> VOICES[i]
const STICKY = new Set(['status', 'kits', 'analyser', 'sensor']);
const bus = new EventTarget();
const last = {};

export function emit(type, detail) {
  if (STICKY.has(type)) last[type] = detail;
  bus.dispatchEvent(new CustomEvent(type, { detail }));
}

export function on(type, fn) {
  if (type in last) fn(last[type]);
  bus.addEventListener(type, (e) => fn(e.detail));
}
