#!/usr/bin/env python3
"""flatline sensor reader for a Raspberry Pi Zero 2 W.

Reads 4x MAX30102 (all fixed at 0x57), one per I2C bus, and streams raw IR as
CSV: `ir0,ir1,ir2,ir3` at 50 Hz. A missing sensor reads 0. This is the same
format the old Arduino sketch sent, so the web app doesn't change.
The web app sends back `h,b0,b1,b2,b3,avg` lines (the BPM it is showing), which the OLED prints.
A push button between GPIO26 (pin 37) and any GND sends a line `b` on each press:
the web app steps to the next genre.

Usage: flatline.py [OUT]   OUT defaults to /dev/ttyGS0 (USB gadget serial);
                             pass - to print to stdout for testing over ssh.

Tuning without a restart (as the service's user, no sudo):
  echo led=0x3F > ~/flatline.conf && pkill -HUP -f flatline.py    # change LED power, kept across restarts
  pkill -USR1 -f flatline.py    # write the last 30 s of red and IR, per sensor, to /tmp/flatline-dump.csv
"""
import collections
import multiprocessing
import os
import queue
import signal
import sys
import termios
import threading
import time
import tty

from smbus2 import SMBus, i2c_msg

BUSES = [1, 3, 4, 5]  # sensor 0..3 -> /dev/i2c-N (see README wiring)
ADDR = 0x57
PERIOD = 0.02         # 50 Hz output
POLL = 0.01           # FIFO poll period: twice the sample rate, so a new sample is never left waiting long
RETRY = 2.0           # seconds between attempts to (re)open a missing sensor
BUTTON = 26           # GPIO of the genre button (pin 37); it shorts the pin to GND, internal pull-up
DEBOUNCE = 2          # output periods a level must hold to count: 40 ms

# MAX30102 registers
FIFO_WR_PTR, OVF_COUNTER, FIFO_RD_PTR, FIFO_DATA = 0x04, 0x05, 0x06, 0x07
FIFO_CONFIG, MODE_CONFIG, SPO2_CONFIG = 0x08, 0x09, 0x0A
LED1_PA, LED2_PA, PART_ID = 0x0C, 0x0D, 0xFF

# Same settings as the old sketch's setup(0x1F, 4, 2, 200, 411, 4096).
# ponytail: LED power is the calibration knob; raise it if signal is weak, lower it if raw IR saturates near 262143
LED_POWER = 0x1F
CONF = os.path.expanduser('~/flatline.conf')  # optional: a line `led=0x3F` overrides LED_POWER
DUMP = '/tmp/flatline-dump.csv'
HIST = 1500           # samples of (red, IR) kept per sensor for the dump: 30 s
LED_MAX = 0x7F        # cap for the override: 25 mA, half of what the chip allows (0xFF = 51 mA)
led = LED_POWER       # current LED power; sensor threads apply a change on their next poll
FIFO_CFG = 0b010 << 5 | 1 << 4  # average 4 samples, FIFO rollover on
SPO2_CFG = 0b01 << 5 | 0b010 << 2 | 0b11  # 4096 nA range, 200 sps (SR bits 010; 001 is 100 sps), 411 us pulse
MODE_SPO2 = 0x03  # red + IR


class Sensor:
    def __init__(self, bus_num):
        self.bus_num = bus_num
        self.bus = None
        self.ir = 0
        self.q = collections.deque()  # samples read but not yet sent (append/popleft are thread-safe)
        self.hist = collections.deque(maxlen=HIST)  # recent (red, IR), for the dump
        self.led = None               # LED power last written to this sensor
        self.up = False
        self.next_try = 0.0

    def open(self):
        try:
            self.bus = SMBus(self.bus_num)
            b = self.bus
            if b.read_byte_data(ADDR, PART_ID) != 0x15:
                raise OSError('not a MAX30102')
            b.write_byte_data(ADDR, MODE_CONFIG, 0x40)  # reset
            deadline = time.monotonic() + 0.1
            while b.read_byte_data(ADDR, MODE_CONFIG) & 0x40:
                if time.monotonic() > deadline:
                    raise OSError('reset timed out')
                time.sleep(0.001)
            b.write_byte_data(ADDR, FIFO_CONFIG, FIFO_CFG)
            b.write_byte_data(ADDR, MODE_CONFIG, MODE_SPO2)
            b.write_byte_data(ADDR, SPO2_CONFIG, SPO2_CFG)
            self.set_led()
            for reg in (FIFO_WR_PTR, OVF_COUNTER, FIFO_RD_PTR):
                b.write_byte_data(ADDR, reg, 0)
            self.up = True
            log(f'sensor on i2c-{self.bus_num} ready')
        except OSError as e:
            self.drop(e)

    def set_led(self):
        self.bus.write_byte_data(ADDR, LED1_PA, led)  # LED1 = red
        self.bus.write_byte_data(ADDR, LED2_PA, led)  # LED2 = IR
        self.led = led

    def drop(self, err):
        if self.up:  # only log transitions, not every retry of an absent sensor
            log(f'sensor on i2c-{self.bus_num} lost: {err}')
        if self.bus:
            self.bus.close()
        self.bus = None
        self.up = False
        self.q.clear()
        self.ir = 0
        self.next_try = time.monotonic() + RETRY

    def poll(self):
        """Drain the FIFO into the queue, one IR value per sample."""
        if not self.bus:
            if time.monotonic() >= self.next_try:
                self.open()
            return
        try:
            b = self.bus
            if self.led != led:
                self.set_led()
            # WR_PTR, OVF_COUNTER, RD_PTR are consecutive registers: one transaction, not two
            wr, _, rd = b.read_i2c_block_data(ADDR, FIFO_WR_PTR, 3)
            n = (wr - rd) & 0x1F
            if not n:
                return
            msg = i2c_msg.read(ADDR, n * 6)  # each sample: red (3 bytes), IR (3 bytes)
            b.i2c_rdwr(i2c_msg.write(ADDR, [FIFO_DATA]), msg)
            d = bytes(msg)
            for i in range(0, len(d), 6):
                red = (d[i] << 16 | d[i + 1] << 8 | d[i + 2]) & 0x3FFFF
                ir = (d[i + 3] << 16 | d[i + 4] << 8 | d[i + 5]) & 0x3FFFF
                self.q.append(ir)
                self.hist.append((red, ir))
        except OSError as e:  # unplugged or bus glitch: retry later
            self.drop(e)

    def take(self):
        """Next sample for the output line. The queue absorbs timing jitter between the sensor's
        clock and ours: a sample that lands just after a line went out waits for the next line
        instead of being skipped. Empty queue repeats the last value; a backlog drops one sample."""
        q = self.q
        if q:
            self.ir = q.popleft()
            if len(q) > 2:  # sensor clock runs ahead of ours: skip one to bound the delay
                q.popleft()
        return self.ir

    def run(self):
        # One thread per sensor, so a slow or dead bus can't stall the 50 Hz output.
        # Polls land on a fixed schedule (not "sleep after each read", which drifts slower than the sensor).
        nxt = time.monotonic()
        while True:
            self.poll()
            if not self.bus:
                time.sleep(max(0.0, self.next_try - time.monotonic()))
                nxt = time.monotonic()
                continue
            nxt += POLL
            delay = nxt - time.monotonic()
            if delay > 0:
                time.sleep(delay)
            else:
                nxt = time.monotonic()  # fell behind; don't burst to catch up


def log(s):
    print(s, file=sys.stderr, flush=True)


def load_conf(*_):
    """Read LED power from CONF, if it exists. Also the SIGHUP handler."""
    global led
    try:
        for line in open(CONF):
            k, _, v = line.partition('=')
            if k.strip() == 'led':
                led = max(0, min(LED_MAX, int(v.strip(), 0)))
                log(f'LED power {led:#04x}')
    except (OSError, ValueError):
        pass


def dump(sensors):
    """Write each sensor's recent (red, IR) samples, newest last. Columns: red1,ir1,...,red4,ir4."""
    hist = [list(s.hist) for s in sensors]
    n = max(len(h) for h in hist)
    with open(DUMP + '.tmp', 'w') as f:
        f.write(f'# led={led:#04x}\n')
        for i in range(n):
            f.write(','.join('%d,%d' % h[i - n + len(h)] if i - n + len(h) >= 0 else ',' for h in hist) + '\n')
    os.replace(DUMP + '.tmp', DUMP)


class Out:
    """Line sink. Drops lines while nothing is listening instead of blocking."""

    def __init__(self, path):
        self.path = path
        self.fd = None
        self.rbuf = b''

    def write(self, line):
        if self.path == '-':
            sys.stdout.write(line)
            sys.stdout.flush()
            return
        try:
            if self.fd is None:
                self.fd = os.open(self.path, os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK)
                tty.setraw(self.fd)  # no echo, no \n -> \r\n
                log(f'writing to {self.path}')
            os.write(self.fd, line.encode())
        except BlockingIOError:
            pass  # host isn't reading; drop this frame
        except (OSError, termios.error):
            self.reset()  # gadget not up yet or unplugged; reopen next frame

    def reset(self):
        if self.fd is not None:
            os.close(self.fd)
        self.fd = None

    def read_lines(self):
        """Complete lines the host wrote to the port (note events), without blocking."""
        if self.fd is None:
            return []
        try:
            data = os.read(self.fd, 4096)
        except BlockingIOError:
            return []
        except OSError:
            self.reset()
            return []
        self.rbuf += data
        *lines, self.rbuf = self.rbuf.split(b'\n')
        self.rbuf = self.rbuf[-256:]  # a partial line never grows without bound
        return [l.decode(errors='replace') for l in lines]


class Button:
    """The genre button, sampled once per output line. pressed() is True once per press."""

    def __init__(self, gpio):
        self.h = None
        self.down = False   # debounced state
        self.run = 0        # samples in a row that disagree with it
        try:
            os.environ.setdefault('LG_WD', '/tmp')  # lgpio writes a pipe file in its working dir; the service's (/) is read-only to us
            import lgpio
            self.io, self.gpio = lgpio, gpio
            self.h = lgpio.gpiochip_open(0)
            lgpio.gpio_claim_input(self.h, gpio, lgpio.SET_PULL_UP)
            log(f'button on GPIO{gpio}')
        except Exception as e:  # no lgpio, or the pin is taken: run without a button
            self.h = None
            log(f'no button: {e}')

    def pressed(self):
        if self.h is None:
            return False
        try:
            low = self.io.gpio_read(self.h, self.gpio) == 0
        except Exception:
            return False
        self.run = self.run + 1 if low != self.down else 0
        if self.run < DEBOUNCE:
            return False
        self.down, self.run = low, 0
        return low


def main():
    out = Out(sys.argv[1] if len(sys.argv) > 1 else '/dev/ttyGS0')
    load_conf()
    sensors = [Sensor(n) for n in BUSES]
    signal.signal(signal.SIGHUP, load_conf)
    signal.signal(signal.SIGUSR1, lambda *_: dump(sensors))
    q = None
    try:  # the display runs in its own process, started before the threads so fork copies a quiet process
        import oled
        q = multiprocessing.Queue(maxsize=100)
        multiprocessing.Process(target=oled.run, args=(q,), daemon=True).start()
    except Exception as e:
        log(f'no display: {e}')
        q = None
    for s in sensors:
        threading.Thread(target=s.run, daemon=True).start()
    button = Button(BUTTON)
    nxt = time.monotonic()
    while True:
        vals = tuple(s.take() for s in sensors)
        out.write(','.join(map(str, vals)) + '\n')
        if button.pressed():
            out.write('b\n')
        if q:
            try:
                q.put_nowait(vals)
                for line in out.read_lines():  # browser note lines: n,voice,drum,velocity
                    if line.startswith('n,'):
                        try:
                            _, v, drum, vel = line.split(',')
                            q.put_nowait(('n', int(v), drum, float(vel)))
                        except ValueError:
                            pass  # bad line: skip
                    elif line.startswith('h,'):  # the dashboard's BPM per sensor and average: h,b0,b1,b2,b3,avg
                        try:
                            nums = [int(x) for x in line.split(',')[1:]]
                            if len(nums) == 5:
                                q.put_nowait(('h', *nums))
                        except ValueError:
                            pass
            except queue.Full:
                pass
        nxt += PERIOD
        delay = nxt - time.monotonic()
        if delay > 0:
            time.sleep(delay)
        else:
            nxt = time.monotonic()  # fell behind; don't burst to catch up


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        pass
