# flatline visuals: design direction

The current mockup is [`2026-11-14-flatline-ferrofluid-mockups.html`](2026-11-14-flatline-ferrofluid-mockups.html). The earlier “organic stage” direction is superseded.

## Tokens

| Token | Value | Use |
|---|---|---|
| `--bg` | `#070708` | background |
| `--bg2` | `#17181c` | background highlight |
| `--text` | `#f3f2ee` | title and BPM numbers |
| `--muted` | `rgb(243 242 238 / .56)` | status and captions |
| `--line` | `rgb(243 242 238 / .16)` | borders and inactive labels |
| `--drums` | `#ff3b1f` | drums |
| `--bass` | `#1f6bff` | bass |
| `--lead` | `#ffd400` | lead |
| `--pad` | `#ff2d87` | pad |
| `--other` | `#9fe6c4` | fallback for unknown voice names |

Type: **Fraunces** (roman for BPM numerals, italic for title, voice names and empty states) and **Nunito** 400/600 (controls, status). Self-host only those faces as woff2 in `web/ui/fonts/`, because the demo may run offline.

## Layout

- Everything is sized in `vh` so it scales to a projector. The 10vh header overlays a full-height stage.
- **Assigning**: four player windows and labels appear in columns. **Merged**: one large window appears above a row of four player labels. The layout merges when all four fingers are down and BPM is available; it splits after any finger has been up for 2 s.
- **Notes lane**: the last 5 s of `note` events, newest at the right, sits in the bottom 16vh, with the `wave` analyser as a faint ribbon behind it.
- A full-size WebGL canvas draws the stage and a 2D canvas draws the lane. One `requestAnimationFrame` loop drives the visuals; the header, banners and controls are DOM.

## Voice panels

- Each voice is a black ferrofluid ball in a backlit window. Spikes rise on the beat and the ball stays smooth between beats.
- A player note ripples its ball; the pulse trace and BPM remain beside it. BPM is rounded, or `--` while unavailable.
- With no finger, the ball and window are grey, the BPM dims, and the label asks for a finger on that sensor.

## Music

| Voice | In the notes lane | On the stage |
|---|---|---|
| drums | ring at the lane floor: kick large, snare medium, hat small, unknown drum medium | none |
| bass, lead | dot at height = pitch (`notes[0]`), size = `velocity` | none |
| lead | consecutive notes joined by a soft curve, so the melody draws a line | none |
| pad | rounded capsule spanning the chord's lowest to highest note | none |
| unknown voice | dot in `--other` | none |

Notes ripple the ball for that player. Drum ripples and the pad wash are gone. In merged state, the window is lit by a slow four-colour dye simulation. The analyser draws `wave` only; `fft` isn't used because the lane already shows pitch.

## States

- **Idle**: four grey balls and the line *Connect the sensors, or press Simulate to hear a demo.*
- **Unsupported browser**: Connect is disabled, with the line *Use Chrome or Edge to connect sensors. Simulate still works.*
- **Disconnected / error**: a dark banner under the header with a Reconnect button. A cancelled port picker reads *No port chosen. Connect sensors to try again.*
- **Reduced motion**: no spikes; layouts cross-fade instead of sliding; the dye stays still; brightness lifts briefly on a beat.
- **WebGL support**: WebGL2 and float render targets (`EXT_color_buffer_float`) are required. If either is missing, a message is shown in `#err` and the rest of the page remains available.
- **Performance view**: a button, plus the `F` key, enters fullscreen and hides the header; the cursor hides after 2 s idle; `Esc` exits.
- **Screen readers**: a visually hidden list (voice, finger on/off, BPM) updated once per second. It isn't `aria-live`, to avoid flooding.
