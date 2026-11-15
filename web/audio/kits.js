// Sound kits. A kit is a spec of voice presets; makeKit turns it into a builder
// `(out) => Kit` whose instruments connect only to `out`.
// Kit = { drums, bass, lead, pad, update(hearts, t), lift(voice), silence(), dispose(), ready, tail }.
// Each voice is (params, heart, time) => void, where heart is that finger's heart.js state.
import * as Tone from 'https://cdn.jsdelivr.net/npm/tone@15.0.4/+esm';

const midi = (m) => Tone.Frequency(m, 'midi').toNote();
const gain = (add, db = 0) => add(new Tone.Gain(Tone.dbToGain(db)));

// Heart rate drives timbre: clamp to 65..95, then map linearly or exponentially.
const hr01 = (hr) => (Math.min(95, Math.max(65, hr)) - 65) / 30;
const hrLin = (hr, lo, hi) => lo + (hi - lo) * hr01(hr);
const hrExp = (hr, lo, hi) => lo * (hi / lo) ** hr01(hr);

// Every voice factory takes ctx = { add, dest, verb } and a preset.
// `add` registers a node for dispose, `dest` is the kit bus, `verb` the kit reverb.
function sends(ctx, node, o) {
  node.connect(ctx.dest);
  if (o.verb != null) node.connect(gain(ctx.add, o.verb).connect(ctx.verb));
}

// ---------------------------------------------------------------- drums
// Pieces: kick, snare, clap, rim, hat, openhat, tom. Unknown names play the closed hat.
// Velocity changes level everywhere, and decay on kick, snare and closed hat.
//   kick:  sine body with a pitch sweep, optional noise `click` (dB) for attack, and
//          optional `drive` (0..1) through a tanh saturator for weight.
//   snare: optional pitched `body` (MembraneSynth) plus white or pink noise through a
//          high-pass / low-pass pair. No body + slow attack = a brush.
//   rim:   short pitched click (MembraneSynth through a band-pass), `rim.note`/`volume`/`decay`.
//   hats:  `kind` 'metal' (MetalSynth, clangy and bright) or 'noise' (filtered noise,
//          softer). One synth serves closed and open hats, so a closed hat chokes an open one.
function drums(ctx, o) {
  const { add } = ctx;
  const bus = gain(add, o.level);
  sends(ctx, bus, o);

  // kick
  const K = o.kick;
  let kickOut = bus;
  if (K.drive) {
    const k = 1 + 4 * K.drive; // unity at full scale, more gain (fatter) on the decay
    kickOut = add(new Tone.WaveShaper((x) => Math.tanh(k * x) / Math.tanh(k), 1024)).connect(bus);
  }
  const kick = add(new Tone.MembraneSynth({
    pitchDecay: K.pitchDecay, octaves: K.octaves, oscillator: { type: 'sine' },
    envelope: { attack: 0.001, decay: K.decay, sustain: 0, release: 0.05 },
    volume: K.volume ?? 0,
  })).connect(kickOut);
  let click = null;
  if (K.click != null) {
    const clickFilter = add(new Tone.Filter({ type: 'bandpass', frequency: 3500, Q: 0.7 })).connect(kickOut);
    click = add(new Tone.NoiseSynth({
      envelope: { attack: 0.0005, decay: 0.006, sustain: 0, release: 0.005 }, volume: K.click,
    })).connect(clickFilter);
  }

  // snare
  const S = o.snare;
  const snareLp = add(new Tone.Filter({ type: 'lowpass', frequency: S.lp ?? 10000 })).connect(bus);
  const snareHp = add(new Tone.Filter({ type: 'highpass', frequency: S.hp ?? 1500 })).connect(snareLp);
  const snare = add(new Tone.NoiseSynth({
    noise: { type: S.noise ?? 'white' },
    envelope: { attack: S.attack ?? 0.001, decay: S.decay, sustain: 0, release: 0.02 },
    volume: S.volume ?? -4,
  })).connect(snareHp);
  const snareBody = S.body == null ? null : add(new Tone.MembraneSynth({
    pitchDecay: 0.03, octaves: 1.5, oscillator: { type: S.bodyType ?? 'triangle' },
    envelope: { attack: 0.001, decay: S.bodyDecay ?? 0.1, sustain: 0, release: 0.02 },
    volume: (S.volume ?? -4) - 4,
  })).connect(bus);

  // clap
  const clapFilter = add(new Tone.Filter({ type: 'bandpass', frequency: o.clap?.freq ?? 1100, Q: 0.8 })).connect(bus);
  const clap = add(new Tone.NoiseSynth({
    envelope: { attack: 0.001, decay: 0.01, sustain: 0, release: 0.01 },
    volume: o.clap?.volume ?? -4,
  })).connect(clapFilter);

  // hats
  const H = o.hat;
  const hatLp = add(new Tone.Filter({ type: 'lowpass', frequency: H.lp ?? 16000 })).connect(bus);
  const hatHp = add(new Tone.Filter({ type: 'highpass', frequency: H.hp ?? 7000 })).connect(hatLp);
  let hatHit;
  if (H.kind === 'noise') {
    const hat = add(new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: H.closed, sustain: 0, release: 0.02 },
      volume: H.volume ?? -18,
    })).connect(hatHp);
    hatHit = (decay, t, v) => { hat.envelope.decay = decay; hat.triggerAttackRelease(0.01, t, v); };
  } else {
    const hat = add(new Tone.MetalSynth({
      harmonicity: H.harmonicity ?? 5.1, modulationIndex: H.modulationIndex ?? 32,
      resonance: H.resonance ?? 4000, octaves: 1.5,
      envelope: { attack: 0.001, decay: H.closed, release: 0.05 },
      volume: H.volume ?? -16,
    })).connect(hatHp);
    hatHit = (decay, t, v) => { hat.envelope.decay = decay; hat.triggerAttackRelease(300, 0.02, t, v); };
  }

  // rim
  const rimBp = add(new Tone.Filter({ type: 'bandpass', frequency: 1800, Q: 2 })).connect(bus);
  const rim = add(new Tone.MembraneSynth({
    pitchDecay: 0.005, octaves: 1,
    envelope: { attack: 0.001, decay: o.rim?.decay ?? 0.03, sustain: 0, release: 0.01 },
    volume: o.rim?.volume ?? -10,
  })).connect(rimBp);

  // tom
  const tom = add(new Tone.MembraneSynth({
    pitchDecay: 0.06, octaves: 2,
    envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.05 },
    volume: o.tom?.volume ?? -4,
  })).connect(bus);

  // Envelope times are read when a trigger is scheduled, so setting them first is sample-accurate.
  const brightness = (heart, t) => {
    const level = heart?.settled ? Math.min(1, Math.max(0, (heart.press ?? 0.5))) : 0.5;
    const cutoff = Math.min(18000, Math.max(3500, (o.brightness ?? 9000) * (0.75 + 0.5 * level)));
    hatLp.frequency.setTargetAtTime(cutoff, t, 0.1);
    bus.gain.setTargetAtTime(Math.min(1.2, Math.max(0.35, 0.7 + 0.4 * level)), t, 0.1);
  };
  const play = (p, t) => {
    const v = p.velocity;
    switch (p.drum) {
      case 'kick':
        kick.envelope.decay = K.decay * (0.5 + 0.7 * v); // harder hit, longer boom
        kick.triggerAttackRelease(K.note, 0.1, t, v);
        click?.triggerAttackRelease(0.004, t, v);
        break;
      case 'snare':
        snare.envelope.decay = S.decay * (0.7 + 0.5 * v);
        snare.triggerAttackRelease(0.05, t, v);
        snareBody?.triggerAttackRelease(S.body, 0.05, t, v);
        break;
      case 'clap': // three quick bursts then a short tail
        clap.envelope.decay = 0.01;
        [0, 0.011, 0.022].forEach((k) => clap.triggerAttackRelease(0.005, t + k, v));
        clap.envelope.decay = 0.16;
        clap.triggerAttackRelease(0.01, t + 0.033, v);
        break;
      case 'rim':
        rim.triggerAttackRelease(o.rim?.note ?? 'D5', 0.02, t, v);
        break;
      case 'tom':
        tom.triggerAttackRelease(o.tom?.note ?? 'E2', 0.1, t, v);
        break;
      case 'openhat':
        hatHit(H.open, t, v * 0.8);
        break;
      default:
        hatHit(H.closed * (0.7 + 0.6 * v), t, v * 0.7);
    }
  };
  return { play, update: brightness };
}

const DRUMS = {
  // Brushes: soft sub kick with no click, a swishy brush snare (slow attack,
  // no body), airy noise hats.
  soft: {
    level: -3, verb: -6,
    kick: { note: 'A1', pitchDecay: 0.015, octaves: 2, decay: 0.8, volume: -4 },
    snare: { noise: 'pink', attack: 0.02, hp: 1500, lp: 7000, decay: 0.4, volume: -6 },
    hat: { kind: 'noise', closed: 0.09, open: 0.6, hp: 8000, lp: 14000, volume: -16 },
    clap: { volume: -14, freq: 1500 },
    tom: { note: 'E2', volume: -8 },
  },
  // French house: tight four-on-the-floor kick, big filtered-disco clap, quiet hats.
  disco: {
    level: -6, verb: -18,
    kick: { note: 'G1', pitchDecay: 0.04, octaves: 4, decay: 0.3, click: -12, drive: 0.15 },
    snare: { body: 'E3', bodyDecay: 0.1, hp: 1800, lp: 9000, decay: 0.15, volume: -12 },
    clap: { freq: 1300, volume: -2 },
    hat: { kind: 'noise', closed: 0.03, open: 0.25, hp: 8000, volume: -16 },
  },
  // UK garage: dry, snappy kit with a metal hat and a rim.
  crisp: {
    level: -6, verb: -18,
    kick: { note: 'F1', pitchDecay: 0.03, octaves: 4, decay: 0.35, click: -10, drive: 0.3 },
    snare: { body: 'D3', bodyDecay: 0.09, noise: 'white', hp: 2000, lp: 10000, decay: 0.14 },
    clap: { freq: 1400 },
    hat: { kind: 'metal', closed: 0.025, open: 0.2, hp: 9000, volume: -18 },
    rim: { note: 'D5', volume: -12 },
  },
  // Hardbass: long distorted kick, loud clap, hats kept low (openhat cells are full weight).
  hard: {
    level: -3,
    kick: { note: 'A1', pitchDecay: 0.06, octaves: 6, decay: 0.7, click: -8, drive: 0.9, volume: 0 },
    snare: { body: 'E3', bodyDecay: 0.1, hp: 1800, lp: 9000, decay: 0.15, volume: -12 },
    clap: { freq: 1000, volume: 0 },
    hat: { kind: 'noise', closed: 0.03, open: 0.18, hp: 7000, volume: -22 },
  },
  // Drum and bass: short punchy kick that leaves room for the bass, loud cracking snare, tight hats.
  breaks: {
    level: -5, verb: -16,
    kick: { note: 'F1', pitchDecay: 0.025, octaves: 4, decay: 0.22, click: -8, drive: 0.4 },
    snare: { body: 'G3', bodyDecay: 0.12, noise: 'white', hp: 1600, lp: 11000, decay: 0.18, volume: -2 },
    clap: { freq: 1400 },
    hat: { kind: 'noise', closed: 0.025, open: 0.22, hp: 9000, volume: -18 },
  },
  // Acid techno: driven thumping kick, dry clap, metal hats, rim.
  techno: {
    level: -4, verb: -20,
    kick: { note: 'A1', pitchDecay: 0.05, octaves: 5, decay: 0.45, click: -10, drive: 0.6 },
    snare: { body: 'E3', bodyDecay: 0.1, hp: 1800, lp: 9000, decay: 0.15, volume: -12 },
    clap: { freq: 1200, volume: -4 },
    hat: { kind: 'metal', closed: 0.03, open: 0.25, hp: 8500, volume: -20 },
    rim: { note: 'A4', volume: -12 },
  },
  // Lo-fi: dull round kick, soft snare with a woody body, dark quiet hats.
  dusty: {
    level: -4, verb: -10,
    kick: { note: 'C2', pitchDecay: 0.03, octaves: 3, decay: 0.35, drive: 0.2, volume: -2 },
    snare: { body: 'D3', bodyDecay: 0.12, noise: 'pink', hp: 1200, lp: 6000, decay: 0.2, volume: -8 },
    clap: { freq: 1100, volume: -12 },
    hat: { kind: 'noise', closed: 0.04, open: 0.3, hp: 7000, lp: 11000, volume: -20 },
    rim: { note: 'G4', volume: -14 },
  },
  // Boom bap: a hard, driven kick and a loud cracking snare with a woody body; the hats sit back.
  boombap: {
    level: -5, verb: -16,
    kick: { note: 'G1', pitchDecay: 0.05, octaves: 4, decay: 0.4, click: -8, drive: 0.5 },
    snare: { body: 'E3', bodyDecay: 0.14, noise: 'white', hp: 1000, lp: 8000, decay: 0.22, volume: 0 },
    clap: { freq: 1100, volume: -8 },
    hat: { kind: 'noise', closed: 0.04, open: 0.25, hp: 6500, lp: 12000, volume: -18 },
  },
};

// New genres' kits: every preset needs kick, snare, clap and hat, since drums() builds them all.
Object.assign(DRUMS, {
  psy: { // tight, clicky kick that leaves the rest of the beat to the bass
    level: -4, verb: -20,
    kick: { note: 'E1', pitchDecay: 0.02, octaves: 5, decay: 0.22, click: -6, drive: 0.5 },
    snare: { body: 'E3', bodyDecay: 0.1, hp: 1800, lp: 9000, decay: 0.15, volume: -12 },
    clap: { freq: 1300, volume: -8 },
    hat: { kind: 'metal', closed: 0.02, open: 0.2, hp: 9000, volume: -20 },
  },
  trap: { // long 808 kick, sharp clap, crisp hats (rolls use the closed hat)
    level: -6, verb: -16,
    kick: { note: 'F1', pitchDecay: 0.08, octaves: 3, decay: 1.1, drive: 0.3, volume: 0 },
    snare: { body: 'D3', bodyDecay: 0.1, noise: 'white', hp: 1500, lp: 9000, decay: 0.18, volume: -6 },
    clap: { freq: 1300, volume: -1 },
    hat: { kind: 'noise', closed: 0.02, open: 0.3, hp: 9000, volume: -15 },
  },
  dub: { // heavy kick, huge snare
    level: -4, verb: -12,
    kick: { note: 'F1', pitchDecay: 0.04, octaves: 4, decay: 0.5, click: -8, drive: 0.5 },
    snare: { body: 'E3', bodyDecay: 0.15, noise: 'white', hp: 1200, lp: 10000, decay: 0.3, volume: 0 },
    clap: { freq: 1200, volume: -6 },
    hat: { kind: 'noise', closed: 0.03, open: 0.25, hp: 8000, volume: -18 },
  },
  hardstyle: { // a long, very distorted kick
    level: -4,
    kick: { note: 'F1', pitchDecay: 0.08, octaves: 6, decay: 0.45, click: -6, drive: 1, volume: 0 },
    snare: { body: 'E3', bodyDecay: 0.1, hp: 1800, lp: 9000, decay: 0.15, volume: -12 },
    clap: { freq: 1100, volume: -2 },
    hat: { kind: 'noise', closed: 0.03, open: 0.2, hp: 7500, volume: -20 },
  },
  dembow: { // round kick, short snappy snare
    level: -4, verb: -16,
    kick: { note: 'G1', pitchDecay: 0.04, octaves: 4, decay: 0.35, click: -10, drive: 0.3 },
    snare: { body: 'A3', bodyDecay: 0.06, noise: 'white', hp: 2500, lp: 10000, decay: 0.1, volume: -3 },
    clap: { freq: 1300, volume: -8 },
    hat: { kind: 'noise', closed: 0.03, open: 0.2, hp: 8500, volume: -20 },
  },
  footwork: { // short 808 kick, clap, metal hats, rim
    level: -6, verb: -16,
    kick: { note: 'F1', pitchDecay: 0.05, octaves: 3, decay: 0.45, drive: 0.3 },
    snare: { body: 'E3', bodyDecay: 0.1, hp: 1800, lp: 9000, decay: 0.15, volume: -12 },
    clap: { freq: 1500, volume: -4 },
    hat: { kind: 'metal', closed: 0.02, open: 0.2, hp: 9000, volume: -22 },
    rim: { note: 'E5', volume: -10 },
  },
  groove: { // hard groove: driven kick, dry clap, metal hats, a rim and pitched toms for the rolling percussion
    level: -6, verb: -16,
    kick: { note: 'F1', pitchDecay: 0.04, octaves: 5, decay: 0.4, click: -10, drive: 0.6 },
    snare: { body: 'E3', bodyDecay: 0.1, hp: 1800, lp: 9000, decay: 0.15, volume: -12 },
    clap: { freq: 1250, volume: -5 },
    hat: { kind: 'metal', closed: 0.025, open: 0.22, hp: 8500, volume: -20 },
    rim: { note: 'A4', volume: -10 },
    tom: { note: 'C3', volume: -8 },
  },
  club: { // punchy kick and a loud clap
    level: -6, verb: -16,
    kick: { note: 'G1', pitchDecay: 0.03, octaves: 4, decay: 0.3, click: -8, drive: 0.4 },
    snare: { body: 'E3', bodyDecay: 0.1, hp: 1800, lp: 9000, decay: 0.15, volume: -12 },
    clap: { freq: 1300, volume: -2 },
    hat: { kind: 'noise', closed: 0.025, open: 0.2, hp: 8500, volume: -18 },
  },
});

// ---------------------------------------------------------------- bass
// type 'mono':   MonoSynth with a 24 dB filter envelope; `osc` may be 'fat...' (3 detuned voices).
// type 'rubber': sine plus a square-modulated FM layer (-10 dB), both through the drive.
// type 'soft':   plain Synth, long and round.
// `layers` holds extra voices (the rubber FM) triggered with the main one.
// Heart: pressure drives a distortion (0.4 * press * grit); heart rate sets the filter
// base (mono, filterLo..filterHi) or the FM modulation index (rubber, 1..4).
function bass(ctx, o) {
  const { add } = ctx;
  const bus = gain(add, o.level);
  sends(ctx, bus, o);
  const character = add(new Tone.Filter({ type: 'lowpass', frequency: o.filter ?? 900, Q: o.q ?? 2 })).connect(bus);
  const glide = o.glide ?? 0;
  let syn, fmLayer, setTone = () => {};
  const layers = []; // extra voices triggered with the main one
  if (o.type === 'rubber') {
    const env = { attack: 0.003, decay: 0.2, sustain: 0.3, release: 0.15 };
    syn = add(new Tone.Synth({ oscillator: { type: 'sine' }, portamento: glide, envelope: env }));
    const fm = fmLayer = add(new Tone.FMSynth({
      harmonicity: 1, modulationIndex: 2, modulation: { type: 'square' },
      portamento: glide, envelope: env, volume: -10,
    }));
    layers.push(fm);
    setTone = (hr, t) => fm.modulationIndex.setTargetAtTime(hrLin(hr, 0.5, 6), t, 0.1);
  } else if (o.type === 'soft') {
    syn = add(new Tone.Synth({
      oscillator: { type: o.osc ?? 'triangle' }, portamento: glide,
      envelope: { attack: 0.03, decay: 0.6, sustain: 0.6, release: 1.2 },
    }));
  } else {
    syn = add(new Tone.MonoSynth({
      oscillator: String(o.osc).startsWith('fat') ? { type: o.osc, count: 3, spread: 25 } : { type: o.osc ?? 'sawtooth' },
      portamento: glide,
      filter: { type: 'lowpass', Q: o.q ?? 2, rolloff: -24 },
      envelope: o.env ?? { attack: 0.005, decay: 0.3, sustain: 0.6, release: 0.25 }, // `env`: e.g. hardstyle's swelling reverse bass
      filterEnvelope: { attack: 0.005, decay: 0.25, sustain: 0.25, release: 0.3, baseFrequency: 150, octaves: o.octaves ?? 2.5 },
    }));
    setTone = (hr, t) => {
      const cutoff = hrLin(hr, o.filterLo ?? 100, o.filterHi ?? 600);
      syn.filter.frequency.setTargetAtTime(cutoff, t, 0.1);
      if (!o.wobble) character.frequency.setTargetAtTime(cutoff, t, 0.1); // a wobble bass moves this filter itself (play)
    };
  }
  // At press 0 the distortion is fully dry: Tone's curve at amount 0 isn't unity gain.
  // Tone's curve squashes a full-level input by ~8 dB, so drive it 10 dB lower and
  // make up 10 dB after: unity when dry, gentle saturation and similar level when wet.
  const post = gain(add, 10).connect(character);
  const dist = add(new Tone.Distortion({ distortion: 0, wet: 0, oversample: '2x' })).connect(post);
  const drive = gain(add, -10).connect(dist);
  syn.connect(drive);
  fmLayer?.connect(drive);
  const dur = o.dur ?? '8n';
  let wobbles = 0; // `wobble`: cycles per note, taken in turn
  const update = (heart, t) => {
    const grit = heart?.settled
      ? Math.min(0.35, Math.max(0, 0.4 * (heart.press ?? 0.5) * (o.grit ?? 1)))
      : 0;
    dist.distortion = grit;
    dist.wet.setTargetAtTime(Math.min(1, Math.max(0, grit / 0.2)), t, 0.1);
    setTone(heart.hr, t);
  };
  return {
    play(p, heart, t) {
      const n = midi(p.notes[0]);
      update(heart, t);
      const length = p.duration ?? dur;
      syn.triggerAttackRelease(n, length, t, p.velocity);
      if (o.wobble && typeof length === 'number') { // dubstep: the filter opens and closes n times over the note, so it locks to the tempo
        const cycles = o.wobble[wobbles++ % o.wobble.length], f = character.frequency;
        const lo = o.filterLo ?? 150, hi = Math.min(4000, hrLin(heart.hr, 900, o.filterHi ?? 2500)); // a faster heart opens it further
        f.cancelScheduledValues?.(t);
        f.setValueAtTime(lo, t);
        for (let k = 0; k < cycles; k++) {
          f.linearRampToValueAtTime(hi, t + ((k + 0.5) * length) / cycles);
          f.linearRampToValueAtTime(lo, t + ((k + 1) * length) / cycles);
        }
      }
      for (const l of layers) l.triggerAttackRelease(n, length, t, 0.5 + 0.5 * p.velocity);
    },
    update,
    silence() { syn.triggerRelease(); layers.forEach((l) => l.triggerRelease()); },
  };
}

const BASS = {
  soft: { type: 'soft', osc: 'triangle', glide: 0.08, dur: '4n', level: -6, grit: 0.4 },
  pluck: { type: 'mono', osc: 'square', glide: 0, level: -8, dur: '16n', octaves: 3, filterLo: 250, filterHi: 1200, q: 4 },
  rubber: { type: 'rubber', glide: 0.06, level: -4, dur: '16n', filter: 900 },
  pump: { type: 'mono', osc: 'fatsawtooth', glide: 0, level: -6, dur: '16n', octaves: 4, filterLo: 300, filterHi: 1400, q: 3, grit: 1.2 },
  // Reese: detuned saws kept dark, so the beating between them is the sound. Long notes.
  reese: { type: 'mono', osc: 'fatsawtooth', glide: 0.05, level: -5, dur: '4n', octaves: 1.5, filterLo: 120, filterHi: 500, q: 1 },
  // Acid: one saw through a resonant filter with a deep envelope; the heart rate opens the cutoff.
  acid: { type: 'mono', osc: 'sawtooth', glide: 0.04, level: -11, dur: '16n', octaves: 4, filterLo: 200, filterHi: 1500, q: 9, grit: 1.4 },
  // Sub: a plain low sine under the kick.
  sub: { type: 'soft', osc: 'sine', glide: 0.03, dur: '4n', level: -8, filter: 400, grit: 0.8 },
  // 808: a long sine that glides into the next note when they overlap.
  808: { type: 'soft', osc: 'sine', glide: 0.09, dur: '2n', level: -10, filter: 600, grit: 1.2 },
  // Psytrance roll: short, tight, slightly open saw notes.
  psy: { type: 'mono', osc: 'sawtooth', level: -7, dur: '16n', octaves: 2.5, filterLo: 250, filterHi: 900, q: 3, env: { attack: 0.002, decay: 0.08, sustain: 0.2, release: 0.04 } },
  // Dubstep wobble: `wobble` lists the filter cycles per note, taken in turn.
  wobble: { type: 'mono', osc: 'fatsawtooth', level: -6, octaves: 1, filterLo: 150, filterHi: 2500, q: 4, grit: 1.2, wobble: [4, 8, 2, 6, 3] },
  // Hardstyle reverse bass: swells in, cuts off dead, heavily distorted.
  reverse: { type: 'mono', osc: 'fatsawtooth', level: -8, octaves: 1.5, filterLo: 500, filterHi: 1800, q: 2, grit: 1.8, env: { attack: 0.16, decay: 0.01, sustain: 1, release: 0.02 } },
};

// ---------------------------------------------------------------- lead
// type 'talkbox':  fat saw through two glided band-pass formants; note picks the vowel, exhale opens "a".
// type 'chop':     square through two formants alternating ah / oh, with a 40 ms pitch scoop.
// type 'supersaw': 7-voice fat saw plus an octave-up copy (-8 dB), lightly distorted.
// type 'pluck':    PluckSynth. Ignores velocity.
// type 'keys':     piano-like: a few partials with a hard attack that rings down.
// Optional `delay` {time, feedback, send (dB), pingpong}.
// Heart: heart rate sets a low-pass, 400..4000 Hz (exponential).
// Note length is p.duration (the note's gate in seconds, cell.gate * stepSeconds from evolution.js) when given, else o.dur.
const VOWELS = [[325, 700], [450, 800], [800, 1150], [400, 1600], [300, 2300]]; // u o a e i

function lead(ctx, o) {
  const { add } = ctx;
  const bus = gain(add, o.level);
  sends(ctx, bus, o);
  let echoSend = null;
  if (o.delay) {
    const Delay = o.delay.pingpong ? Tone.PingPongDelay : Tone.FeedbackDelay;
    const delay = add(new Delay({ delayTime: o.delay.time, feedback: o.delay.feedback, wet: 1 }));
    echoSend = gain(add, o.delay.send);
    bus.connect(echoSend.connect(delay));
    sends(ctx, delay, o); // echoes go to the reverb too, so they sit in the same room
  }
  const lp = add(new Tone.Filter({ type: 'lowpass', frequency: 2000, Q: 1 })).connect(bus);
  let head = lp;
  let syn, up, formants, vowel;
  const formantPair = (s) => {
    const bp = (f) => add(new Tone.Filter({ type: 'bandpass', frequency: f, Q: 6 })).connect(head);
    const pair = [bp(800), bp(1150)];
    pair.forEach((f) => s.connect(f));
    return pair;
  };
  if (o.type === 'talkbox') {
    syn = add(new Tone.Synth({
      oscillator: { type: 'fatsawtooth', count: 2, spread: 10 }, portamento: o.glide ?? 0.05,
      envelope: { attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.15 },
    }));
    formants = formantPair(syn);
    vowel = (p, heart) => { // breath (exhale) opens to "a"
      const v = heart.breath > 0.3 ? 2 : p.notes[0] % 5;
      return VOWELS[v];
    };
  } else if (o.type === 'chop') {
    syn = add(new Tone.Synth({
      oscillator: { type: 'square' },
      envelope: { attack: 0.003, decay: 0.12, sustain: 0.2, release: 0.06 },
    }));
    formants = formantPair(syn);
    let n = 0;
    vowel = () => (n++ % 2 ? [450, 800] : [800, 1150]); // ah / oh
  } else if (o.type === 'supersaw') {
    const saw = (volume) => add(new Tone.Synth({
      oscillator: { type: 'fatsawtooth', count: 7, spread: 40 }, portamento: o.glide ?? 0.02, volume,
      envelope: { attack: 0.003, decay: 0.15, sustain: 0.6, release: 0.12 },
    }));
    syn = saw(0); up = saw(-8);
    const drive = add(new Tone.Distortion({ distortion: 0.3, wet: 0.6 })).connect(head);
    syn.connect(drive); up.connect(drive);
  } else if (o.type === 'keys') {
    syn = add(new Tone.Synth({
      oscillator: { type: 'custom', partials: [1, 0.5, 0.25, 0.12, 0.06] },
      envelope: { attack: 0.005, decay: 0.5, sustain: 0.15, release: 0.4 },
    }));
  } else {
    syn = add(new Tone.PluckSynth({ attackNoise: 1.5, dampening: 4000, resonance: 0.97, release: 1.5 }));
  }
  if (!formants && !up) syn.connect(head);
  const dur = o.dur ?? '8n';
  return {
    play(p, heart, t) {
      const brightness = Math.min(8000, Math.max(500, hrExp(heart.hr, o.brightLo ?? 400, o.brightHi ?? 4000)));
      lp.frequency.setTargetAtTime(brightness, t, 0.1);
      if (formants) {
        const [a, b] = vowel(p, heart);
        if (o.type === 'chop') { formants[0].frequency.setValueAtTime(a, t); formants[1].frequency.setValueAtTime(b, t); }
        else { formants[0].frequency.setTargetAtTime(a, t, 0.04); formants[1].frequency.setTargetAtTime(b, t, 0.04); }
      }
      syn.triggerAttackRelease(midi(p.notes[0]), p.duration ?? dur, t, p.velocity);
      if (up) up.triggerAttackRelease(midi(p.notes[0] + 12), p.duration ?? dur, t, p.velocity);
      if (o.type === 'chop') { // vocal scoop: start ~2 semitones sharp, settle in 40 ms (after trigger's own set)
        const hz = Tone.Frequency(p.notes[0], 'midi').toFrequency();
        syn.frequency.setValueAtTime(hz * 2 ** (2 / 12), t);
        syn.frequency.exponentialRampToValueAtTime(hz, t + 0.04);
      }
    },
    update(heart, t) {
      const brightness = Math.min(8000, Math.max(500, hrExp(heart.hr, o.brightLo ?? 400, o.brightHi ?? 4000)));
      lp.frequency.setTargetAtTime(brightness, t, 0.1);
      if (echoSend) echoSend.gain.setTargetAtTime(Math.min(1, Math.max(0, (o.echoBase ?? 0.2) + 0.15 * (heart.breath ?? 0))), t, 0.1);
    },
    silence() { syn.triggerRelease(); up?.triggerRelease(); },
  };
}

const LEAD = {
  talkbox: { type: 'talkbox', glide: 0.05, delay: { pingpong: true, time: '8n.', feedback: 0.25, send: -12 }, verb: -12, level: -6 },
  chop: { type: 'chop', delay: { time: '8n', feedback: 0.2, send: -14 }, verb: -10, level: -6 },
  supersaw: { type: 'supersaw', glide: 0.02, verb: -16, level: -10 },
  pluck: {
    type: 'pluck', dur: '4n',
    delay: { pingpong: true, time: '4n.', feedback: 0.45, send: -6 },
    verb: -4, level: -4, // transient: peaks ~6 dB over its RMS
  },
  keys: { type: 'keys', dur: '8n', verb: -12, level: -8 },
};

// ---------------------------------------------------------------- pad
// PolySynth of Synth voices: `osc` is a type name, an oscillator object (e.g. custom partials),
// or with `spread` a 3-voice fat one. `attack`/`decay`/`sustain`/`release` override the envelope.
// Chain: synth -> 180 Hz high-pass (keeps it off the bass) -> low-pass following
// heart -> optional slow AutoFilter (`motion` Hz), Phaser, Chorus -> bus.
// Heart: update() sets the low-pass from heart rate, 300..3000 Hz (exponential),
// times 2^breath (+-1 octave with the player's breathing). Called every 16th step.
// type 'scratch' (boom bap): the pad finger is the DJ. Each cell is one record scratch, not a chord.
// A scratch is a sound on vinyl pushed forward and pulled back, so its pitch and tone sweep up and
// down together. Here the "record" is a buzzy voice (saw through an "ah" formant pair) plus vinyl
// hiss, and one hit sweeps the pitch and both formants up about an octave and a half and back
// (every other hit goes the other way: the pull). The note length is the time the hand takes.
// The pitch centres on the chord root, so scratches stay loosely in key.
// Heart: heart rate and breathing set the brightness, like the other pads.
function scratch(ctx, o) {
  const { add } = ctx;
  const bus = gain(add, o.level);
  sends(ctx, bus, o);
  const lp = add(new Tone.Filter({ type: 'lowpass', frequency: 3000, rolloff: -12 }));
  lp.connect(bus);
  const formants = [800, 1150].map((f) => {
    const bp = add(new Tone.Filter({ type: 'bandpass', frequency: f, Q: 4 }));
    bp.connect(lp);
    return bp;
  });
  const voice = add(new Tone.Synth({
    oscillator: { type: 'sawtooth' },
    envelope: { attack: 0.004, decay: 0.05, sustain: 0.8, release: 0.02 },
  }));
  const hiss = add(new Tone.NoiseSynth({
    noise: { type: 'pink' }, envelope: { attack: 0.004, decay: 0.05, sustain: 0.8, release: 0.02 }, volume: o.hiss ?? -10,
  }));
  formants.forEach((bp) => { voice.connect(bp); hiss.connect(bp); });
  const SWEEP = 2.8;   // ponytail: how far the pitch travels in one push (about 1.5 octaves)
  const MAX_S = 0.35;  // ponytail: the longest hand movement; a longer cell holds the end of the sweep
  let hits = 0;
  return {
    play(p, heart, t) {
      const length = p.duration ?? 0.12, d = Math.min(length, MAX_S), back = hits++ % 2 === 1;
      const hz = Tone.Frequency(p.notes[0] + 12, 'midi').toFrequency();
      const from = back ? SWEEP : 1 / Math.sqrt(SWEEP), peak = back ? 1 / Math.sqrt(SWEEP) : SWEEP;
      const sweep = (param, base) => {
        param.setValueAtTime(base * from, t);
        param.exponentialRampToValueAtTime(base * peak, t + d * 0.55);
        param.exponentialRampToValueAtTime(base * from, t + d);
      };
      const v = 0.3 + 0.6 * p.velocity;
      voice.triggerAttackRelease(hz * from, length, t, v);
      sweep(voice.frequency, hz); // after the trigger's own pitch set
      sweep(formants[0].frequency, 800);
      sweep(formants[1].frequency, 1150);
      hiss.triggerAttackRelease(length, t, v);
    },
    update(heart, t) {
      const cutoff = Math.min(8000, Math.max(800, hrExp(heart.hr, o.filterLo ?? 1500, o.filterHi ?? 6000) * 2 ** Math.max(-1, Math.min(1, heart.breath ?? 0))));
      lp.frequency.rampTo(cutoff, 0.1, t);
    },
    silence() { voice.triggerRelease(); hiss.triggerRelease(); },
  };
}

// type 'vox' (footwork, Jersey club): the pad finger plays chopped vocal stabs, not chords. Each cell is
// one short syllable on the chord root, an octave up, cycling through the vowels a o e i; the cell
// length is cut to at most `maxLen` seconds, so fast cells stutter. Heart: heart rate sets the brightness.
function vox(ctx, o) {
  const { add } = ctx;
  const bus = gain(add, o.level);
  sends(ctx, bus, o);
  const lp = add(new Tone.Filter({ type: 'lowpass', frequency: 3500, rolloff: -12 }));
  lp.connect(bus);
  const formants = [800, 1150].map((f) => { const bp = add(new Tone.Filter({ type: 'bandpass', frequency: f, Q: 6 })); bp.connect(lp); return bp; });
  const syn = add(new Tone.Synth({
    oscillator: { type: 'fatsawtooth', count: 2, spread: 12 },
    envelope: { attack: 0.004, decay: 0.08, sustain: 0.6, release: 0.03 },
  }));
  formants.forEach((bp) => syn.connect(bp));
  const ORDER = [2, 1, 3, 4]; // a o e i (VOWELS, lead section)
  let n = 0;
  return {
    play(p, heart, t) {
      const [a, b] = VOWELS[ORDER[n++ % ORDER.length]];
      formants[0].frequency.setValueAtTime(a, t);
      formants[1].frequency.setValueAtTime(b, t);
      syn.triggerAttackRelease(midi(p.notes[0] + 12), Math.min(p.duration ?? 0.1, o.maxLen ?? 0.14), t, 0.4 + 0.5 * p.velocity);
    },
    update(heart, t) { lp.frequency.rampTo(Math.min(7000, Math.max(1200, hrExp(heart.hr, o.filterLo ?? 2000, o.filterHi ?? 5000))), 0.1, t); },
    silence() { syn.triggerRelease(); },
  };
}

function pad(ctx, o) {
  if (o.type === 'scratch') return scratch(ctx, o);
  if (o.type === 'vox') return vox(ctx, o);
  const { add } = ctx;
  const bus = gain(add, o.level);
  sends(ctx, bus, o);
  let head = bus;
  if (o.chorus) head = add(new Tone.Chorus({ frequency: o.chorus.rate, delayTime: 3.5, depth: o.chorus.depth, wet: 0.5 }).start()).connect(head);
  if (o.phaser) head = add(new Tone.Phaser({ frequency: 0.15, octaves: 3, baseFrequency: 400, wet: 0.35 })).connect(head);
  let texture = null;
  if (o.motion) {
    texture = add(new Tone.AutoFilter({
      frequency: o.motion, baseFrequency: 300, octaves: 3.5, wet: 0.7,
      filter: { type: 'lowpass', rolloff: -12, Q: 1 },
    }).start());
    head = texture.connect(head);
  }
  const lp = add(new Tone.Filter({ type: 'lowpass', frequency: 1200, rolloff: -12 })).connect(head);
  const hp = add(new Tone.Filter({ type: 'highpass', frequency: 180 })).connect(lp);

  const env = { attack: o.attack ?? 1.5, decay: o.decay ?? 1, sustain: o.sustain ?? 0.8, release: o.release ?? 3 };
  const oscillator = typeof o.osc === 'object' ? o.osc : o.spread ? { type: o.osc, count: 3, spread: o.spread } : { type: o.osc ?? 'triangle' };
  const syn = new Tone.PolySynth(Tone.Synth, { oscillator, envelope: env });
  add(syn).connect(hp);
  syn.maxPolyphony = 16;
  return {
    play(p, heart, t) {
      syn.triggerAttackRelease(p.notes.map(midi), p.duration ?? o.hold ?? 2.5, t, 0.3 + 0.5 * p.velocity);
    },
    update(heart, t) {
      const cutoff = Math.min(6000, Math.max(250, hrExp(heart.hr, o.filterLo ?? 300, o.filterHi ?? 3000) * 2 ** Math.max(-1, Math.min(1, heart.breath ?? 0))));
      lp.frequency.rampTo(cutoff, 0.1, t);
      if (texture) texture.wet.rampTo(
        Math.min(1, Math.max(0, 0.35 + 0.25 * (heart.press ?? 0.5))), 0.1, t,
      );
    },
    silence() { syn.releaseAll(); },
  };
}

const PAD = {
  air: {
    osc: 'fattriangle', spread: 30, attack: 3, release: 5, hold: 3,
    phaser: true, motion: 0.05,
    verb: 0, level: -20,
  },
  discoStab: {
    osc: 'fatsawtooth', spread: 20, attack: 0.005, release: 0.25, hold: 0.25, decay: 0.15, sustain: 0.4,
    phaser: true, chorus: { rate: 0.8, depth: 0.4 }, motion: 0.06, verb: -10, level: -12,
  },
  organ: {
    osc: { type: 'custom', partials: [1, 0.6, 0.3, 0.2, 0.1] }, attack: 0.003, release: 0.12, hold: 0.15, decay: 0.15, sustain: 0.4,
    chorus: { rate: 1.5, depth: 0.3 }, verb: -12, level: -10,
  },
  rave: {
    osc: 'fatsawtooth', spread: 35, attack: 0.003, release: 0.3, hold: 0.3, decay: 0.15, sustain: 0.4,
    verb: -14, level: -14,
  },
  // Electric piano: a few soft partials that ring down after the attack, with a slow chorus.
  keys: {
    osc: { type: 'custom', partials: [1, 0.4, 0.15, 0.05] }, attack: 0.01, decay: 1.2, sustain: 0.3, release: 0.8, hold: 1.2,
    chorus: { rate: 0.6, depth: 0.5 }, verb: -8, level: -12,
  },
  scratch: { type: 'scratch', verb: -14, level: -2 },
  vox: { type: 'vox', verb: -12, level: 5 },
};

// ---------------------------------------------------------------- kits
function makeKit(spec) {
  return (out) => {
    const nodes = [];
    const add = (n) => (nodes.push(n), n);
    const dest = spec.bus ? spec.bus(add, out) : out;
    const verb = add(new Tone.Reverb(spec.reverb)).connect(dest);
    const depth = spec.pump === true ? 0.62 : spec.pump;
    const pump = spec.pump ? add(new Tone.Gain(1)).connect(dest) : null;
    const voiceDest = pump ?? dest;
    const ctx = { add, dest: voiceDest, verb };
    const d = drums(ctx, spec.drums);
    const b = bass(ctx, spec.bass);
    const l = lead(ctx, spec.lead);
    const p = pad(ctx, spec.pad);
    return {
      drums: (params, heart, t) => d.play(params, t),
      bass: b.play,
      lead: l.play,
      pad: p.play,
      update(hearts, t, stepInBar = 0) {
        d.update(hearts.drums, t);
        b.update?.(hearts.bass, t);
        l.update?.(hearts.lead, t);
        p.update(hearts.pad, t);
        if (pump) {
          if (stepInBar % 4 === 0) {
            pump.gain.setValueAtTime(1, t);
            pump.gain.linearRampToValueAtTime(depth, t + 0.03);
            pump.gain.linearRampToValueAtTime(1, t + 0.18);
          }
        }
      },
      lift(voice) { if (voice === 'pad') p.silence(); }, // finger lifted: pad releases now
      silence() { b.silence(); l.silence(); p.silence(); },
      dispose() { nodes.forEach((n) => n.dispose()); },
      ready: verb.ready, // resolves once the reverb impulse is generated
      tail: spec.tail, // seconds of release/reverb to let ring before dispose
    };
  };
}

// Order matters: the first kit is the default.
export const KITS = {
  // Disco four-on-the-floor with pumping sidechain: tight kick and big clap, plucked
  // square bass, talkbox vowel lead, short phased disco-saw stabs.
  'French house': makeKit({
    tail: 5,
    pump: true,
    reverb: { decay: 2.5, preDelay: 0.02, wet: 0.8 },
    drums: { ...DRUMS.disco, brightness: 10500 },
    bass: BASS.pluck,
    lead: { ...LEAD.talkbox, brightLo: 1200, brightHi: 6000, echoBase: 0.18 },
    pad: { ...PAD.discoStab, filterLo: 600, filterHi: 4000 },
  }),
  // Shuffled 2-step: crisp dry kit with metal hats and rim, rubbery FM bass,
  // chopped ah/oh vocal lead, organ stabs.
  'UK garage': makeKit({
    tail: 4,
    pump: 0.8,
    reverb: { decay: 2, preDelay: 0.01, wet: 0.75 },
    drums: { ...DRUMS.crisp, brightness: 8500 },
    bass: BASS.rubber,
    lead: { ...LEAD.chop, brightLo: 1500, brightHi: 6500, echoBase: 0.12 },
    pad: { ...PAD.organ, filterLo: 800, filterHi: 4500 },
  }),
  // Slow and spacious: soft brushed drums in an 8 s room, round bass,
  // plucks echoing on dotted quarters, airy pad.
  Ambient: makeKit({
    tail: 10,
    reverb: { decay: 8, preDelay: 0.05, wet: 1 },
    drums: { ...DRUMS.soft, brightness: 7000 },
    bass: { ...BASS.soft, filter: 500, filterLo: 90, filterHi: 360, dur: '2n' },
    lead: { ...LEAD.pluck, brightLo: 500, brightHi: 3000, echoBase: 0.12 },
    pad: { ...PAD.air, filterLo: 280, filterHi: 1800, hold: 5 },
  }),
  // Hard and fast: long distorted kick, offbeat fat-saw bass, supersaw lead, rave stabs.
  'Russian hardbass': makeKit({
    tail: 3,
    pump: true,
    reverb: { decay: 1, preDelay: 0.01, wet: 0.4 },
    drums: { ...DRUMS.hard, brightness: 12500 },
    bass: BASS.pump,
    lead: { ...LEAD.supersaw, brightLo: 2000, brightHi: 8000 },
    pad: { ...PAD.rave, filterLo: 900, filterHi: 5000 },
  }),
  // To add a kit: an entry here made of DRUMS / BASS / LEAD / PAD presets (add a preset above for a
  // new sound), and a genre of the same name in patterns.js. `pump` is the sidechain depth on each beat.
  // Fast two-step break: punchy kit with a cracking snare, dark reese bass, echoing plucks, held airy chords.
  'Drum and bass': makeKit({
    tail: 6,
    reverb: { decay: 4, preDelay: 0.02, wet: 0.7 },
    drums: { ...DRUMS.breaks, brightness: 10000 },
    bass: BASS.reese,
    lead: { ...LEAD.pluck, delay: { pingpong: true, time: '8n.', feedback: 0.35, send: -8 }, brightLo: 900, brightHi: 5000, echoBase: 0.15 },
    pad: { ...PAD.air, attack: 0.6, release: 2.5, level: -18, filterLo: 400, filterHi: 2500 },
  }),
  // Four-on-the-floor with a squelching resonant bass line up front, sparse saw bleeps and offbeat rave stabs.
  'Acid techno': makeKit({
    tail: 3,
    pump: 0.75,
    reverb: { decay: 1.5, preDelay: 0.01, wet: 0.5 },
    drums: { ...DRUMS.techno, brightness: 11000 },
    bass: BASS.acid,
    lead: { ...LEAD.supersaw, delay: { pingpong: true, time: '8n.', feedback: 0.4, send: -8 }, level: -9, brightLo: 1500, brightHi: 6000, echoBase: 0.2 },
    pad: { ...PAD.rave, level: -8, filterLo: 700, filterHi: 4000 },
  }),
  // Half-time and mellow: dull kit, round bass, soft plucks, electric-piano chords.
  'Lo-fi': makeKit({
    tail: 5,
    reverb: { decay: 3, preDelay: 0.02, wet: 0.7 },
    drums: { ...DRUMS.dusty, brightness: 6500 },
    bass: { ...BASS.soft, filter: 450, dur: '4n' },
    lead: { ...LEAD.pluck, delay: { pingpong: true, time: '4n', feedback: 0.3, send: -10 }, brightLo: 500, brightHi: 2500, echoBase: 0.1 },
    pad: { ...PAD.keys, filterLo: 500, filterHi: 2500 },
  }),
  // Old-school boom bap rap, half-time and swung: hard kick and cracking snare, low sub bass,
  // a chopped dull piano loop, and record scratches from the fourth finger.
  'Boom bap': makeKit({
    tail: 3,
    reverb: { decay: 1.5, preDelay: 0.01, wet: 0.5 },
    drums: { ...DRUMS.boombap, brightness: 8000 },
    bass: BASS.sub,
    lead: { ...LEAD.keys, brightLo: 700, brightHi: 3000 },
    pad: PAD.scratch,
  }),
  // Rolling 16th bass after every kick, tight clicky kick, squiggly saw lead with echo, distant chords.
  'Psytrance': makeKit({
    tail: 4,
    pump: 0.8,
    reverb: { decay: 3, preDelay: 0.02, wet: 0.6 },
    drums: { ...DRUMS.psy, brightness: 11000 },
    bass: BASS.psy,
    lead: { ...LEAD.supersaw, delay: { pingpong: true, time: '8n.', feedback: 0.45, send: -6 }, level: -12, brightLo: 1200, brightHi: 5000, echoBase: 0.25 },
    pad: { ...PAD.air, attack: 1, release: 3, level: -22, filterLo: 400, filterHi: 2000 },
  }),
  // Half-time: long 808 kick and gliding 808 bass, hi-hat rolls, dark bell melody, held chords.
  'Trap': makeKit({
    tail: 4,
    reverb: { decay: 2.5, preDelay: 0.02, wet: 0.6 },
    drums: { ...DRUMS.trap, brightness: 11000 },
    bass: BASS[808],
    lead: { ...LEAD.keys, brightLo: 800, brightHi: 3500 },
    pad: { ...PAD.air, attack: 0.8, release: 2, level: -20, filterLo: 350, filterHi: 1800 },
  }),
  // Half-time: heavy kick and huge snare, wobble bass, vocal-chop lead, dark held chords.
  'Dubstep': makeKit({
    tail: 4,
    reverb: { decay: 2.5, preDelay: 0.02, wet: 0.6 },
    drums: { ...DRUMS.dub, brightness: 10000 },
    bass: BASS.wobble,
    lead: { ...LEAD.chop, level: 0, brightLo: 1200, brightHi: 5000, echoBase: 0.15 },
    pad: { ...PAD.air, attack: 0.8, release: 2.5, level: -20, filterLo: 300, filterHi: 1600 },
  }),
  // Four-on-the-floor: very distorted kick, reverse bass in every gap, euphoric supersaw, big chords.
  'Hardstyle': makeKit({
    tail: 3,
    pump: true,
    reverb: { decay: 2, preDelay: 0.01, wet: 0.5 },
    drums: { ...DRUMS.hardstyle, brightness: 12000 },
    bass: BASS.reverse,
    lead: { ...LEAD.supersaw, delay: { pingpong: true, time: '8n.', feedback: 0.3, send: -10 }, brightLo: 2000, brightHi: 8000, echoBase: 0.15 },
    pad: { ...PAD.rave, level: -12, filterLo: 900, filterHi: 5000 },
  }),
  // Half-time dembow: round kick and snappy snare, sub bass, plucked melody, offbeat piano stabs.
  'Reggaeton': makeKit({
    tail: 3,
    reverb: { decay: 1.8, preDelay: 0.01, wet: 0.5 },
    drums: { ...DRUMS.dembow, brightness: 9500 },
    bass: BASS.sub,
    lead: { ...LEAD.pluck, delay: { pingpong: true, time: '8n', feedback: 0.25, send: -12 }, brightLo: 900, brightHi: 4500, echoBase: 0.1 },
    pad: { ...PAD.keys, decay: 0.3, hold: 0.3, level: -10, filterLo: 800, filterHi: 3500 },
  }),
  // Fast skittering kicks, sub bass, sparse bell notes, stuttering vocal chops from the fourth finger.
  'Footwork': makeKit({
    tail: 3,
    reverb: { decay: 1.8, preDelay: 0.01, wet: 0.5 },
    drums: { ...DRUMS.footwork, brightness: 10000 },
    bass: BASS.sub,
    lead: { ...LEAD.keys, level: -10, brightLo: 900, brightHi: 3500 },
    pad: PAD.vox,
  }),
  // Bouncy five-kick bar and loud clap, short bass, vocal-chop lead, chopped vocal stabs from the fourth finger.
  'Jersey club': makeKit({
    tail: 3,
    pump: 0.85,
    reverb: { decay: 1.5, preDelay: 0.01, wet: 0.5 },
    drums: { ...DRUMS.club, brightness: 10500 },
    bass: { ...BASS.pluck, level: -10 },
    lead: { ...LEAD.chop, level: -8, brightLo: 1500, brightHi: 6000, echoBase: 0.12 },
    pad: { ...PAD.vox, maxLen: 0.1 },
  }),
  // Percussive looping techno: driven kick, rolling toms and rims, shuffled metal hats, funky bass stabs,
  // one-note piano stabs, organ chords.
  'Hard groove': makeKit({
    tail: 3,
    pump: 0.8,
    reverb: { decay: 1.5, preDelay: 0.01, wet: 0.45 },
    drums: { ...DRUMS.groove, brightness: 11000 },
    bass: { ...BASS.pluck, level: -9, filterLo: 300, filterHi: 1100 },
    lead: { ...LEAD.keys, delay: { time: '8n.', feedback: 0.3, send: -12 }, level: -10, brightLo: 900, brightHi: 4000, echoBase: 0.12 },
    pad: { ...PAD.organ, level: -12, filterLo: 700, filterHi: 4000 },
  }),
};
