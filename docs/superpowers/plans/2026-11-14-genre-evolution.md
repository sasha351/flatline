# Four Genres and Signal Evolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give French house, UK garage, ambient, and Russian hardbass distinct musical identities, with sensor-driven sound changes and evolving phrases, using kit selection as the only creative control.

**Architecture:** Keep Tone.js voice builders and the single 16th-note transport. Add genre data to the pure pattern module and a small pure evolution engine that selects sensor-influenced phrases and returns timed musical events; `audio.js` translates these into synth calls and existing visual events. Keep sensor processing and the public event bus unchanged.

**Tech Stack:** Browser ES modules, existing Tone.js 15.0.4 CDN import, Node built-in `assert`, `node:test`, and `node:vm`; no package installation or new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-14-genre-evolution-design.md`. Read it with this plan; no chat history is required.

## Global Constraints

- Four kits: Daft Punk inspired French house, UK garage, ambient, Russian hardbass; instrumental inspiration, without recorded vocals or songs.
- Kit selection is the only creative control; preserve connection, simulation, and single-sensor routing controls.
- Reuse Tone.js and existing voice builders; no new dependencies or sample downloads.
- Keep the current channel roles: drums, bass, lead, and pad/chords.
- Keep outlier rejection and the four-beat settling period. Preserve finger presence gating and sensor calibration.
- `press` means relative pulse amplitude, not calibrated pressure. `breath` is a beat-interval estimate, not measured respiration.
- French house: 112–128 / 120 BPM; UK garage: 128–138 / 132 BPM; ambient: 60–90 / 72 BPM; hardbass: 145–165 / 150 BPM.
- Use four-bar phrases for house, garage, and hardbass, and eight-bar phrases for ambient.
- Allow at most one major phrase-choice change per active voice per phrase. No active fingers means no new notes.
- Preserve heart trackers and transport position across kit switches. Switching lands at the next bar while running, immediately while idle; latest selection wins.
- Continue `note` events through `Tone.getDraw()` at audible times and keep analysers on the final mix.
- No bus, firmware, Pi, serial, or visual redesign changes. No new sliders, variation modes, per-voice genre selection, or recording tools.

## Review Focus

- Identical heart rates on all four fingers: per-channel amplitude history and sample seeds must still affect each voice independently (Task 2).
- Finger joins or lifts just before a delayed garage hit: no additional scheduling for an absent voice, and offsets never leak into the next grid cell or bar (Tasks 2 and 4).
- Rapid selection, including selecting the active kit again, during reverb preparation: latest selection wins without duplicate kit allocation, stale replacement, or leaked nodes (Task 4).
- Disconnect/error before a pending switch lands, then reconnect: selected genre survives, pending callbacks clear, and only one transport loop resumes (Task 4).
- Fast, noisy inputs sustained for many ambient phrases: note density stays sparse, modulation stays finite, and effects/polyphony remain bounded (Tasks 2, 3, and 5).

---

## Execution handoff and branch setup

The owner explicitly requested **subagent-driven development by another LLM**.
Do not ask them to choose an execution method again. Use the SDD skill: a fresh
implementer per task, independent spec and quality reviews, then a whole-branch
review. Execute tasks sequentially: these tasks share interfaces and files.
Give each worker this plan, the spec, its task, preceding Interfaces blocks, and
the current commit. Reviews must read connected code, not only the diff. Run the
three existing Node self-checks listed in Task 4 before implementation and record
any pre-existing failures separately.

**Create a new branch before any implementation.** Suggested name:
`sound-genre-evolution`. Do not implement on `main` and do not reuse the previous
`flatline-ferrofluid` branch. Use `superpowers:using-git-worktrees` at execution
time if an isolated checkout is needed; creating the named branch in the current
checkout is sufficient when it is already dedicated to this work.

At plan preparation the checkout was `/Users/sasha/Documents/trackPrint`, branch
`main`, baseline `524585ffed43dc57929cf1b4c185a8edde7af4b2`. These are orientation,
not a command to reset or discard newer work. Read `AGENTS.md` if present and run:

```bash
git status --short
git branch --show-current
git log -1 --oneline
git switch -c sound-genre-evolution
```

If that branch already exists, inspect it; use a fresh suffix rather than reset
or overwrite it. If checkout is dirty, preserve user changes. The known handoff
docs are this plan, its spec, and the follow-up paragraph in
`docs/superpowers/plans/2026-11-14-flatline-sound.md`; carry these into the new
branch and commit only these explicit paths if still uncommitted. Never use
`git add .`. If isolation would strand uncommitted handoff files, first save
those docs on the new branch, then create the worktree from it.

Read actual current code before editing. Older sound plans are historical;
this plan supersedes their kit, universal tempo, mode, and branching instructions.
Do not push, merge, deploy, or message teammates as part of this handoff.

## File map and contracts

| File | Responsibility / change |
| --- | --- |
| `web/audio/patterns.js` | Add `GENRES`: pure musical settings, per-voice variant grids; retain legacy exports until Task 4 removes callers |
| `web/audio/tempo.js` | Genre-aware tempo mapping/follower; preserve legacy call defaults until Task 4 |
| `web/audio/mapping.js` | Reuse `fields`, `note`, `ROOT`, `SCALE`; add `phraseSeed(raw, heart)` |
| `web/audio/evolution.js` (new) | Pure phrase state and conversion from genre grids to events |
| `web/audio/kits.js` | Four synth palettes, smoothed continuous controls and grid-driven house pumping |
| `web/audio/audio.js` | Sensor-to-engine adapter, scheduling, quantized selection and cleanup |
| `web/audio-test.mjs` (new) | Node tests for new pure behavior and recorded Tone/bus boundaries |
| `web/test.mjs` | Retain core/signal/serial/visual tests; remove assertions solely for replaced legacy music APIs in Task 4 |
| `README.md` | Four kits and automatic sensor evolution; explain signal limitations |

`web/package.json` is already `{ "type": "module" }`; no build pipeline is needed.
UI reads `kits: string[]` and constructs the dropdown automatically. Use display
names directly as keys, in this order: `'French house'`, `'UK garage'`, `'Ambient'`,
`'Russian hardbass'`. Do not add a metadata adapter or change the bus.

Existing shared contracts: `frame` provides `{raws, ch}` arrays of length four;
each `ch` has `{finger, ac, beat, bpm, amp, inst}`. `createHeart(50)` returns an
updater yielding `{on, settled, hr, press, breath}`. `VOICES` is
`['drums', 'bass', 'lead', 'pad']`. Kits remain `(out) => {drums, bass, lead, pad,
update, lift, silence, dispose, ready, tail}`. A voice receives `(params, heart,
time)`. `note` includes `{voice, ...params, kit}`. Use seconds for event durations.

Current callers found: only `audio.js` and `web/test.mjs` consume the music mapping,
tempo, and pattern APIs. Re-run `rg` before deleting exports. Keep `heart.js`,
`signal.js`, `core.js`, `serial.js`, `bus.js`, and `web/ui/**` behavior intact.

### Task 1: Genre data and tempo boundaries

**Files:** Modify `web/audio/patterns.js`, `web/audio/tempo.js`; create `web/audio-test.mjs`.

**Interfaces:**
- Produce `GENRES[name] = {tempo: {min, max, default}, phraseBars, swing, patterns}`. `swing` is a fraction of one 16th delayed on odd steps: garage `0.30`, others `0`.
- `patterns = {drums: DrumGrid[], bass: NoteGrid[], lead: NoteGrid[], pad: ChordGrid[]}`; every grid has 16 slots. Provide at least three variants per voice per genre.
- `DrumGrid` maps drum names (`kick`, `snare`, `clap`, `hat`, `openhat`, `tom`, only as used) to 16 booleans. `NoteGrid` slots are `null` or `{degree, octave, gate, velocity}`. `ChordGrid` slots are `null` or `{degrees, octave, gate, velocity}`. Degrees index the existing scale; octaves are relative to `ROOT`; `gate` is a positive number of 16ths, `velocity` is 0..1.
- Extend `songBpm(hr, genreName?) -> number` and `createTempo(genreName?) -> update(heart) -> number`. An explicit genre uses linear HR 50..110 mapping clamped to its min/max, defaults while off/unsettled, and the existing 2 BPM target-change threshold. Temporarily retain no-argument legacy behavior for a runnable intermediate commit.

- [ ] **Step 1: Add failing tests** using built-in `node:test`. Pin names, ranges, defaults, phrase lengths and swing:

```js
assert.deepEqual(Object.keys(GENRES), ['French house', 'UK garage', 'Ambient', 'Russian hardbass']);
for (const [name, lo, hi, def, bars] of [
  ['French house',112,128,120,4], ['UK garage',128,138,132,4],
  ['Ambient',60,90,72,8], ['Russian hardbass',145,165,150,4],
]) {
  assert.equal(songBpm(30, name), lo);
  assert.equal(songBpm(80, name), (lo + hi) / 2);
  assert.equal(songBpm(150, name), hi);
  assert.equal(createTempo(name)(HEART_OFF), def);
  assert.equal(GENRES[name].phraseBars, bars);
}
assert.equal(GENRES['UK garage'].swing, 0.30);
```

Also assert all grids are length 16, cells valid/finite, variants differ, and the
genre defaults are returned with `on:true, settled:false`. Pin the main identity:
house/hardbass base kicks at `[0,4,8,12]`, hardbass base bass at `[2,6,10,14]`, garage
base kicks not the four-on-floor grid, ambient lead at most two onsets per bar and
pad at most one. Ambient drums have at most four piece hits per bar, bass at most
two; preserve these maxima for all its variants, including any ending fill.

- [ ] **Step 2:** Run `node --test web/audio-test.mjs`; expect a missing `GENRES` export failure before implementation.
- [ ] **Step 3:** Add the data and tempo signatures above. Follow spec palettes; exact motifs are listening choices. A variant must change musical content, not merely its velocity. Add tempo-follower assertions for first settled lock, jitter under 2 BPM, movement of at least 2 BPM, and return to the genre default on lift. Keep existing legacy tests green in this task.
- [ ] **Step 4:** Run `node --test web/audio-test.mjs` and `node web/test.mjs`; expect zero failures and the existing `* ok` groups.
- [ ] **Step 5:** Commit these explicit paths with `feat(sound): define four genre palettes and tempo ranges`.

### Task 2: Sensor-driven phrase engine

**Files:** Create `web/audio/evolution.js`; modify `web/audio/mapping.js`, `web/audio-test.mjs`.

**Interfaces:**
- Consume Task 1 `GENRES` and existing `note(index, octave)`, `SCALE`, `ROOT`, `VOICES`, `HEART_OFF`.
- Produce `phraseSeed(raw, heart) -> uint32` in `mapping.js`: deterministically mix sample bit fields with quantized `press` and `breath`. No `Math.random`, wall clock, or HR-only seed. Inputs come from the existing validated frame/heart boundary.
- Produce `createEvolution(genreName) -> {next}`. `next({raws, hearts, step, stepSeconds}) -> Event[]`; `step` starts at zero, increases once per callback, and is local to this engine's genre session. `Event = {voice, params, offset}`; `offset` is seconds, `params` is `{drum, velocity}` for drums or `{notes, velocity, duration}` for pitched voices. `duration = gate * stepSeconds`. No Tone imports, timers, bus events, or audio nodes.
- The engine owns one selected variant per voice per phrase. At `step % (phraseBars*16) === 0`, snapshot each active channel and choose `(phraseSeed(raw, heart) + phraseIndex) % variantCount`. Off/unsettled features use neutral values; raw seed becomes zero until settled. Off voices keep their last motif (initially variant zero). Rejoining mid-phrase plays that motif until the next phrase choice. This allows stable inputs to evolve without new random machinery.

- [ ] **Step 1:** Add `phrase evolution` tests and a local `runBars(name, {bars, raws, hearts})` fixture returning events grouped by bar by repeatedly calling the real engine. Use fixed arrays, `stepSeconds = 0.125`, and cloned heart objects. Assert:

```js
assert.deepEqual(runBars('UK garage', input), runBars('UK garage', input));
assert.deepEqual(createEvolution('Ambient').next({raws:[0,0,0,0], hearts:Array(4).fill(HEART_OFF), step:0, stepSeconds:0.125}), []);
```

For each genre run three phrases: the motif repeats within each phrase (except
explicit alternate bars / ending fills), adjacent phrases differ for at least one
voice, all notes satisfy `SCALE.includes(((m-ROOT)%12+12)%12)`, bass MIDI 33..64,
lead 57..93, pad 45..88, velocity 0..1, duration positive/finite, and
`0 <= offset < stepSeconds`. Use small octave folds to keep generated voicings in
range. All voices share A-root pentatonic; no independent key shifts.

With all HR fixed at 75, change each channel's raw/press/breath fixture separately
across a finite seed sweep: assert at least one of its phrase choices changes and
the other three voices' events remain identical. Before a phrase boundary, large
raw changes must not change pitches, rhythm, or chosen motif. With unsettled
hearts, raw changes must not alter the neutral motif selection. On lift, that
voice returns no events; on rejoin mid-phrase it uses the retained motif.

Exercise garage steps 14, 15 and the next 0: offset every odd step by
`GENRES[name].swing * stepSeconds`, zero elsewhere, strictly increasing absolute
event times for each monophonic instrument. Ignore simultaneous different drums
when checking monotonicity. Repeat ambient for 100 phrases with extreme valid
inputs: maintain Task 1's onset ceilings and note bounds.

- [ ] **Step 2:** Run `node --test web/audio-test.mjs`; expect missing engine/seed failures.
- [ ] **Step 3:** Implement the exact engine/seed interfaces. Use a small integer mix, existing bit helpers, and table lookups. Permit restrained ending fills only on the last bar of a phrase; repeat the chosen base motif on other bars. Bound any register/voicing choices; drum accents may vary with current amplitude, but raw noise cannot re-pick pitches per step. Leave smoothing to Task 3's audio parameters.
- [ ] **Step 4:** Run `node --test web/audio-test.mjs` and `node web/test.mjs`; expect all passing. Verify the new pure files do not import Tone.js.
- [ ] **Step 5:** Commit explicit changed paths with `feat(sound): evolve sensor-driven musical phrases`.

### Task 3: Four synth identities and continuous modulation

**Files:** Modify `web/audio/kits.js`, `web/audio-test.mjs`.

**Interfaces:**
- Consume Task 1's genre names and Task 2 event params. Export only the four new named builders in `KITS`, in genre order.
- Preserve all existing Kit methods. Extend `kit.update(heartsByVoice, time, stepInBar = 0)`; `stepInBar` is 0..15. `audio.js` starts supplying it in Task 4; default zero keeps the intermediate caller valid.
- Bass, lead, and pad honor `params.duration` in seconds when present, otherwise their existing preset duration. Keep velocity and note events representative of what is played. Register every added node with existing `add` so `dispose()` frees it.
- Continuous controls: drums amplitude/brightness; bass filter/FM character and modest grit; lead brightness/articulation and modest echo send; pad filter and texture/effect balance. Use per-voice signal state. Smooth live gain/filter/send controls using AudioParam ramps/targets (start with 0.1 seconds), bound sends and feedback below 1, and keep neutral controls until settled. Do not reinterpret amplitude as user pressure.

- [ ] **Step 1:** Add `kit boundaries` tests using the existing `web/stage-test.mjs` pattern: read real module text, strip its import lines, run in `node:vm` with recording Tone constructors and injected `GENRES` if imported. Record node connections, trigger args, automation, and disposal. Assert exact key order, required methods on all kits, duration forwarded for bass/lead/pad, finite bounded automation, and every constructed node disposed once. Make the fake cover APIs actually used, not a general synth emulator.
- [ ] **Step 2:** Run `node --test web/audio-test.mjs`; expect old kit-name/duration/update behavior to fail.
- [ ] **Step 3:** Tune existing factory presets to the four palettes. House: rounded bass, short filtered chord stabs and hooks; garage: short sub bass and bell/chord answers; ambient: soft long swells and spacious tails; hardbass: short resonant FM/filtered donk and assertive short riffs. Remove unused old presets instead of retaining hidden kits. Set tails long enough for actual releases/effects, with feedback bounded and polyphony at most the existing 16.
- [ ] **Step 4:** Add house pumping on the musical grid using a registered gain on tonal voices, dip on steps 0/4/8/12 and recover before the next beat. `update` drives it even with drum heart off. Record and assert those gain dip/recovery times; other genres must have no pumping automation. Assert noisy/maximal inputs over repeated updates never schedule nonfinite or out-of-range gain, filter, delay feedback, or distortion values. Avoid rebuilding nodes inside `update`.
- [ ] **Step 5:** Run `node --test web/audio-test.mjs` and `node web/test.mjs`; expect all passing. Start the existing browser sim for a preliminary sound check; this is not the final genre/evolution acceptance until Task 4 connects the engine.
- [ ] **Step 6:** Commit explicit paths with `feat(sound): give each genre its own synth character`.

### Task 4: Integrate scheduling and safe kit selection

**Files:** Modify `web/audio/audio.js`, `web/audio/tempo.js`, `web/audio/patterns.js`, `web/audio/mapping.js`, `web/test.mjs`, `web/audio-test.mjs`.

**Interfaces:** Consume `createEvolution`, `GENRES`, `createTempo(name)`, updated Kit API. Public bus events remain unchanged. Keep `play(voice, params, heart, time, key=voice)` as the shared audio/visual trigger path, with a separate monotonic key per drum piece. Capture the actual kit name when scheduling each note.

- [ ] **Step 1:** Add `audio lifecycle` integration tests that execute real `audio.js` in `node:vm`, strip imports as in the stage tests, and inject real pure modules with recorded Kit/Tone/bus/timer boundaries. The fake transport must record one repeat callback, start/stop, BPM ramps/cancellation, and draw scheduling; manually tick it with controlled frames/times. Assert:

  - Initially French house/default 120; running starts one loop; all-off input triggers no notes.
  - Each selected genre uses its own events and default/range. BPM changes ramp over two bars: `(8 * 60) / currentBpm` seconds. A genre switch must force a ramp even if its new target differs by less than 2 BPM.
  - Select garage then hardbass before the next bar: no early allocation, only hardbass is created at step zero. Select the already-active genre: no replacement. A new selection of the active genre cancels a different pending selection.
  - Switch while settled: no new heart trackers, no transport restart/position reset; genre engine starts at local step zero on that global bar. Compare stable frame outputs before/after to prove no re-settling.
  - Pending selection then disconnect/error: no pending activation while stopped; next start uses the last selected genre and a fresh phrase. Call `transport.stop()` and reset its position on non-running status so the callback cannot continue silently scheduling. Keep one registered repeat callback across reconnects.
  - Idle kit selection applies immediately. Outdated reverb-ready completions cannot replace the current selection; handling rejection must not create an unhandled promise or retain an unusable pending kit. Test a deferred/rejected `ready` promise and selection superseded before it resolves.
  - Lift one finger: pad release called once, no new voice triggers after absence is observed; other voices continue. Already-scheduled lookahead events/tails may finish. No swing event is scheduled beyond its own grid cell.
  - Every voice trigger has a corresponding draw event at exactly its effective trigger time, including garage offsets and the existing monotonic timestamp guard. The event's `kit` belongs to the synth that was triggered.
  - Each replaced kit is silenced and disposed exactly once after its tail. Rapidly alternate genres 100 times, advance disposal timers, and assert only the active kit remains; never more than one repeat callback.

- [ ] **Step 2:** Run `node --test web/audio-test.mjs`; expect integration behavior to fail against the old scheduler.
- [ ] **Step 3:** Replace band-based drum/bass selection and HR-only lead speed with engine events. Pass actual 16th duration to `next`, add `event.offset` to scheduled time, and call `kit.update(heartsByVoice, time, step % 16)` each grid callback. Keep `createHeart(50)` trackers outside kit state. Make selected name and active name explicit so pending selections survive stop correctly. Instantiate and activate only the winning selection synchronously at a boundary; reverb `ready` completion must never drive activation. Observe its rejection: ignore stale errors after disposal, but for an active failed kit report through existing `status` error behavior, silence it, and mark it for fresh creation before the next start. Release/dispose old kits through existing `tail` ownership, once per kit. Keep master/compressor/limiter/analyser routing.
- [ ] **Step 4:** Remove replaced internal APIs after `rg` confirms no remaining callers: tempo bands / `TEMPO_DEFAULT`, legacy drum/bass/pad grids and `leadLevel` tables, old raw-to-arpeggio `mapVoice`/`ARP` if unused. Make genre argument required for new tempo APIs and remove their temporary legacy defaults. Retain useful scale, bit-field, note and seed helpers. Remove only obsolete music assertions from `web/test.mjs`; preserve heart tracking tests including settling/outliers and all serial/signal/core/visual coverage. Update top-of-file comments describing music behavior.
- [ ] **Step 5:** Run `node --test web/audio-test.mjs`, `node web/test.mjs`, `node web/fluid-test.mjs`, `node web/stage-test.mjs`, and `git diff --check`. Expect zero failures, `fluid contract self-check ok`, `stage integration self-check ok`, existing core groups, and no whitespace output.
- [ ] **Step 6:** Commit explicit paths with `feat(sound): schedule evolving genres and quantized kit changes`.

### Task 5: Listening acceptance and user documentation

**Files:** Modify `README.md`; audio files only for issues revealed by acceptance; record concise results in this plan below.

**Interfaces:** All preceding interfaces remain fixed. Tests must be rerun for any listening-driven logic changes; do not weaken bounds to make an auditory issue disappear.

- [ ] **Step 1:** Serve the actual execution checkout, not an old worktree. From its `web` directory run `python3 -m http.server 8001 --bind 127.0.0.1`; choose another free port if occupied. Open Chrome/Edge, click **Simulate** to unlock audio, and check the four dropdown names and console. `?demo` is a screenshot aid; it may not unlock audio without a real gesture.
- [ ] **Step 2:** Audition the same simulator sequence for every genre for at least three full phrases (ambient may take several minutes). Confirm house has a funk motif and grid pumping, garage has audible two-step swing, ambient remains sparse with long space, and hardbass has an unmistakable offbeat donk and driving kick. Listen for hooks that recur within phrases and evolve between them. Do not claim to have heard audio from screenshots, waveform inspection, or silent automation. If the environment cannot audition, report that explicitly and leave this listening acceptance unchecked for the owner.
- [ ] **Step 3:** Audition each voice alone, lift/rejoin, all voices together, drum absent, rapid kit changes, and reconnect. Use real hardware if available; otherwise drive frames using the existing bus from a temporary browser-console fixture (save the latest simulated frame, emit copies with selected channels' `finger/beat` off, and let simulation resume afterward; do not add production controls). Confirm no clicks, stuck notes, obvious clipping, runaway echoes, severe loudness jumps, or sustained node growth. Confirm the independent voices retain their genre character. Do not treat this fixture as a physiological hardware check.
- [ ] **Step 4:** Update README near **Run** with the four styles, automatic per-sensor voice evolution, and kit selection as the creative control. Explain that pulse amplitude and beat-interval variation are modulation sources, not calibrated pressure/breathing controls. Keep setup/routing instructions. Record below: browser, port/checkout, commands/results, genres/phrases actually heard, switching stress results, hardware used or unavailable, and remaining listening acceptance.
- [ ] **Step 5:** Run all four Node commands from Task 4 plus `git diff --check`; expect all passing. Have the SDD whole-branch reviewer compare against this plan and spec, verify cleanup and scope, and resolve material findings before handoff.
- [ ] **Step 6:** Commit explicit changed files with `docs(sound): describe evolving genres and record validation`. Report branch, commits, tests, listening evidence and remaining owner hardware acceptance. Leave the new branch available for review; no merge/push/deploy without a later request.

## Acceptance record

Executed by Task 5 on 2026-11-14 from the actual checkout
`/Users/sasha/Documents/trackPrint` on branch `sound-genre-evolution`.

- [ ] **Step 1 (server/browser check):** Started `python3 -m http.server 8001
  --bind 127.0.0.1` from `web`; `curl http://127.0.0.1:8001/` returned the
  actual checkout HTML successfully. Browser verification remains incomplete:
  no Chrome, Chromium, Edge, or other browser executable is available in this
  environment, so the Simulate gesture, dropdown, and browser-console checks
  could not be performed.
- [ ] **Step 2 (listening):** Not executed. No browser audio runtime or audio
  hardware is available; no audible listening is claimed. Genre phrases,
  house pumping, garage swing, ambient spacing, and hardbass donk remain owner
  acceptance items.
- [ ] **Step 3 (voice/lifecycle listening):** Not executed. Hardware and browser
  audio are unavailable, so clicks, clipping, tails, loudness jumps, node growth,
  individual-voice character, lift/rejoin, and reconnect were not audibly checked.
- [x] **Step 4 (README):** Updated the Run section with the four styles,
  automatic per-sensor evolution, kit-only creative control, and pulse-amplitude /
  beat-interval limitations.
- [x] **Step 5 (regression checks):** All four Task 4 Node commands and
  `git diff --check` passed; exact commands and outputs are recorded in
  `.superpowers/sdd/task-5-report.md`.
- [x] **Step 6 (scope/self-review):** Only README, this acceptance record, and
  the required Task 5 report were changed for this task. No audio change was
  justified by the unavailable listening environment. Self-review confirmed the
  documented scope and preserved the unchecked listening/hardware items above.

## Planning self-review

Coverage: genre identity/data and tempo → Task 1; independent sensor variation,
determinism, harmony and density → Task 2; timbre, continuous smoothing, house
pumping and resource ownership → Task 3; switching, gating, timing and resets →
Task 4; real listening, regressions and explanation → Task 5. The five Review
Focus conditions have owning tests above. Intermediate commits retain old callers
until the integration task removes them. No implementation has been performed.
