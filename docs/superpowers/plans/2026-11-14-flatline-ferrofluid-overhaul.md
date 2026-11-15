# flatline Ferrofluid Visual Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This plan was written for a controller that has **no memory of the design sessions**: everything you need is in this file, the mockup it names, and the repo.

**Goal:** Replace the web app's stage visuals with the approved "black chrome ferrofluid in backlit windows" design, and rename the site from flatline to **flatline**.

**Architecture:** The approved design already exists as one working, self-contained HTML mockup. This plan ports it into the app's ES modules. A new WebGL2 module (`web/ui/fluid.js`) draws the fluid and the dye-lit window; a new pure module (`web/ui/dynamics.js`) holds the beat spring and the merge rule; `web/ui/stage.js` is rewritten to feed real sensor data into both and to lay out the page; the 2D canvas keeps only the pulse traces and the notes lane.

**Tech stack:** Plain ES modules served as static files (no build step, no package manager), WebGL2 with `EXT_color_buffer_float`, Canvas 2D, Node's built-in `assert` for tests (`web/test.mjs`).

---

## Read this first (controller)

### What the product is

Four heart-rate sensors (one finger each) drive a four-voice band in the browser: channel 0 drums, 1 bass, 2 lead, 3 pad. `web/core.js` turns sensor lines into `frame` events, `web/audio/` makes sound and emits `note` events, `web/ui/` draws. Modules talk only through the event bus in `web/bus.js`; read the comment table at the top of that file, it is the contract.

Run it: `cd web && python3 -m http.server 8000`, open `http://localhost:8000` in Chrome, press **Simulate**.

### The source of truth for the look

`docs/superpowers/specs/2026-11-14-flatline-ferrofluid-mockups.html` (529 lines, one file, runs from `file://` in Chrome). **Open it before doing anything.** The grey strip at the top is the mockup's remote control and is not part of the design. It was approved by the user after many rejected rounds. Treat its look, sizes, timing and shader code as final:

- **Port, do not redesign.** Copy shader strings and tuning constants verbatim. Do not "improve" the fluid, the colours, the spike shape or the dye motion.
- **Do not edit the mockup file.** It stays as the reference.

Mockup URL parameters, useful for side-by-side screenshots: `?f=1111` sets the four fingers (1 = down), `&skip` jumps to the settled state, `&peak` holds the spikes up, `&rm` forces reduced motion.

Map of the mockup (line numbers are stable because the file is frozen):

| Lines | Section | What is in it |
|---|---|---|
| 7-70 | CSS | tokens (`:root`), `#app`, `header`, controls, `#status`, `#banner`, `#text`, `.bpm`, `.lab`, `#hint`, `#err`. Lines 24-33 style the mockup strip: never port those. |
| 73-100 | Markup | strip (lines 73-81, not ported), `#app` (lines 83-100) with `canvas#gl`, `canvas#ov`, header, banner, `#text`, `#hint`, `#err` |
| 103-129 | Constants and state | timings, radii, spring constants, helpers, per-player state `P` |
| 130-138 | `mergeStep` | the merge/split rule |
| 139-165 | Mockup strip logic | not ported |
| 166-215 | WebGL setup | context, shader helpers, float targets (`mk`, `dbl`), `build`, `resize`, `pass` |
| 216-268 | Dye simulation | stable-fluids solver that lights the merged window: shaders `DYE_FS`, `splat`, `solve`, `dyeStep` |
| 269-406 | Fluid shader | `RAY` fragment shader (raymarched spiked sphere + backlit window), uniform arrays, `drawFluid` |
| 407-462 | Layout and frame | DOM text elements, `frame()`: spring, merge, slide, positions, text, dye, draw |
| 463-527 | Overlay | simulated music (not ported), `ppg` (not ported), `overlay()`: pulse traces and notes lane |

### What the design is (so you can judge a port)

- **Ground:** near-black with a faint radial lift. **Type:** Fraunces (serif, italic for the title and labels) and Nunito (controls). Both are already self-hosted in `web/ui/fonts/`.
- **Voice colours:** drums `#ff3b1f`, bass `#1f6bff`, lead `#ffd400`, pad `#ff2d87`.
- **Each player** is a glossy near-black ferrofluid ball in front of a round window glowing in that player's colour. On each heartbeat a crown of sharp spikes rises and sinks back; between beats it is a smooth dome. No finger: a small grey still ball, a dim `--`, and the label *rest a finger on sensor N*.
- **Two layout states.** *Assigning*: four balls in four columns, each above a large BPM number, a label and a pulse trace. *Merged*: when all four players have a finger down and a BPM, the four slide down into a bottom row (ball, BPM and label side by side) and one large ball appears in the centre, in front of a large window lit by four slowly drifting colours. A finger lifted for 2 s splits it back.
- **Notes lane** ("what you hear") along the bottom in both states.
- **Reduced motion:** no spikes and no slide; brightness lifts on the beat and the two layouts cross-fade.

### How to run this plan with subagents

- One fresh implementer subagent per task, then a reviewer subagent, then you look at the result yourself. Do not let an implementer start the next task.
- Give each implementer: the **Global Constraints** section, its own task section verbatim, and nothing else from this plan. It reads the mockup line ranges its task names; tell it not to read the rest.
- **Cheapest model that fits.** Each task names a suggested tier: *small* (mechanical edits, docs) or *mid* (shader and layout code). The owner of this project watches token usage: do not use your largest model to write code, do not re-do finished work, and do not have subagents re-read whole files they were given ranges for.
- Reviewer brief for every task: "Check the diff against the task's Requirements and Global Constraints. For ported code, compare against the named mockup lines and report any difference that is not listed as an intended change. Run the task's verification commands and paste the output."
- **Visual checks are yours.** After tasks 3, 4 and 5 take the screenshots described in that task and read them next to the mockup's. Do not accept "looks right" from a subagent without a screenshot.
- Commit after each task on a branch (Task 0 creates it). Do not push or open a PR unless the owner asks.

Screenshot helper (Chrome on macOS; adjust the path on other systems). Headless Chrome uses software WebGL, which is slow but renders correctly:

```bash
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
shot() { # shot <out.png> <url> [budget_ms]
  "$CHROME" --headless=new --hide-scrollbars --enable-unsafe-swiftshader --use-angle=swiftshader \
    --window-size=1920,1080 --virtual-time-budget="${3:-6000}" --screenshot="$1" "$2" 2>/dev/null
}
MOCK="file://$PWD/docs/superpowers/specs/2026-11-14-flatline-ferrofluid-mockups.html"
```

---

## Global Constraints

- No build step, no package manager, no new dependencies. Plain ES modules under `web/`, loaded by `web/index.html`.
- Do not change `web/bus.js`, `web/core.js`, `web/serial.js`, `web/signal.js` or anything under `web/audio/`, `pi/`, `firmware/`.
- Do not edit `docs/superpowers/specs/2026-11-14-flatline-ferrofluid-mockups.html`.
- Ported shader source (the GLSL strings in mockup lines 220-231 and 270-396) is copied byte-for-byte. Ported tuning constants keep their values.
- Everything on screen is sized from `u` = 1% of the viewport height (CSS: `1vh`; JS: `innerHeight / 100`), so it scales to a projector.
- Fonts are only the self-hosted files in `web/ui/fonts/`. No network font loads.
- Voice colours: drums `#ff3b1f`, bass `#1f6bff`, lead `#ffd400`, pad `#ff2d87`. No violet or lavender anywhere in the UI.
- The visible site name is `flatline`, lowercase. Do not rename files, folders, the repo, or the Pi service.
- Chrome and Edge only (Web Serial already requires them). WebGL2 plus `EXT_color_buffer_float` are required; if either is missing, show a plain message in `#err` and keep the rest of the page working.
- Device pixel ratio for the canvases is capped at 2.
- Reduced motion (`matchMedia('(prefers-reduced-motion: reduce)')`, read live each frame as the current code does): spikes stay down, the layouts cross-fade with no slide, the dye window does not flow, brightness lifts briefly on a beat.
- A module that tests import (`dynamics.js`, `lane.js`) must not touch the DOM at import time.
- Code style follows the existing files: terse, comments only where a reader needs them. A deliberate shortcut gets a `// ponytail:` comment naming its limit, as the existing code does.
- Tests: `cd web && node test.mjs` must print every existing `... ok` line plus any new one, and exit 0.
- Do not push, open PRs, or change git config.

---

## File structure

| File | Action | Responsibility |
|---|---|---|
| `web/ui/dynamics.js` | create | Pure maths: the per-player beat spring and the merge/split rule. No DOM. |
| `web/ui/fluid.js` | create | Everything WebGL: context, dye simulation, the fluid shader. Knows nothing about sensors or layout. |
| `web/ui/stage.js` | rewrite | Bus events in; per-player state; layout for both states; BPM and label text; pulse traces; calls `fluid.js` and `lane.js`. |
| `web/ui/lane.js` | modify | Notes lane: restyle to the mockup, same data handling. |
| `web/ui/ui.js` | modify | One added line: `?demo` starts the simulation without a click (for headless screenshots). |
| `web/index.html` | modify | New name, fluid canvas, text layer, error element. |
| `web/ui/style.css` | rewrite | New tokens and layout from the mockup. |
| `web/test.mjs` | modify | Tests for `dynamics.js`. |
| `docs/superpowers/specs/2026-11-14-flatline-visuals-design.md` | modify | Bring the written design in line with what ships. |
| `README.md` | modify | Site name. |

---

### Task 0: Branch and baseline

**Suggested tier:** controller does this itself.

- [ ] **Step 1: Create the branch and commit the references**

```bash
git checkout -b flatline-ferrofluid
git add docs/superpowers/specs/2026-11-14-flatline-ferrofluid-mockups.html docs/superpowers/plans/2026-11-14-flatline-ferrofluid-overhaul.md
git commit -m "docs: approved ferrofluid mockup and overhaul plan"
```

- [ ] **Step 2: Baseline tests**

Run: `cd web && node test.mjs`
Expected: six lines `serial ok`, `signal ok`, `mapping ok`, `heart ok`, `contract ok`, `lane ok`, exit code 0.

- [ ] **Step 3: Baseline pictures of the target**

```bash
mkdir -p /tmp/flatline-shots
shot /tmp/flatline-shots/mock-idle.png   "$MOCK?f=0000&skip"
shot /tmp/flatline-shots/mock-assign.png "$MOCK?f=1110&skip&peak"
shot /tmp/flatline-shots/mock-merged.png "$MOCK?f=1111&skip&peak"
shot /tmp/flatline-shots/mock-rm.png     "$MOCK?f=1111&skip&rm"
```

Read all four. These are what the app must look like at the end.

---

### Task 1: `dynamics.js`, the beat spring and merge rule

**Suggested tier:** small.

**Files:**
- Create: `web/ui/dynamics.js`
- Modify: `web/test.mjs` (append at the end)
- Read: mockup lines 103-138 and 419-426

**Interfaces:**
- Consumes: nothing.
- Produces (later tasks import these exact names from `./dynamics.js`):
  - `SPLIT_MS: number` (2000)
  - `mergeStep(st: {merged: boolean, upAt: number|null}, ready: boolean[], now: number) → {merged, upAt}`. `now` in milliseconds. Returns a new object or the same one; never mutates.
  - `newField() → {T, F, vel, L, rip, lift, fl}`, all 0.
  - `stepField(f, beat: boolean, dt: number) → f`. Mutates and returns `f`. `dt` in seconds.

**Requirements:**
- `mergeStep` is the mockup's function (lines 132-137) unchanged.
- `stepField` is the mockup's per-player update (lines 422-425) for the fields `T, F, vel, L, rip, lift, fl`, using the constants `SPRING_K, SPRING_C, T_DECAY, LIFT_DECAY, RIP_DECAY, FL_DECAY, L_LAG` copied from lines 113-115. On `beat`, set `T = lift = fl = 1` before the decays, exactly as the mockup does. It does not set `rip` (the caller sets `f.rip = 1` when a note plays) and does not handle `pres` or `bump`.
- No DOM, no imports.

- [ ] **Step 1: Write the failing tests.** Append to `web/test.mjs`:

```js
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
```

- [ ] **Step 2: Run to see it fail.** Run: `cd web && node test.mjs`. Expected: the six existing `ok` lines, then an error that `./ui/dynamics.js` cannot be found.

- [ ] **Step 3: Write `web/ui/dynamics.js`** to the Requirements above, copying the logic and constants from the mockup lines named.

- [ ] **Step 4: Run to see it pass.** Run: `cd web && node test.mjs`. Expected: seven `ok` lines ending `dynamics ok`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add web/ui/dynamics.js web/test.mjs
git commit -m "feat: beat spring and merge rule for the ferrofluid stage"
```

---

### Task 2: `fluid.js`, the WebGL fluid and dye window

**Suggested tier:** mid.

**Files:**
- Create: `web/ui/fluid.js`
- Read: mockup lines 166-405 (WebGL setup, dye simulation, fluid shader), and lines 108-111 for `WINDOW_K`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: one export.

```js
// colours: four [r, g, b] arrays in 0..1, in voice order. onError(message: string) is called for a missing
// WebGL2 / float target / shader compile error. Returns null if the fluid cannot run at all.
export function createFluid(canvas, colours, onError) → null | {
  resize(W, H, dpr),   // CSS px size of the canvas and the (already capped) device pixel ratio; sets canvas.width/height and rebuilds the dye targets
  frame(s),            // draws one frame; see below
}
```

`frame(s)` takes one object and keeps no reference to it:

| Field | Type | Meaning (mockup name) |
|---|---|---|
| `t` | number, s | time (`t`) |
| `dt` | number, s | frame step, already clamped by the caller |
| `fade` | number 0..1 | whole-layer opacity (`fade`) |
| `rm` | boolean | reduced motion |
| `blobs` | `Float32Array(15)` | x, y, radius in **device px, y up**, ×5; index 4 is the merged blob, radius 0 hides a blob (`UB`) |
| `state` | `Float32Array(16)` | F, L, ripple, presence ×4 (`US`) |
| `lift` | `Float32Array(4)` | reduced-motion brightness lift (`ULf`) |
| `flash` | `Float32Array(4)` | window flash on a beat (`UFl`) |
| `dye` | `null` or `{ x, y, cyB, RW, big, bumps }` | `null` skips the dye step. Otherwise CSS px: `x, y` window centre used for injection (mockup `X`, `Y`), `cyB` merged blob centre y, `RW` merged window radius, `big` 0..1 how formed the merged blob is, `bumps` `boolean[4]` which players had a beat this frame (`P[k].bump`) |

**Requirements:**
- This is the mockup's lines 166-405 turned into a module with no globals: the things the mockup reads from the page (`gl`, `glc`, `W`, `H`, `u`, `rm`, `COLR`, `P[k].bump`, `$('err')`) come from `createFluid`'s arguments, `resize`, or `frame(s)` instead.
- `DYE_FS` (lines 220-231), `HDR`, `VQ` and `RAY` (lines 270-396) are copied byte-for-byte. All tuning constants (`DYE_W, VEL_W, JACOBI, VORT, PRESS_KEEP, VEL_DISS, DYE_DISS, DYE_SPEED, WINDOW_K`, and the numbers inside `dyeStep`) keep their values.
- `frame(s)` does, in order: if `s.dye`, the mockup's `dyeStep` (injections, then `solve` unless `s.rm`); then the mockup's `drawFluid` (clear to transparent, one full-screen pass). `uT` is 0 when `s.rm`, as in the mockup.
- `createFluid` gets its context with `canvas.getContext('webgl2', { premultipliedAlpha: true, antialias: false })`. Missing WebGL2 or `EXT_color_buffer_float`: call `onError` with the mockup's message text and return `null`. Shader compile errors: call `onError` with the info log.
- `frame` before the first `resize`, or with a zero-size canvas, does nothing.
- No `requestAnimationFrame`, no `ResizeObserver`, no `document` or `getComputedStyle` in this file: the caller owns the loop and the sizing.
- Keep the mockup's units: `dyeStep` uses `H` and `W` in CSS px for splat positions; `blobs` is in device px. Do not "unify" them.

- [ ] **Step 1: Write `web/ui/fluid.js`** to the Requirements.

- [ ] **Step 2: Syntax and import check**

Run: `cd web && node --check ui/fluid.js && node -e "import('./ui/fluid.js').then(m => console.log(typeof m.createFluid))"`
Expected: `function` (no DOM access at import).

- [ ] **Step 3: Shader text is unchanged**

Run from the repo root:

```bash
node -e "
const fs=require('fs');
const strip=s=>s.replace(/\s+/g,'');
const m=fs.readFileSync('docs/superpowers/specs/2026-11-14-flatline-ferrofluid-mockups.html','utf8');
const f=fs.readFileSync('web/ui/fluid.js','utf8');
const cut=(s,a,b)=>strip(s.slice(s.indexOf(a),s.indexOf(b,s.indexOf(a))));
console.log('RAY',cut(m,'vec2 isf(','o = acc * uFade;')===cut(f,'vec2 isf(','o = acc * uFade;'));
console.log('DYE',cut(m,'const DYE_FS','if (Gx) for')===cut(f,'const DYE_FS','};')+strip('};'));
"
```

Expected: `RAY true`. `DYE true` is expected if `DYE_FS` was kept as one object literal; if it prints `false`, the reviewer compares the eight dye shader strings by eye and states the result.

- [ ] **Step 4: Tests still pass.** Run: `cd web && node test.mjs`. Expected: seven `ok` lines.

- [ ] **Step 5: Commit**

```bash
git add web/ui/fluid.js
git commit -m "feat: WebGL ferrofluid and dye window module"
```

(The picture is checked in Task 4, when something calls this module.)

---

### Task 3: Page shell, `index.html` and `style.css`

**Suggested tier:** small.

**Files:**
- Modify: `web/index.html`
- Rewrite: `web/ui/style.css`
- Read: mockup lines 7-23 and 35-70 (CSS; skip 24-33, the strip), lines 83-100 (markup); and the current `web/index.html`, `web/ui/style.css`

**Interfaces:**
- Consumes: nothing.
- Produces (Task 4 relies on these ids and tokens): elements `canvas#gl`, `canvas#stage`, `div#text`, `div#err`; CSS custom properties on `:root`: `--drums --bass --lead --pad --other --bg --bg2 --text --muted --line --num --ui --lab-style --u`; classes `.bpm`, `.lab`, `.bpm.off`.

**Requirements:**

`web/index.html`
- `<title>` and `<h1>` become `flatline`.
- Keep every existing id and its behaviour hooks: `connect`, `sim`, `fs`, `kit`, `status`, `banner`, `bmsg`, `reconnect`, `stage`, `hint`, `idle`, `unsup`, `sr`. `web/ui/ui.js` uses them.
- Add class `primary` to `#connect`.
- Inside `<main>`, in this order: `<canvas id="gl" aria-hidden="true">`, the existing `<canvas id="stage" aria-hidden="true">`, `<div id="text" aria-hidden="true">`, the existing `#hint`, `<div id="err" role="alert">`, the existing `#sr`.
- The kit control keeps its `<label class="kit">Kit <select id="kit">`.

`web/ui/style.css`
- Keep the three `@font-face` rules as they are (paths relative to `web/ui/`).
- Tokens: copy the mockup's `:root` values (lines 12-18) except `--strip`; set `--u: 1vh`; keep `--other: #9fe6c4`. Remove `--bg-a`, `--bg-b`, `--wash-1..3`, `--serif`, `--sans` and every use of them.
- Layout follows the mockup, with `main` playing the role of the mockup's `#app`: `main` fills the viewport (`position: fixed; inset: 0`) with the radial ground; `header` is absolutely positioned over it, `10 * var(--u)` tall; both canvases fill `main`. `#gl` has `pointer-events: none`. `#stage` must receive clicks (the `?fill=sim` routing clicks it).
- Port the rules for header, `h1`, `.controls` buttons and select, `.primary`, `#status` (including the dot), `#banner`, `#text`, `.bpm`, `.lab`, `.bpm.off`, `#hint`, `#err` from the mockup, adapted to the app's ids: the mockup's single `#hint` paragraph styling goes on `#hint p`; `#status[data-state=disconnected]` and `[data-state=error]` use `--text` (no lavender).
- Keep from the current file, restyled only where they named removed tokens: `.kit`, `select option`, `button:disabled`, the `[hidden]` rule for `#banner`, `#hint p`, `#reconnect`, the `.sr` rule, the performance-view rules (`.perf header, .perf #banner { display: none }`, `.still` cursor rule), and the `prefers-reduced-motion` block.
- Delete: `body::before` (pad wash), the `.seg` rules (unused), the old `body` grid.

- [ ] **Step 1: Edit both files** to the Requirements.

- [ ] **Step 2: Nothing removed is still referenced**

Run: `grep -n -E "bg-a|bg-b|--wash|--serif|--sans|\.seg" web/ui/style.css web/index.html`
Expected: no output. (`web/ui/stage.js` still names `--serif` and `--wash` until Task 4 rewrites it; that is expected, and the old stage will draw with fallback fonts for one commit.)

- [ ] **Step 3: Look at it.** Start `cd web && python3 -m http.server 8000` in another shell, then:

```bash
shot /tmp/flatline-shots/t3-shell.png "http://localhost:8000/"
```

Read it next to `mock-idle.png`. Expected: same ground, the title *flatline* in Fraunces italic at the left, the four controls and status at the right in the same style and position as the mockup, hint text in Fraunces italic. The old blobs still draw in the middle; ignore them.

- [ ] **Step 4: Tests.** Run: `cd web && node test.mjs`. Expected: seven `ok` lines.

- [ ] **Step 5: Commit**

```bash
git add web/index.html web/ui/style.css
git commit -m "feat: flatline page shell, black ground and Fraunces controls"
```

---

### Task 4: `stage.js`, real data into the new stage

**Suggested tier:** mid. This is the largest task; give the implementer the whole of this section.

**Files:**
- Rewrite: `web/ui/stage.js`
- Modify: `web/ui/ui.js` (one line)
- Read: the current `web/ui/stage.js` in full; mockup lines 103-129, 407-462 and 482-501 (the trace half of `overlay`); the comment table at the top of `web/bus.js`

**Interfaces:**
- Consumes:
  - from `./dynamics.js` (Task 1): `mergeStep(st, ready, now)`, `newField()`, `stepField(f, beat, dt)`.
  - from `./fluid.js` (Task 2): `createFluid(canvas, colours, onError)` returning `null` or `{ resize(W, H, dpr), frame(s) }`, with `s` = `{ t, dt, fade, rm, blobs: Float32Array(15), state: Float32Array(16), lift: Float32Array(4), flash: Float32Array(4), dye: null | { x, y, cyB, RW, big, bumps } }`. `blobs` is device px with y up.
  - from `./lane.js` (unchanged signature): `drawLane(c, r, now, u, dpr, col)`, `r` = `{x, y, w, h}` in CSS px, `now` in ms, `col` = `{ v: {voice: hex}, other, lead, text, muted, serif }`.
  - from Task 3: elements `#gl`, `#stage`, `#text`, `#err`; tokens `--text --muted --line --num --other` and one per voice.
  - bus events (see `web/bus.js`): `frame` `{ ch: [{finger, ac, beat, bpm}] ×4 }` at about 50 Hz; `note` `{ voice, ... }`; `sensor` `0..3 | null`.
- Produces: nothing other modules import. `web/ui/ui.js` already does `import './stage.js'`.

**Requirements:**

Keep from the current `stage.js` (behaviour unchanged):
- The `frame` handler: ring buffer per channel (`N = 200`), `STALE_MS = 500`, per-channel max for trace scaling, the reset when a finger lifts or frames go stale, and the **latched** beat (a beat that arrives between two animation frames must not be lost).
- The live reduced-motion query (`rm.matches` read at use).
- The resize handling, including the check for a changed `devicePixelRatio`.
- The `sensor` subscription and the ` · sensor` label suffix on the routed voice.
- The `document.fonts.load` call for roman Fraunces (the DOM only uses the italic, the canvas needs roman).
- One `requestAnimationFrame` loop with `dt` clamped (use the mockup's `.033`).

Remove entirely: `METAL`, `SILVER`, `BANDS`, `lit`, `RIM`, `SHINE`, `WARM`, the dust, `blobPath`, `soft`, `drawDrop`, `drawMetal`, the drum ripples (`RIP`, `drawRipples`), the pad wash in the `note` handler, and all text drawing on the canvas.

Add, porting the mockup's `frame()` (lines 414-461) with real data in place of the mockup's simulation:

| Mockup | In the app |
|---|---|
| `p.down` | `live && ch.finger`, where `live` = a frame arrived within `STALE_MS` |
| `ready[i]` (`down` for `READY_S`) | `down && ch.bpm > 0`. Drop `READY_S`. |
| beat (`bi !== p.bi`) | the latched `ch.beat`, consumed once per animation frame |
| lines 422-425 | `stepField(field, beat, dt)` from `dynamics.js` |
| `p.bump` | `true` for the animation frame that consumed a beat |
| `P[i].rip = 1` in the mockup's `note()` (line 468) | on bus `note`, set `rip = 1` on the field of `VOICES.indexOf(n.voice)` (ignore unknown voices) |
| `p.pres` easing | same formula, `PRES_TAU` from line 115 |
| BPM text | `Math.round(ch.bpm)` when ready, else `--` with class `off` |
| label | `` `${voice} · bpm` `` when down, else `` `rest a finger on sensor ${i + 1}` ``; append ` · sensor` when `live && i === sensorCh` |
| `&peak`, `tick(t)`, `P[].per/off/bi` | not ported |
| `$('hint')`, `$('status')` updates | not ported: `web/ui/ui.js` owns them |
| `overlay(t, fade)` | traces drawn here (below), then `drawLane` |

- Layout constants (`SLIDE_S`, `ASSIGN_R_MAX`, `ASSIGN_R_COL`, `ROW_R`, `MERGED_R`, `WINDOW_K`, `PRES_TAU`) are copied from mockup lines 107-115 to the top of the file with their comments. The layout arithmetic (lines 430-452) is copied as is: slide progress, per-blob stagger, positions in `u`, clamping, text position and size, the merged blob, the reduced-motion cross-fade.
- `W`, `H`, `u`: measure `#stage` (it fills `main`); `u = H / 100`; `dpr = Math.min(devicePixelRatio || 1, 2)`. On resize call `fluid.resize(W, H, dpr)` and size the 2D canvas as now.
- Text: create the eight elements in `#text` as the mockup does (lines 408-412) and update them each frame (lines 443-448). Set `#text` opacity to `fade`.
- Fluid: `const fluid = createFluid(gl canvas, colours, (msg) => { #err.textContent = msg })`, colours from the four voice tokens converted to 0..1 RGB. If `fluid` is `null`, keep running everything else (text, traces, lane). Each frame call `fluid.frame({...})` with `dye` = `null` while `prog <= .05`, else `{ x: W / 2, y: 38 * u, cyB, RW, big, bumps }`, matching the mockup's `dyeStep(dt, big, cyB, Rg, RW)` call.
- Pulse traces: draw on the 2D canvas with the mockup's geometry and fade (lines 483-501: width `colW * .56`, centre line `77 * u`, amplitude `3.2 * u`, alpha `pres * (1 - m) * fade`, the three-stop gradient, line width), but take the samples from the ring buffer scaled by the channel's own max, newest at the right, as the current code does. Do not port `ppg`.
- Lane: call `drawLane(c, { x: 0, y: 84 * u, w: W, h: 16 * u }, now, u, dpr, COL)` and build `COL` as the current code does, reading `--num` where it read `--serif`.
- Time: the bus stamps nothing, so use `performance.now()` as the current code does; pass `mergeStep` milliseconds and `stepField` seconds.

`web/ui/ui.js`: add one line after the `$('sim').onclick = ...` line, so headless screenshots can start the simulation without a click (audio stays silent without a user gesture, which is fine):

```js
if (new URLSearchParams(location.search).has('demo')) press('simulate'); // dev: ?demo starts the simulation for screenshots
```

- [ ] **Step 1: Rewrite `web/ui/stage.js`** and add the `ui.js` line, to the Requirements.

- [ ] **Step 2: Checks that need no browser**

Run: `cd web && node --check ui/stage.js && node --check ui/ui.js && node test.mjs`
Expected: no syntax errors, seven `ok` lines.

Run: `grep -n -E "METAL|blobPath|drawMetal|RIPPLE|--wash|--serif|fillText" web/ui/stage.js`
Expected: no output.

- [ ] **Step 3: Pictures.** With the server from Task 3 running:

```bash
shot /tmp/flatline-shots/t4-idle.png   "http://localhost:8000/" 3000
shot /tmp/flatline-shots/t4-early.png  "http://localhost:8000/?demo" 2500
shot /tmp/flatline-shots/t4-merged.png "http://localhost:8000/?demo" 20000
"$CHROME" --headless=new --enable-unsafe-swiftshader --use-angle=swiftshader --virtual-time-budget=4000 --dump-dom "http://localhost:8000/?demo" 2>/dev/null | grep -o '<div id="err"[^>]*>[^<]*'
```

Expected, read against the mockup shots from Task 0:
- `t4-idle.png` matches `mock-idle.png`: four small grey balls in dim windows, four dim `--`, four *rest a finger on sensor N* labels, the hint line.
- `t4-early.png`: four coloured windows with black balls in four columns, BPM numbers or `--` beneath, labels, pulse traces under the labels (the simulation needs a few beats before a BPM shows).
- `t4-merged.png` matches `mock-merged.png` in layout: four small balls in a bottom row with BPM and label to the right of each, one large ball in the centre in front of a four-colour window, notes in the lane. (If it is still in the assigning state, the simulated BPMs had not all locked; raise the budget to 30000 before suspecting a bug.)
- The `--dump-dom` line shows `#err` with no text.
- Nothing overlaps the header, the numbers, the bottom-row text or the lane in any shot.

- [ ] **Step 4: Commit**

```bash
git add web/ui/stage.js web/ui/ui.js
git commit -m "feat: ferrofluid stage driven by live heartbeats, with merge and split"
```

---

### Task 5: Notes lane restyle

**Suggested tier:** small.

**Files:**
- Modify: `web/ui/lane.js` (the `drawLane` function only)
- Read: mockup lines 502-526 (the lane half of `overlay`), current `web/ui/lane.js`

**Interfaces:**
- Consumes: called by Task 4 as `drawLane(c, r, now, u, dpr, col)` with `r = { x: 0, y: 84 * u, w: W, h: 16 * u }`.
- Produces: same signature. `pitch01` and `ring` exports and their behaviour are unchanged (tests cover them).

**Requirements:**
- Geometry and styling match the mockup's lane: side margins `4 * u`; a 1 px hairline in the `--line` colour across the lane's width, `1.5 * u` above the lane's top; the caption *what you hear* in italic Fraunces at `1.7 * u`, muted, at the lane's top left; note sizes, drum ring sizes, pad capsule, the lead melody line and the fade with age as in mockup lines 502-526.
- `col` gains one field the caller must pass: `line` (the `--line` token). Update the `COL` object in `web/ui/stage.js` to include it.
- Keep what the mockup lacks: the faint waveform ribbon from the `analyser` event, the note ring buffer, and the handling of unknown voices and missing pitches.
- Remove the canvas `shadowBlur` glow on notes (the mockup has none).

- [ ] **Step 1: Edit `drawLane`** and add `line` to `COL` in `stage.js`.

- [ ] **Step 2: Tests.** Run: `cd web && node test.mjs`. Expected: seven `ok` lines (`lane ok` among them).

- [ ] **Step 3: Picture.**

```bash
shot /tmp/flatline-shots/t5-lane.png "http://localhost:8000/?demo" 20000
```

Expected: the bottom strip matches the mockup's (`mock-merged.png`): hairline, caption, coloured dots and rings entering from the right. In headless Chrome there is no audio, so the lane may show no notes; in that case confirm the hairline and caption here and check the notes in Task 7.

- [ ] **Step 4: Commit**

```bash
git add web/ui/lane.js web/ui/stage.js
git commit -m "feat: notes lane restyled for the flatline stage"
```

---

### Task 6: Docs

**Suggested tier:** small.

**Files:**
- Modify: `docs/superpowers/specs/2026-11-14-flatline-visuals-design.md`
- Modify: `README.md`

**Requirements:**
- `README.md`: change the top heading to `# flatline` and add one sentence under it: the project folder, repo and Pi service are still named `flatline`. Change nothing else.
- Design spec: rewrite these sections to describe what now ships, in the document's existing plain style, and leave the rest:
  - the opening lines: point to `2026-11-14-flatline-ferrofluid-mockups.html` as the current mockup and say the earlier "organic stage" direction is superseded;
  - **Tokens**: the new values (`--bg #070708`, `--bg2 #17181c`, `--text #f3f2ee`, `--muted`, `--line`, drums `#ff3b1f`, bass `#1f6bff`, lead `#ffd400`, pad `#ff2d87`, `--other #9fe6c4`); remove the pad wash hues;
  - **Layout**: header 10vh overlaying a full-height stage; the two states (assigning, merged) and the rule that switches them (all four fingers down with a BPM; split after a finger is up for 2 s); lane in the bottom 16vh;
  - **Voice panels**: the black ferrofluid ball in a backlit window, spikes on the beat, smooth between beats, grey when no finger;
  - **Music**: notes lane as before; a note ripples that player's ball; drum ripples and the pad wash are gone; the merged window is lit by a slow four-colour dye simulation;
  - **States**: reduced motion now means no spikes, cross-fade between layouts, still dye, a brightness lift on the beat. Add: WebGL2 with float render targets is required, with a message shown if missing.

- [ ] **Step 1: Edit both files.**
- [ ] **Step 2: Check.** Run: `grep -n -i "lavender\|#c79bff\|wash" docs/superpowers/specs/2026-11-14-flatline-visuals-design.md`. Expected: no output, or only a sentence saying the wash was removed.
- [ ] **Step 3: Commit**

```bash
git add README.md docs/superpowers/specs/2026-11-14-flatline-visuals-design.md
git commit -m "docs: flatline name and ferrofluid stage design"
```

---

### Task 7: Final check with the owner

**Suggested tier:** controller, with the human. Headless screenshots cannot judge motion, sound or frame rate, and nobody has measured this design on a real GPU yet. Do not call the work finished before these are done in a real Chrome window.

- [ ] **Step 1: Automated part.** Run: `cd web && node test.mjs` (seven `ok` lines) and re-take the three Task 4 screenshots; compare with the Task 0 mockup shots once more.

- [ ] **Step 2: Ask the owner to open `http://localhost:8000`, press Simulate, and confirm each line.** Report their answers; fix what fails with a new implementer task.

1. Each ball's spikes rise on that player's beat and sink back to a smooth dome.
2. When all four players have a BPM, the four balls slide to the bottom row and the large ball forms; BPM numbers stay readable throughout.
3. The merged window's colours drift slowly (not churning).
4. Notes appear in the lane in time with the sound.
5. Frame rate is smooth at full screen on the demo laptop. If it is not, the first thing to lower is the device pixel ratio cap in `stage.js` (2 → 1.5), then `JACOBI` in `fluid.js` (16 → 10); change one at a time and ask again.
6. **Performance view** (button or `F`) hides the header and the layout still holds; `Esc` exits.
7. With the OS "reduce motion" setting on: no spikes, no slide, brightness lifts on the beat.
8. `http://localhost:8000/?fill=sim` with one sensor (or none): clicking a column still moves the sensor to that voice and its label shows `· sensor`, in both layout states.
9. Unplugging the sensors shows the banner under the header, in neutral colours.

- [ ] **Step 3: Hand over.** Summarise for the owner: commits on `flatline-ferrofluid`, test output, the checklist results, anything left open. Ask whether to merge or open a PR; do neither unprompted.
