import { VOICES } from '../bus.js';
import { GENRES } from './patterns.js';
import { note, phraseSeed } from './mapping.js';
import { makeMotif, develop } from './melody.js';

const LEAD = VOICES.indexOf('lead');
const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
const LIMITS = {
  bass: [33, 64],
  lead: [57, 93],
  pad: [45, 88],
};

function fitNotes(voice, notes) {
  const [lo, hi] = LIMITS[voice];
  return notes.map((value) => {
    let midi = value;
    while (midi < lo) midi += 12;
    while (midi > hi) midi -= 12;
    return midi;
  });
}

export function snapToChord(degree, chord, n) {
  const tones = chord.map((c) => c % n);
  let best = degree, dist = Infinity;
  for (let m = Math.floor(degree / n) - 1; m <= Math.floor(degree / n) + 1; m++) {
    for (const t of tones) {
      const cand = t + m * n;
      if (cand < 0) continue;
      const d = Math.abs(cand - degree);
      if (d < dist || (d === dist && cand < best)) { best = cand; dist = d; }
    }
  }
  return best;
}

function voiceEvent(voice, cell, stepSeconds, offset, heart, key, chord, weight = 1) {
  const pressure = heart?.on ? clamp(Number(heart.press), 0, 1) : 0.5;
  if (voice === 'drums') {
    return {
      voice,
      params: { drum: cell, velocity: clamp((0.35 + pressure * 0.45) * weight, 0, 1) },
      offset,
    };
  }
  const notes = voice === 'pad'
    ? (cell.degrees ?? chord).map((degree) => note(degree, cell.octave ?? 0, key.scale, key.root))
    : [voice === 'bass'
      ? note((chord ? chord[0] : 0) + cell.degree, cell.octave + (note(chord ? chord[0] : 0, -1, key.scale, key.root) < LIMITS.bass[0] ? 1 : 0), key.scale, key.root)
      : note(cell.degree, cell.octave, key.scale, key.root)];
  return {
    voice,
    params: {
      notes: fitNotes(voice, notes),
      velocity: clamp(cell.velocity * (0.75 + pressure * 0.25), 0, 1),
      duration: cell.gate * stepSeconds,
    },
    offset,
  };
}

export function createEvolution(genreName) {
  const genre = GENRES[genreName];
  if (!genre) throw new RangeError(`Unknown genre: ${genreName}`);
  const selected = Object.fromEntries(VOICES.map((voice) => [voice, 0]));
  let localStep = 0;
  // Lead: heart-made motif; the genre lead pattern is only the rhythm template.
  let motif = null, motifSeed = 0, motifPhrase = 0, degrees = null, onset = 0;

  return {
    next({ raws = [], hearts = [], stepSeconds = 0.125 } = {}) {
      const step = localStep++;
      const phraseLength = genre.phraseBars * 16;
      if (step % phraseLength === 0) {
        const phrase = Math.floor(step / phraseLength);
        VOICES.forEach((voice, index) => {
          const heart = hearts[index];
          if (heart?.on) {
            const variants = genre.patterns[voice];
            selected[voice] = (phraseSeed(raws[index] >>> 0, heart) + phrase) % variants.length;
          }
        });
        if (motif) {
          motifPhrase++;
          degrees = develop(motif, motifPhrase, motifSeed, hearts[LEAD], genre.key.scale.length);
          onset = 0;
        }
      }

      const leadHeart = hearts[LEAD];
      if (!leadHeart?.on) motif = degrees = null; // finger lift: re-landing gives a new tune
      else if (leadHeart.settled && motif === null) {
        motifSeed = phraseSeed(raws[LEAD] >>> 0, leadHeart);
        motif = degrees = makeMotif(motifSeed, leadHeart, genre.key.scale.length);
        motifPhrase = 0;
        onset = 0;
      }

      // Swing delays every other 16th. A half-time genre is felt at half the tempo, so its 16ths are our
      // 8ths: there the delayed steps are 2, 6, 10 and 14, by the same share of the (twice as long) note.
      const offset = genre.halfTime
        ? (step % 4 === 2 ? genre.swing * 2 * stepSeconds : 0)
        : (step % 2 === 1 ? genre.swing * stepSeconds : 0);
      const position = step % 16;
      const events = [];
      const { key } = genre;
      const chord = key.chords ? key.chords[Math.floor(step / 16) % key.chords.length] : null;
      VOICES.forEach((voice, index) => {
        const heart = hearts[index];
        if (!heart?.on) return;
        const variant = genre.patterns[voice][selected[voice]];
        if (voice === 'drums') {
          // Energy follows the drum finger's heart: a fast pulse fills in 16th hats, a calm one drops the open hat.
          // ponytail: thresholds are guesses (hr 72..86 is neutral); tune by ear.
          const hot = heart.settled && heart.hr > 86, calm = heart.settled && heart.hr < 72;
          Object.entries(variant).forEach(([drum, grid]) => {
            if (calm && drum === 'openhat') return;
            // One hi-hat can't be open and closed at once, and both use one synth: two hits at the same
            // instant make Tone throw, which dropped every later note of that step. The open hat wins.
            if (drum === 'hat' && !calm && variant.openhat?.[position]) return;
            const hit = grid[position] || (hot && drum === 'hat' && 0.4);
            if (hit) events.push(voiceEvent(voice, drum, stepSeconds, offset, heart, key, chord, hit));
          });
        } else if (variant[position]) {
          let cell = variant[position];
          if (voice === 'lead' && degrees) {
            const n = variant.filter(Boolean).length;
            const len = Math.max(1, Math.min(16, Math.floor(n * genre.phraseBars / 2)));
            let deg = degrees[onset++ % len];
            if (deg === null) return;
            if (chord && position % 4 === 0) deg = snapToChord(deg, chord, key.scale.length);
            cell = { ...cell, degree: deg };
          }
          events.push(voiceEvent(voice, cell, stepSeconds, offset, heart, key, chord));
        }
      });
      return events;
    },
  };
}
