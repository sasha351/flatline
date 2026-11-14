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

function voiceEvent(voice, cell, stepSeconds, offset, heart) {
  const pressure = heart?.on ? clamp(Number(heart.press), 0, 1) : 0.5;
  if (voice === 'drums') {
    return {
      voice,
      params: { drum: cell, velocity: clamp(0.35 + pressure * 0.45, 0, 1) },
      offset,
    };
  }
  const notes = voice === 'pad'
    ? cell.degrees.map((degree) => note(degree, cell.octave))
    : [note(cell.degree, cell.octave)];
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
          degrees = develop(motif, motifPhrase, motifSeed, hearts[LEAD]);
          onset = 0;
        }
      }

      const leadHeart = hearts[LEAD];
      if (!leadHeart?.on) motif = degrees = null; // finger lift: re-landing gives a new tune
      else if (leadHeart.settled && motif === null) {
        motifSeed = phraseSeed(raws[LEAD] >>> 0, leadHeart);
        motif = degrees = makeMotif(motifSeed, leadHeart);
        motifPhrase = 0;
        onset = 0;
      }

      const offset = step % 2 === 1 ? genre.swing * stepSeconds : 0;
      const position = step % 16;
      const events = [];
      VOICES.forEach((voice, index) => {
        const heart = hearts[index];
        if (!heart?.on) return;
        const variant = genre.patterns[voice][selected[voice]];
        if (voice === 'drums') {
          Object.entries(variant).forEach(([drum, grid]) => {
            const hit = grid[position];
            if (hit) events.push(voiceEvent(voice, drum, stepSeconds, offset, heart));
          });
        } else if (variant[position]) {
          let cell = variant[position];
          if (voice === 'lead' && degrees) {
            const n = variant.filter(Boolean).length;
            const len = Math.max(1, Math.min(16, Math.floor(n * genre.phraseBars / 2)));
            const deg = degrees[onset++ % len];
            if (deg === null) return;
            cell = { ...cell, degree: deg };
          }
          events.push(voiceEvent(voice, cell, stepSeconds, offset, heart));
        }
      });
      return events;
    },
  };
}
