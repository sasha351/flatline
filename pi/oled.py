#!/usr/bin/env python3
"""Spiky-blob display for the 128x64 SH1106 OLED at I2C 0x3C on bus 1 (shared with sensor 0).

Each finger is a spiky ball with its own fill pattern (drums solid, bass checker, lead stripes,
pad dots). Every detected heartbeat shoots that ball's spikes out. When every present finger is
on, the balls slide together into one ball whose colour regions are a dye swirl of the four patterns.

run(q) is the entry point; flatline.py starts it in its own process, so its CPU never holds the
GIL of the sensor threads. q carries (ir0, ir1, ir2, ir3) tuples at 50 Hz, ('n', voice, drum, velocity)
note messages from the browser, and ('h', b0, b1, b2, b3, avg): the BPM the dashboard is showing. While those
arrive the panel prints them, so the two always agree; without a browser it prints its own estimate. Spikes follow the notes; with no note for NOTE_HOLD seconds they follow heartbeats.

  python3 oled.py --demo       drive the real panel with simulated fingers (stop flatline first)
  python3 oled.py --selftest   no hardware: render simulated frames, check, time, print previews
Pure stdlib plus smbus2 (imported only when the panel is opened).
"""
import math
import queue
import random
import signal
import sys
import time

CHIP = 'sh1106'   # or 'ssd1306'; same page addressing, the SH1106 glass is offset 2 columns
ADDR, BUS = 0x3C, 1
FPS = 15          # ponytail: frames per second; each full frame is ~1 KB over the shared I2C bus, so lower it if sensor 0 stutters
RETRY = 5.0       # seconds between attempts to (re)init a missing panel
# ponytail: a missing sensor reads 0 and is skipped, so the rest can still merge.
# Merge when every PRESENT sensor has a finger and at least this many do.
MIN_MERGE = 2
NOTE_HOLD = 2.0   # seconds after a note during which heartbeats do not fire spikes
HOST_HOLD = 2.0   # seconds a BPM line from the browser stays in charge of the numbers (it sends two a second)
W, H = 128, 64
NAMES = ['DR', 'BS', 'LD', 'PD']


def log(s):
    print('oled: ' + s, file=sys.stderr, flush=True)


# ---------- beat detector: port of createChannel() in web/signal.js ----------
# An older, simpler version of web/signal.js (no band-pass, no quality lock). It drives the spikes and the
# finger test. Its BPM is only the fallback for when no browser is connected: see Model.shown().
FINGER_MIN = 30000
WINDOW_S = 1.5
MIN_SWING = 60
REARM = 0.1
BPM_BEATS = 5
HOLD = 5
SAT = 262000
SPIKE_K, SPIKE_MIN = 12, 3000


def robust_bpm(a):
    m = sorted(a)[len(a) >> 1]
    near = [x for x in a if abs(x - m) <= 0.1 * m]
    return sum(near) / len(near)


def create_channel(rate=50):
    """Returns step(raw) -> (finger, beat, bpm), one call per sample."""
    dc_a = 1 / (rate * 0.5)
    lp_a = 0.4
    refractory = round(rate * 0.3)
    N = round(rate * WINDOW_S)
    warmup = round(rate * 0.5)
    win = [0.0] * N
    st = dict(dc=None, lp=0.0, prev_ac=0.0, n=0, k=0, armed=True, last_beat=-math.inf, bpm=0.0,
              recent=[], bad=0, good=0.0, swing=0.0)

    def step(raw):
        s = st
        s['n'] += 1
        held = False
        if s['dc'] is not None:  # a finger is on: screen this reading
            off, sat = raw < FINGER_MIN, raw >= SAT
            spike = (not off and not sat and s['k'] >= warmup
                     and abs(raw - s['lp']) > max(SPIKE_K * s['swing'], SPIKE_MIN))
            if off or sat or spike:
                if s['bad'] < HOLD:
                    s['bad'] += 1
                    raw = s['good']
                    held = True
                elif spike:
                    s['lp'] = raw
                    s['bad'] = 0
            else:
                s['bad'] = 0
        if raw < FINGER_MIN:
            s.update(dc=None, bpm=0.0, recent=[], prev_ac=0.0, k=0, armed=True, last_beat=-math.inf, bad=0)
            return False, False, 0.0
        if not held:
            s['good'] = raw
        if s['dc'] is None:
            s['dc'] = s['lp'] = raw
        s['dc'] += (raw - s['dc']) * dc_a
        s['lp'] += (raw - s['lp']) * lp_a
        ac = s['dc'] - s['lp']
        win[s['k'] % N] = ac
        s['k'] += 1
        w = win[:min(s['k'], N)]
        hi, lo = max(w), min(w)
        mid = (hi + lo) / 2
        s['swing'] = swing = hi - lo
        if ac < mid - REARM * swing:
            s['armed'] = True
        beat = (s['armed'] and s['prev_ac'] < mid and ac >= mid and swing > MIN_SWING
                and s['k'] >= warmup and s['n'] - s['last_beat'] > refractory)
        if beat:
            s['armed'] = False
        s['prev_ac'] = ac
        if beat:
            if s['last_beat'] != -math.inf:
                inst = 60 * rate / (s['n'] - s['last_beat'])
                s['recent'] = s['recent'][1 - BPM_BEATS:] + [inst]
                s['bpm'] = robust_bpm(s['recent'])
            s['last_beat'] = s['n']
        return True, beat, s['bpm']

    return step


# ---------- fonts and pixel helpers (page-format buffer: bit 1 << (y & 7) at x + (y >> 3) * 128) ----------
F3 = {  # 3x5: 5 rows, one octal digit (3 bits, left = high bit) per row
    '0': '75557', '1': '26227', '2': '71747', '3': '71717', '4': '55711', '5': '74717', '6': '74757', '7': '71111',
    '8': '75757', '9': '75717', 'A': '25755', 'B': '65656', 'C': '34443', 'D': '65556', 'E': '74647', 'F': '74644',
    'G': '34553', 'H': '55755', 'I': '72227', 'J': '11152', 'K': '55655', 'L': '44447', 'M': '57755', 'N': '75555',
    'O': '25552', 'P': '65644', 'Q': '25573', 'R': '65655', 'S': '34216', 'T': '72222', 'U': '55557', 'V': '55552',
    'W': '55775', 'X': '55255', 'Y': '55222', 'Z': '71247', '-': '00700', ' ': '00000', '.': '00002', ':': '02020'}
F5 = [  # 5x7 digits: 7 rows of 5 bits
    (0x0E, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0E), (0x04, 0x0C, 0x04, 0x04, 0x04, 0x04, 0x0E),
    (0x0E, 0x11, 0x01, 0x02, 0x04, 0x08, 0x1F), (0x1F, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0E),
    (0x02, 0x06, 0x0A, 0x12, 0x1F, 0x02, 0x02), (0x1F, 0x10, 0x1E, 0x01, 0x01, 0x11, 0x0E),
    (0x06, 0x08, 0x10, 0x1E, 0x11, 0x11, 0x0E), (0x1F, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08),
    (0x0E, 0x11, 0x11, 0x0E, 0x11, 0x11, 0x0E), (0x0E, 0x11, 0x11, 0x0F, 0x01, 0x02, 0x0C)]


def pset(buf, x, y):
    if 0 <= x < W and 0 <= y < H:
        buf[x + (y >> 3) * W] |= 1 << (y & 7)


def text3(buf, s, x, y):
    for ch in s:
        g = F3.get(ch)
        if g:
            for r in range(5):
                for c in range(3):
                    if (int(g[r]) >> (2 - c)) & 1:
                        pset(buf, x + c, y + r)
        x += 4


def text5(buf, s, x, y):
    for ch in s:
        g = F5[int(ch)]
        for r in range(7):
            for c in range(5):
                if (g[r] >> (4 - c)) & 1:
                    pset(buf, x + c, y + r)
        x += 6


def dashed_ring(buf, cx, cy, r):
    """Midpoint circle, every other pixel on."""
    x, y, e = r, 0, 1 - r
    while x >= y:
        for a, b in ((x, y), (y, x), (-y, x), (-x, y), (-x, -y), (-y, -x), (y, -x), (x, -y)):
            if (a + b) & 1 == 0:
                pset(buf, cx + a, cy + b)
        y += 1
        if e < 0:
            e += 2 * y + 1
        else:
            x -= 1
            e += 2 * (y - x) + 1


# ---------- patterns, spike character, lookup tables ----------
def pat(v, x, y):
    """Fill pattern per voice, tested in screen coordinates so it stays still while the ball spins."""
    if v == 0:
        return 1                              # drums: solid
    if v == 1:
        return 1 if (x + y) & 1 == 0 else 0   # bass: checkerboard
    if v == 2:
        return 1 if (x - y) & 3 == 0 else 0   # lead: diagonal stripes
    return 1 if x % 3 == 0 and y % 3 == 0 else 0  # pad: sparse dots


# per voice: spike count, half-width (fraction of a spike period), plateau, rest length, spin (turns/s), decay (s), peak boost
SP = [(10, 0.45, 1, 1.5, 0.10, 0.2), (7, 0.7, 1.8, 1.5, 0.08, 0.2), (9, 0.15, 1, 1.0, 0.20, 0.2), (12, 0.9, 1, 1.5, 0.03, 0.6)]
AMP = [6, 5, 4, 3]   # drums kick 6 (snare 3, hat 1), bass 5, lead 4, pad 3
DRUM_AMP = {'beat': 6, 'kick': 6, 'snare': 3, 'hat': 1}
NB = 64              # angle buckets
MAXR = 24            # biggest ball plus spikes, in pixels from the centre
TW = 2 * MAXR + 1
# per (dx, dy) offset: angle bucket (0 = +x, increasing clockwise on screen) and squared distance. No trig per pixel.
AIDX = [0] * (TW * TW)
D2 = [0] * (TW * TW)
for _dy in range(-MAXR, MAXR + 1):
    for _dx in range(-MAXR, MAXR + 1):
        _i = (_dy + MAXR) * TW + _dx + MAXR
        AIDX[_i] = int((math.atan2(_dy, _dx) / (2 * math.pi) % 1) * NB) % NB
        D2[_i] = _dx * _dx + _dy * _dy
QUAD = [(1, 2, 3, 0)[a * 4 // NB] for a in range(NB)]  # owner voice per bucket: BR bass, BL lead, TL pad, TR drums
B2 = ((0, 2), (3, 1))


def smooth(x):
    return x * x * (3 - 2 * x)


class Model:
    """Per-finger state from the raw stream, plus the spike envelopes and the merge animation."""

    def __init__(self):
        self.step = [create_channel() for _ in range(4)]
        self.present = [False] * 4
        self.finger = [False] * 4
        self.bpm = [0.0] * 4
        self.last = [(-9.0, 0.0)] * 4   # per voice: (time, amplitude) of the latest spike trigger
        self.cnt = [0] * 4              # notes so far: each one nudges the spike phase
        self.merge = 0.0
        self.t = 0.0
        self.last_note = -9.0
        self.kicked = False
        self.host = (0, 0, 0, 0, 0)     # the browser's BPM per sensor, then its average heart BPM; 0 = show none
        self.host_t = -9.0

    def handle(self, msg, t):
        """One queue message: a raw tuple of four ints, or ('n', voice, drum, velocity)."""
        if msg[0] == 'h':
            self.t = t
            self.host, self.host_t = tuple(msg[1:6]), t
        elif msg[0] == 'n':
            self.t = t
            _, voice, drum, vel = msg
            if 0 <= voice < 4:
                kind = 'kick' if drum == 'kick' else 'snare' if drum in ('snare', 'clap', 'tom') else 'hat'
                self.last_note = t
                self.fire(voice, kind, vel)
        else:
            self.feed(msg, t)

    def shown(self, i):
        """The BPM to print for sensor i (4: the average for the merged ball); 0 = none. The browser's
        number while it is connected, so the panel matches the dashboard, else our own estimate."""
        if self.t - self.host_t < HOST_HOLD:
            return self.host[i]
        if i < 4:
            return self.bpm[i] if self.finger[i] else 0
        known = [self.bpm[k] for k in range(4) if self.finger[k] and self.bpm[k] > 0]
        return sum(known) / len(known) if known else 0

    def feed(self, raws, t):
        self.t = t
        for i, raw in enumerate(raws):
            self.present[i] = raw != 0
            f, beat, bpm = self.step[i](raw)
            self.finger[i], self.bpm[i] = f, bpm
            if beat and self.t - self.last_note > NOTE_HOLD:  # heartbeat spikes are the fallback when no music plays
                self.fire(i)  # the one place that triggers spikes; browser note events can call fire() too

    def fire(self, voice, kind='beat', vel=1.0):
        """Shoot a voice's spikes out. kind: 'beat' (heartbeat), or for drums 'kick' / 'snare' / 'hat'.
        vel 0..1 scales the size to 50-100%."""
        amp = DRUM_AMP[kind] if voice == 0 else AMP[voice]
        self.last[voice] = (self.t, amp * (0.5 + 0.5 * max(0.0, min(1.0, vel))))
        if voice == 0:
            self.kicked = amp == 6
        self.cnt[voice] += 1

    def tick(self, dt):
        on = [i for i in range(4) if self.present[i] and self.finger[i]]
        merged = len(on) >= MIN_MERGE and all(self.finger[i] for i in range(4) if self.present[i])
        d = dt / 1.2
        self.merge += max(-d, min(d, (1.0 if merged else 0.0) - self.merge))

    def env(self, v):
        t0, amp = self.last[v]
        a = max(0.0, 1 - (self.t - t0) / SP[v][5])
        return amp * a * a

    def env_n(self, v):
        return min(1.0, self.env(v) / AMP[v])


def radii(m, voice, R, merged):
    """Squared ball radius per angle bucket: the body plus its spikes, summed here once, not per pixel."""
    out = []
    kick = 2 * m.env(0) / max(m.last[0][1], 0.1) if merged and m.kicked else 0.0  # a kick bursts every spike
    for a in range(NB):
        v = QUAD[a] if merged else voice
        n, w, pl, rest, spin, _ = SP[v]
        u = ((a + 0.5) / NB * n + m.t * spin * n + m.cnt[v] * 0.07) % 1
        p = max(0.0, 1 - abs(u - 0.5) * 2 / w)
        p = min(1.0, p * pl) if pl > 1 else (p * p * (3 - 2 * p) if v == 3 else p)
        length = rest + m.env(v) + (1.0 if m.t - m.last[v][0] < 0.1 else 0.0) + kick  # just fired: tips 1 px longer
        out.append((R + length * p) ** 2)
    return out


def ball(cx, cy, R, rad2, fill):
    """Pixels of one ball as {y*128+x: 0/1}. Solid 1 px outline and solid spikes, fill(x,y,dx,dy) inside."""
    ext = min(MAXR, int(math.sqrt(max(rad2))) + 1)
    n, s2 = 2 * ext + 1, 2 * ext + 3
    lit = bytearray(s2 * s2)
    cells = []
    for j in range(n):
        y = cy - ext + j
        if not 0 <= y < H:
            continue
        row = (j - ext + MAXR) * TW + MAXR - ext
        for i in range(n):
            x = cx - ext + i
            if 0 <= x < W and D2[row + i] <= rad2[AIDX[row + i]]:
                lit[(j + 1) * s2 + i + 1] = 1
                cells.append((j, i, x, y))
    out = {}
    body = (R + 0.5) ** 2
    for j, i, x, y in cells:
        k = (j + 1) * s2 + i + 1
        t = (j - ext + MAXR) * TW + i - ext + MAXR
        solid = not (lit[k - 1] and lit[k + 1] and lit[k - s2] and lit[k + s2]) or D2[t] > body
        out[y * W + x] = 1 if solid else fill(x, y, i - ext, j - ext)
    return out


def dye_fill(m, R):
    """Four seeds orbit at R/2; each pixel takes the pattern of the nearest (weighted) seed, dithered at the borders."""
    seeds = []
    for i in range(4):
        a = i * math.pi / 2 + m.t * 0.3
        seeds.append((math.cos(a) * R * 0.5, math.sin(a) * R * 0.5, 1 / (1 + m.env_n(i) * 1.2)))

    def fill(x, y, dx, dy):
        ds = sorted((math.hypot(dx - sx, dy - sy) * w, i) for i, (sx, sy, w) in enumerate(seeds))
        gap = ds[1][0] - ds[0][0]
        v = ds[1][1] if gap < 2 and (B2[y & 1][x & 1] + 0.5) / 4 < 0.5 - gap / 4 else ds[0][1]
        return pat(v, x, y)
    return fill


def render(m, buf):
    """Draw the whole frame into buf (1024 bytes, zeroed here)."""
    buf[:] = bytes(len(buf))
    e = smooth(m.merge)
    px = {}
    if m.merge >= 1:
        px = ball(64, 30, 13, radii(m, 0, 13, True), dye_fill(m, 13))
        avg = m.shown(4)
        if avg > 0:
            text5(buf, str(round(avg)), 90, 26)
        else:
            text3(buf, '--', 90, 29)
        text3(buf, 'BPM', 90, 36)
    else:
        maps = []
        for i in range(4):
            x, y = round(16 + 32 * i + (48 - 32 * i) * e), round(24 + 6 * e)
            if m.present[i] and m.finger[i]:
                R = round(6 + 6 * e)
                maps.append(ball(x, y, R, radii(m, i, R, False), lambda px_, py_, dx, dy, i=i: pat(i, px_, py_)))
            elif m.present[i]:
                dashed_ring(buf, x, y, 4)
            if e < 0.5:
                text3(buf, NAMES[i], x - 3, 2)
                b = str(round(m.shown(i))) if m.present[i] and m.finger[i] and m.shown(i) > 0 else '--'
                text3(buf, b, x - (len(b) * 4 - 1) // 2, 44)
        acc = {}
        for mp in maps:
            for k, v in mp.items():
                acc.setdefault(k, []).append(v)
        for k, vs in acc.items():  # overlap while sliding: dither between the balls' patterns
            px[k] = vs[0] if len(vs) == 1 else vs[int((B2[(k >> 7) & 1][k & 1] + 0.5) / 4 * len(vs))]
    for k, v in px.items():
        if v:
            y, x = k >> 7, k & 127
            buf[x + (y >> 3) * W] |= 1 << (y & 7)


# ---------- the panel ----------
class Panel:
    def __init__(self):
        self.bus = None
        self.last = None
        self.next_try = 0.0
        self.down = False

    def _open(self):
        from smbus2 import SMBus
        col = 2 if CHIP == 'sh1106' else 0
        pump = [0x8D, 0x14] if CHIP == 'ssd1306' else [0xAD, 0x8B]  # charge pump / DC-DC on
        self.col = col
        self.bus = SMBus(BUS)
        self._cmd(0xAE, 0xD5, 0x80, 0xA8, 0x3F, 0xD3, 0x00, 0x40, *pump, 0x20, 0x02,
                  0xA1, 0xC8, 0xDA, 0x12, 0x81, 0xCF, 0xD9, 0xF1, 0xDB, 0x40, 0xA4, 0xA6)
        self._cmd(0xAF)
        self.last = None  # force a full redraw after (re)init

    def _cmd(self, *c):
        self.bus.write_i2c_block_data(ADDR, 0x00, list(c))

    def show(self, buf, now):
        """Send only the pages that changed. Any OSError: log once, retry the init every RETRY seconds."""
        if self.bus is None and now < self.next_try:
            return
        try:
            if self.bus is None:
                self._open()
                log('panel ready')
                self.down = False
            from smbus2 import i2c_msg
            for p in range(8):
                page = bytes(buf[p * W:(p + 1) * W])
                if self.last is None or page != self.last[p]:
                    self._cmd(0xB0 + p, self.col & 0x0F, 0x10 | self.col >> 4)
                    self.bus.i2c_rdwr(i2c_msg.write(ADDR, [0x40] + list(page)))
            self.last = [bytes(buf[p * W:(p + 1) * W]) for p in range(8)]
        except (OSError, ImportError) as err:
            if not self.down:
                log(f'panel unavailable ({err}); retrying every {RETRY:.0f} s')
            self.down = True
            if self.bus:
                try:
                    self.bus.close()
                except OSError:
                    pass
            self.bus = None
            self.next_try = now + RETRY


def run(q):
    """Entry point. Drains q every frame (even with no panel, so it never backs up), updates, draws, sends."""
    for sig in (signal.SIGHUP, signal.SIGUSR1):  # flatline's tuning signals (pkill -f) also reach this process
        signal.signal(sig, signal.SIG_IGN)
    m = Model()
    panel = Panel()
    buf = bytearray(W * H // 8)
    prev = time.monotonic()
    try:
        _loop(q, m, panel, buf, prev)
    except KeyboardInterrupt:
        pass


def _loop(q, m, panel, buf, prev):
    while True:
        now = time.monotonic()
        while True:
            try:
                raws = q.get_nowait()
            except queue.Empty:
                break
            except (OSError, EOFError):
                return
            m.handle(raws, now)
        m.t = now
        m.tick(now - prev)
        prev = now
        if not panel.down or now >= panel.next_try:
            render(m, buf)
            panel.show(buf, now)
        time.sleep(max(0.0, 1 / FPS - (time.monotonic() - now)))


# ---------- simulated fingers for --demo and --selftest ----------
def ppg(p):
    s = lambda x: x * x * (3 - 2 * x)
    if p < 0.12:
        return s(p / 0.12)
    if p < 0.35:
        return 1 - 0.55 * s((p - 0.12) / 0.23)
    if p < 0.47:
        return 0.45 - 0.08 * math.sin(math.pi * (p - 0.35) / 0.12)
    return 0.45 * math.exp(-(p - 0.47) * 5)


SCRIPT = [(0b0001, 3), (0b0011, 3), (0b0111, 3), (0b1111, 5), (0b1101, 4)]  # finger mask, seconds


class Sim:
    """Four fake PPG fingers at about 72, 66, 84 and 78 BPM, cycling through SCRIPT, as 50 Hz raw tuples."""

    def __init__(self):
        self.bpm = [72, 66, 84, 78]
        self.phase = [random.random() for _ in range(4)]
        self.t = 0.0
        self.step = -1  # 16th-note clock at 90 BPM, for simulated notes

    def notes(self, mask):
        s = self.step % 16
        out = []
        if mask & 1:
            if s in (0, 8):
                out.append(('n', 0, 'kick', random.uniform(0.4, 1)))
            elif s in (4, 12):
                out.append(('n', 0, 'snare', random.uniform(0.4, 1)))
            elif s & 1:
                out.append(('n', 0, 'hat', random.uniform(0.4, 1)))
        if mask & 2 and s in (0, 3, 6, 10, 14):
            out.append(('n', 1, '', random.uniform(0.4, 1)))
        if mask & 4 and random.random() < 0.35:
            out.append(('n', 2, '', random.uniform(0.4, 1)))
        if mask & 8 and s in (0, 8):
            out.append(('n', 3, '', random.uniform(0.4, 1)))
        return out

    def advance(self, to):
        """Raw tuples at 50 Hz, with note messages interleaved."""
        out = []
        while self.t + 0.02 <= to:
            self.t += 0.02
            cycle = sum(d for _, d in SCRIPT)
            u, mask = self.t % cycle, 0
            for mk, d in SCRIPT:
                mask = mk
                if u < d:
                    break
                u -= d
            if int(self.t / (60 / 90 / 4)) != self.step:
                self.step = int(self.t / (60 / 90 / 4))
                out += self.notes(mask)
            row = []
            for i in range(4):
                self.phase[i] = (self.phase[i] + 0.02 * self.bpm[i] / 60) % 1
                if (mask >> i) & 1:
                    row.append(int(60000 - 2500 * ppg(self.phase[i]) + random.uniform(-30, 30)))
                else:
                    row.append(int(3000 + random.uniform(-100, 100)))
            out.append(tuple(row))
        return out


class SimQueue:
    def __init__(self):
        self.sim, self.t0, self.buf = Sim(), time.monotonic(), []

    def get_nowait(self):
        if not self.buf:
            self.buf = self.sim.advance(time.monotonic() - self.t0)[::-1]
        if not self.buf:
            raise queue.Empty
        return self.buf.pop()


def ascii_frame(buf):
    """Each character is a 2x2 block of pixels: ' ' none, '.' 1, ':' 2-3, '#' 4."""
    rows = []
    for y in range(0, H, 2):
        line = ''
        for x in range(0, W, 2):
            n = sum((buf[(x + dx) + ((y + dy) >> 3) * W] >> ((y + dy) & 7)) & 1 for dx in (0, 1) for dy in (0, 1))
            line += ' .::#'[n] if n < 4 else '#'
        rows.append(line.rstrip())
    return '\n'.join(rows)


def selftest():
    random.seed(1)
    m, sim, buf = Model(), Sim(), bytearray(W * H // 8)
    frames, spent, changed, prev, notes, peak = 220, 0.0, 0, None, 0, 0.0
    unmerged = merged = None
    for f in range(frames):
        t = f / FPS
        for msg in sim.advance(t):
            m.handle(msg, t)
            if msg[0] == 'n':
                notes += 1
        peak = max(peak, max(m.env(v) for v in range(4)))
        m.t = t
        m.tick(1 / FPS)
        t0 = time.perf_counter()
        render(m, buf)
        spent += time.perf_counter() - t0
        if prev is not None and bytes(buf) != prev:
            changed += 1
        prev = bytes(buf)
        if f == 100:
            unmerged = ascii_frame(buf)
        if m.merge >= 1:
            merged = ascii_frame(buf)
    assert merged is not None, 'the balls never merged'
    assert changed > frames // 2, f'only {changed} of {frames} frames changed'
    assert notes > 20 and peak > 3, f'note path: {notes} notes, peak envelope {peak:.1f}'
    n = Model()  # a note fires its voice at a size scaled by velocity, and silences heartbeat spikes for NOTE_HOLD
    n.handle(('n', 1, '', 1.0), 5.0)
    assert abs(n.env(1) - 5) < 1e-9 and n.env(0) == 0
    n.handle(('n', 0, 'kick', 0.0), 5.0)
    assert abs(n.env(0) - 3) < 1e-9 and n.kicked
    h = Model()  # the browser's BPM line takes over the numbers, and hands back when it stops coming
    h.bpm, h.finger = [50.0, 60.0, 0.0, 0.0], [True, True, False, False]
    assert h.shown(0) == 50 and h.shown(2) == 0 and h.shown(4) == 55
    h.handle(('h', 72, 0, 0, 80, 76), 1.0)
    assert [h.shown(i) for i in range(5)] == [72, 0, 0, 80, 76]
    h.feed((0, 0, 0, 0), 1.0 + HOST_HOLD + 0.1)
    assert h.shown(0) == 0 and h.shown(4) == 0  # fingers off, no browser
    assert unmerged and any(b for b in prev), 'blank frame'
    print(f"{frames} frames, {changed} changed, {notes} notes, peak env {peak:.1f}, merge reached, {spent / frames * 1000:.2f} ms/frame")
    print('--- unmerged (frame 100) ---\n' + unmerged + '\n--- merged ---\n' + merged)


if __name__ == '__main__':
    if '--selftest' in sys.argv:
        selftest()
    elif '--demo' in sys.argv:
        try:
            run(SimQueue())
        except KeyboardInterrupt:
            pass
    else:
        print(__doc__)
