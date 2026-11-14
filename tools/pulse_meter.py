#!/usr/bin/env python3
"""Live pulse-quality meter for the Pi's sensors. Run on the laptop: python3 tools/pulse_meter.py
Every 2 s it reads the last 8 s of red + IR from the Pi (ssh flatline) and prints, per sensor:
  level   IR level
  pulse   size of the 0.75-3 Hz wave, as % of the level (a good finger reading is 0.5% or more)
  rhythm  0..1, how evenly the wave repeats (0.6+ = a clear heartbeat) and the BPM it repeats at
  IR/red  a real pulse is bigger in IR than in red (1.3+); movement is the same in both (~1.0)
  shake   movement faster than 4 Hz, as % of the level
Needs numpy and the reader's dump (pi/trackprint.py, SIGUSR1). Ctrl+C stops it."""
import subprocess, sys, time
import numpy as np

FS, WIN = 50, 8 * 50
CMD = 'kill -USR1 $(systemctl show -p MainPID --value trackprint); sleep 0.3; tail -n %d /tmp/trackprint-dump.csv' % WIN

def band(x, lo, hi):  # zero-phase band-pass by FFT
    f = np.fft.rfftfreq(len(x), 1 / FS); X = np.fft.rfft(x - x.mean()); X[(f < lo) | (f > hi)] = 0
    return np.fft.irfft(X, len(x))

def rhythm(y):
    y = y - y.mean(); ac = np.correlate(y, y, 'full')[len(y) - 1:]; ac = ac / (ac[0] + 1e-12)
    lo, hi = int(FS * 60 / 150), int(FS * 60 / 45); k = lo + int(np.argmax(ac[lo:hi]))
    return ac[k], 60 * FS / k

def measure(red, ir):
    if len(ir) < WIN or ir.mean() < 30000:
        return None
    t = np.arange(len(ir)); ir_n = ir / np.polyval(np.polyfit(t, ir, 2), t) - 1; red_n = red / np.polyval(np.polyfit(t, red, 2), t) - 1
    pi, pr = band(ir_n, 0.75, 3)[25:-25], band(red_n, 0.75, 3)[25:-25]
    size = 100 * (np.percentile(pi, 95) - np.percentile(pi, 5)); q, bpm = rhythm(pi)
    return dict(level=ir.mean(), size=size, q=q, bpm=bpm, ratio=pi.std() / (pr.std() + 1e-12), shake=100 * band(ir_n, 4, 25)[25:-25].std())

def verdict(m):
    if m['shake'] > 0.08: return 'MOVING: hold still'
    if m['q'] >= 0.6 and m['size'] >= 0.3: return f"GOOD pulse, {m['bpm']:.0f} BPM"
    if m['q'] >= 0.6: return f"clear but small, {m['bpm']:.0f} BPM"
    if m['size'] < 0.15: return 'pulse too small: ease off or reposition'
    return 'no clear rhythm'

while True:
    out = subprocess.run(['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', 'flatline', CMD], capture_output=True, text=True).stdout
    rows = [l.split(',') for l in out.splitlines() if l and not l.startswith('#')]
    print(time.strftime('%H:%M:%S'))
    for s in range(4):
        v = np.array([[float(r[s * 2]), float(r[s * 2 + 1])] for r in rows if len(r) > s * 2 + 1 and r[s * 2] and r[s * 2 + 1]])
        m = measure(v[:, 0], v[:, 1]) if len(v) else None
        print(f'  sensor {s + 1}: ' + ('no finger' if m is None else
              f"level {m['level']:6.0f}  pulse {m['size']:.2f}%  rhythm {m['q']:.2f}  IR/red {m['ratio']:.1f}  shake {m['shake']:.3f}%   -> {verdict(m)}"))
    sys.stdout.flush()
    time.sleep(1.5)
