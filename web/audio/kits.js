// Sound kits. A kit is a spec of voice presets; makeKit turns it into a builder
// `(out) => Kit` whose instruments connect only to `out`.
// Kit = { drums, bass, lead, pad, update(hearts, t), lift(voice), silence(), dispose(), ready, tail }.
// Each voice is (params, heart, time) => void, where heart is that finger's heart.js state.
import * as Tone from 'https://cdn.jsdelivr.net/npm/tone@15.0.4/+esm';

const midi = (m) => Tone.Frequency(m, 'midi').toNote();
const gain = (add, db = 0) => add(new Tone.Gain(Tone.dbToGain(db)));

// Heart rate drives timbre: clamp to 55..110, then map linearly or exponentially.
const hr01 = (hr) => (Math.min(110, Math.max(55, hr)) - 55) / 55;
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
};

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
    setTone = (hr, t) => fm.modulationIndex.setTargetAtTime(hrLin(hr, 1, 4), t, 0.1);
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
      envelope: { attack: 0.005, decay: 0.3, sustain: 0.6, release: 0.25 },
      filterEnvelope: { attack: 0.005, decay: 0.25, sustain: 0.25, release: 0.3, baseFrequency: 150, octaves: o.octaves ?? 2.5 },
    }));
    setTone = (hr, t) => {
      const cutoff = hrLin(hr, o.filterLo ?? 100, o.filterHi ?? 600);
      syn.filter.frequency.setTargetAtTime(cutoff, t, 0.1);
      character.frequency.setTargetAtTime(cutoff, t, 0.1);
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
};

// ---------------------------------------------------------------- lead
// type 'talkbox':  fat saw through two glided band-pass formants; note picks the vowel, exhale opens "a".
// type 'chop':     square through two formants alternating ah / oh, with a 40 ms pitch scoop.
// type 'supersaw': 7-voice fat saw plus an octave-up copy (-8 dB), lightly distorted.
// type 'pluck':    PluckSynth. Ignores velocity.
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
};

// ---------------------------------------------------------------- pad
// PolySynth of Synth voices: `osc` is a type name, an oscillator object (e.g. custom partials),
// or with `spread` a 3-voice fat one. `attack`/`decay`/`sustain`/`release` override the envelope.
// Chain: synth -> 180 Hz high-pass (keeps it off the bass) -> low-pass following
// heart -> optional slow AutoFilter (`motion` Hz), Phaser, Chorus -> bus.
// Heart: update() sets the low-pass from heart rate, 300..3000 Hz (exponential),
// times 2^breath (+-1 octave with the player's breathing). Called every 16th step.
function pad(ctx, o) {
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
};
