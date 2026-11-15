# flatline Part B: Visuals

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Overview, contract, and branching rules:** [`2026-11-14-flatline.md`](2026-11-14-flatline.md). Read it first.

**Owner:** Teammate B. **Branch:** `visuals`, off `main` after the [foundation](2026-11-14-flatline-foundation.md) merges.

**Design decided:** [`../specs/2026-11-14-flatline-visuals-design.md`](../specs/2026-11-14-flatline-visuals-design.md) ("Organic stage", mockup E). B1 Step 1 is done; every later step follows that spec.

**Goal:** make flatline look and feel like an instrument: the page, the controls, how it behaves in every state, and visuals that move with the players' pulses and with the music.

**Files you own:** `web/index.html`, `web/ui/**` (`ui.js`, `style.css`, and any canvas modules, fonts or images you add). You may append your own section to `web/test.mjs` if you write pure helpers worth testing. Anything else in `web/` is shared (contract branch only) or the sound teammate's.

**Contract you work against** (full table in the overview):
- You consume: `status` (sticky), `kits` (sticky), `analyser` (sticky), `frame`, `note`.
- You produce: `connect`, `simulate`, `mode`, `kit`.
- Import only `../bus.js`. Never import Tone.js or anything in `web/audio/`. The `analyser` objects are the only audio objects you touch, and only through `.getValue()`.
- Emit `connect` and `simulate` synchronously inside a click (or key) handler. Web Serial and audio both refuse to start without a user gesture.
- Ignore fields and values you don't know. The sound teammate will add drum names (for example `clap`, `tom`) and maybe new `note` fields. Unknown drum names should get a sensible default look, not an error.
- `index.html` must keep `<script type="module" src="main.js"></script>`. Don't load `ui.js` directly, or audio won't load.

**Running with the other half stubbed:** the stub audio from the foundation is on your branch, so **Simulate** plays sound and emits real `note`, `kits` and `analyser` events. You never need the sound branch to do this work. To see the sound teammate's latest, use the preview step in the overview's branching workflow.

**Every task ends with:** the sim run looks and behaves right, the DevTools console has no errors, the page works at 1280×720 and on a projector-size window, then commit and push.

---

### B1: Aesthetic direction

**Files:** `web/ui/style.css`, `web/index.html`

- [ ] **Step 1: Direction.** Pick one direction and commit to it. Some starting points: clinical (hospital monitor green on black, ECG grid), club (dark, saturated neon, big type), organic (soft gradients, breathing shapes), printed (paper, ink, the "print" in flatline). Collect 5–10 reference images in a folder outside the repo or a shared board.
- [ ] **Step 2: Tokens.** Move the inline `<style>` from `index.html` into `web/ui/style.css` (linked from `index.html`). Define the palette as CSS custom properties on `:root`: background, text, muted, and **one colour per voice** (drums, bass, lead, pad). Every later task uses these.
- [ ] **Step 3: Type.** Choose one or two fonts. Self-host them in `web/ui/fonts/` (the demo may run without Wi-Fi) or use system fonts.
- [ ] **Step 4:** Commit: `feat(ui): visual direction and design tokens`.

---

### B2: Layout and controls

**Files:** `web/index.html`, `web/ui/ui.js`, `web/ui/style.css`

- [ ] **Step 1: Layout.** One screen, no scrolling at 1280×720: a header with the controls and status, and a main area with four voice panels (B3) and the shared music visual (B4). Use CSS grid.
- [ ] **Step 2: Controls.** Connect sensors, Simulate, mode (beats/bits), kit (built from `kits`, so new kits from the sound teammate appear automatically). Style them in the chosen direction. Use real `<button>` and `<select>` (or radio groups) so they stay keyboard and screen-reader friendly, with visible focus styles.
- [ ] **Step 3: Status.** Show each `status` value distinctly: `idle` (prompt to connect or simulate), `running`, `disconnected` (needs attention), `error: …` (show the message). After a click on **Connect** or **Simulate**, disable both until the next `status` event arrives.
- [ ] **Step 4:** Commit: `feat(ui): layout and controls`.

---

### B3: Voice panels (the pulse)

**Files:** `web/ui/ui.js` (or a new `web/ui/panels.js`), `web/ui/style.css`

One panel per voice, coloured with its voice token.

- [ ] **Step 1: Render loop.** Don't touch the DOM on every `frame` (50 per second). Store the latest frame in a variable in the `frame` listener, and draw everything in one `requestAnimationFrame` loop.
- [ ] **Step 2: Pulse trace.** Keep the last ~4 s of `ch[i].ac` per channel (a ring buffer of 200 values) and draw it on a `<canvas>` as a scrolling line. Scale each trace by its own recent max so weak and strong fingers both look alive. Handle `devicePixelRatio` so lines are sharp.
- [ ] **Step 3: Readouts.** Voice name, BPM (show `--` while `bpm` is 0), finger on/off state.
- [ ] **Step 4: Beat.** On `ch[i].beat` give the panel a short visual kick (scale, glow, or a marker on the trace).
- [ ] **Step 5: No finger.** A clear empty state per panel, for example a dimmed panel with "place a finger on sensor N".
- [ ] **Step 6:** Commit: `feat(ui): live voice panels`.

---

### B4: Music-reactive visuals

**Files:** `web/ui/**`

`frame` is the body; `note` and `analyser` are the music. This task makes the music visible.

- [ ] **Step 1: Notes.** React to every `note` in its voice colour. Ideas per voice: drums → a hit shape whose size follows `velocity` and whose form depends on `drum`; bass and lead → pitch (`notes[0]`, MIDI) sets height or hue, so melodies draw a line; pad → a slow full-screen colour wash using the chord. `note` fires when the sound is heard, so trigger visuals immediately.
- [ ] **Step 2: Analyser.** In the render loop call `wave.getValue()` (256 values, −1…1) for an oscilloscope, or `fft.getValue()` (64 bins, dB, roughly −100…0) for a spectrum. Pick whichever fits the direction, or both.
- [ ] **Step 3: Composition.** Combine panels, note visuals and the analyser into one screen that still reads clearly from across a room.
- [ ] **Step 4: Performance.** With the sim running, the DevTools Performance panel should show a steady 60 fps and no growing memory. Reuse arrays and canvases instead of creating new ones every frame.
- [ ] **Step 5:** Commit: `feat(ui): music-reactive visuals`.

---

### B5: States, behaviour, and the performance view

**Files:** `web/ui/**`, `web/index.html`

- [ ] **Step 1: Onboarding.** The first screen (status `idle`) explains in one line what to do: connect the sensors or simulate.
- [ ] **Step 2: Unsupported browser.** If `!('serial' in navigator)`, disable **Connect sensors** and say "Use Chrome or Edge to connect sensors. Simulate still works."
- [ ] **Step 3: Disconnect and errors.** A visible banner on `disconnected` and on `error: …`, with a way to reconnect. Cancelling the port picker shows an error status; make that look calm, not alarming.
- [ ] **Step 4: Reduced motion.** Under `@media (prefers-reduced-motion: reduce)`, replace flashes and large movement with gentle fades.
- [ ] **Step 5: Performance view.** A fullscreen toggle (`document.documentElement.requestFullscreen()`) that hides the controls and leaves only the visuals, for demos. `Esc` exits.
- [ ] **Step 6:** Commit and push: `feat(ui): states, accessibility, and performance view`. Tell Teammate A about anything in the visuals that would benefit from new `note` fields, and move to Part I in the overview plan.
