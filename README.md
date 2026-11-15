# flatline

**Four fingers, four heartbeats, one track generated in the moment.**

Put a finger on each of four pulse sensors and your heartbeats become a live four-piece electronic band in the browser: drums, bass, lead and pad. Each voice follows its own pulse, and when the hearts sync up, so does the music.

| Sensor | Voice |
|---|---|
| ch0 | drums |
| ch1 | bass |
| ch2 | lead |
| ch3 | pad |

Docs and design history live in [`docs/`](docs/README.md).

## Try it in 30 seconds (no hardware)
```bash
cd web && python3 -m http.server 8000
```
Open http://localhost:8000 in Chrome or Edge and hit **Simulate**. A band of fake hearts starts playing.

With the real thing: [set up the Pi once](#pi-setup), plug its USB port into the laptop, run the same server and press **Connect sensors**. Plug the laptop's headphone jack into the speakers and you're playing.

## How it fits together
```
4x MAX30102 ──(4 I2C buses)──► Raspberry Pi Zero 2 W ──(USB serial)──► laptop browser ──(aux)──► speakers
```
All the sound is made in the browser. The Pi only reads sensors and sends numbers.

Every MAX30102 has the same fixed I2C address (0x57), so two can't share a bus, and we skip the multiplexer. Each sensor gets its own bus instead: one hardware bus plus three software (`i2c-gpio`) buses.

The Pi runs in USB gadget mode, so the laptop sees it as a serial port. It sends `ir0,ir1,ir2,ir3` lines at 50 Hz. The Pi Zero 2 W has one data port, so USB audio devices can't share it with the laptop link. (We tried running the synth on the Pi. It can't keep up in real time, so the laptop does it.)

## Parts
- Raspberry Pi Zero 2 W with a microSD card running Raspberry Pi OS Lite
- 4x MAX30102 breakout
- A micro-USB **data** cable (not a charge-only cable)
- Speakers with an aux input

## Wiring
Pin numbers are physical header pins. Every sensor's VIN goes to 3.3V and every GND goes to GND. Use pins 1/17 for 3.3V and any of 6, 9, 14, 20, 25, 30, 34, 39 for GND.

| Sensor | Pi bus | SDA | SCL |
|---|---|---|---|
| 0 | `/dev/i2c-1` (hardware) | pin 3 (GPIO2) | pin 5 (GPIO3) |
| 1 | `/dev/i2c-3` (i2c-gpio) | pin 11 (GPIO17) | pin 13 (GPIO27) |
| 2 | `/dev/i2c-4` (i2c-gpio) | pin 15 (GPIO22) | pin 16 (GPIO23) |
| 3 | `/dev/i2c-5` (i2c-gpio) | pin 18 (GPIO24) | pin 22 (GPIO25) |

Only 3.3V belongs on these pins. Never put 5V on a Pi GPIO pin. The breakouts' own SDA/SCL resistors are the real pull-ups. The Pi's weak internal ones (see setup) only keep an empty bus from hanging. Some cheap purple MAX30102 boards pull up to 1.8V, and those need the pull-up jumper or trace moved to 3.3V. If a sensor reads `0`, check its wiring and pull-up voltage.

## Pi setup
Flash Raspberry Pi OS Lite (Trixie) with Raspberry Pi Imager, set the hostname to `flatline`, the user to `flatline`, and enable SSH. Join it to your Wi-Fi for this first setup (it needs the network for `apt`). Then from this repo:
```bash
ssh flatline@flatline.local 'mkdir -p flatline'
scp pi/* flatline@flatline.local:flatline/
ssh flatline@flatline.local 'cd flatline && sudo ./setup.sh && sudo reboot'
```
`pi/setup.sh` is safe to re-run. It:
- installs `python3-smbus2` and `i2c-tools`
- appends the I2C buses, internal pull-ups and USB gadget mode to `/boot/firmware/config.txt`:
  ```ini
  dtparam=i2c_arm=on
  dtoverlay=i2c-gpio,bus=3,i2c_gpio_sda=17,i2c_gpio_scl=27
  dtoverlay=i2c-gpio,bus=4,i2c_gpio_sda=22,i2c_gpio_scl=23
  dtoverlay=i2c-gpio,bus=5,i2c_gpio_sda=24,i2c_gpio_scl=25
  dtoverlay=dwc2,dr_mode=peripheral
  gpio=17,22-25,27=pu
  ```
  The `gpio=...=pu` line matters: without pull-ups, an empty software bus hangs on timeouts instead of failing fast.
- adds `modules-load=dwc2,g_serial` to `/boot/firmware/cmdline.txt`
- installs the reader to `/opt/flatline/flatline.py` and enables `flatline.service`, which starts it at boot
- migrates a Pi that still has the old `trackprint` service and config

To update the reader later, copy `pi/` over again, re-run `setup.sh`, then `sudo systemctl restart flatline`.

For the laptop-side tools below, add an `ssh flatline` alias to `~/.ssh/config` (`Host flatline`, `HostName flatline.local`, `User flatline`) and use key login, because they run `ssh flatline` non-interactively. Once the Pi is plugged in over USB, ssh needs its Wi-Fi.

Connect the Pi's **USB** port (not PWR IN) to the laptop. That one cable powers the Pi and carries the data. The Pi takes about 30 s to boot, then shows up as a serial port (`/dev/cu.usbmodem*` on a Mac). Run `sudo poweroff` before unplugging, so the SD card doesn't get corrupted.

## Sensor reader
`pi/flatline.py` sets up each MAX30102 the same way the old Arduino sketch did: LED power 0x1F, 4-sample average, red+IR, 200 sps, which works out to 50 Hz out. LED power is `0x1F` by default (the `LED_POWER` knob in the file). It writes one `ir0,ir1,ir2,ir3` line every 20 ms to `/dev/ttyGS0`, with `0` for a missing sensor. Each sensor is read in its own thread, so an unplugged sensor drops to `0` and is picked up again within about 2 s of being plugged back in.

Checks, over ssh:
```bash
i2cdetect -y 1        # also -y 3, -y 4, -y 5; each should show 57
journalctl -u flatline -f                                     # "sensor on i2c-N ready" / "lost"
sudo systemctl stop flatline && python3 /opt/flatline/flatline.py -   # print lines to the terminal
sudo systemctl start flatline
```
A value above ~45000 means a finger is on (the app counts anything over 30000 as a finger).

**Tuning the signal, no restart** (over ssh, as `flatline`, no sudo):
```bash
echo led=0x3F > ~/flatline.conf && pkill -HUP -f flatline.py   # LED power 0x00-0x7F; raise it if the signal is weak, lower it if raw IR saturates near 262143. Kept across restarts.
pkill -USR1 -f flatline.py                                     # write the last 30 s of red + IR per sensor to /tmp/flatline-dump.csv
```

**Live pulse-quality meter** (on the laptop, needs `numpy`):
```bash
python3 tools/pulse_meter.py
```
Every 2 s it pulls the last 8 s of red + IR over ssh and prints, per sensor, the signal level, pulse size, rhythm, IR/red ratio and shake, with a verdict (`GOOD pulse, 72 BPM`, `MOVING: hold still`, ...). Use it to find the right LED power and finger pressure. Ctrl+C stops it.

## Playing
```bash
cd web && python3 -m http.server 8000
```
Open http://localhost:8000 in Chrome or Edge. Use **Simulate** (no hardware) or **Connect sensors**. The picker lists only the Pi's serial port; add `?port=any` to list every port, e.g. for the old Arduino.

Pick a kit and let the hearts do the rest:

- **French house**: disco four-on-the-floor with sidechain pump, plucked bass, talkbox vowel lead, and short phased saw stabs
- **UK garage**: shuffled two-step with a rim and metal hats, rubbery FM bass, chopped ah/oh vocal lead, and organ stabs
- **Ambient**: sparse percussion, long bass swells, sustained chords, and wide melodic space
- **Russian hardbass**: long distorted kick, offbeat fat-saw donk bass, supersaw riffs, and rave stabs
- **Drum and bass**: fast two-step break with a cracking snare, dark reese bass, echoing plucks, and held airy chords
- **Acid techno**: four-on-the-floor with a squelching resonant bass line, sparse saw bleeps, and offbeat rave stabs
- **Lo-fi**: half-time and mellow, so the beat you feel is the heart rate itself: dull kit, round bass, soft plucks, electric-piano chords
- **Boom bap**: old-school rap, half-time and swung: hard kick and cracking snare, sub bass, a chopped piano loop, and record scratches from the fourth sensor
- **Psytrance**: a rolling bass on the three 16ths after every kick, a squiggly echoing saw lead, distant chords
- **Trap**: half-time, long 808 kick and gliding 808 bass, hi-hat rolls, a dark bell melody
- **Dubstep**: half-time, huge snare on beat 3, a wobble bass whose filter swings in time with the beat
- **Hardstyle**: very distorted kick with a reverse bass swelling into every gap, euphoric supersaw lead
- **Reggaeton**: half-time dembow rhythm, sub bass, plucked melody, offbeat piano stabs (fits faster heart rates best: the felt beat is the heart rate, around 90-95)
- **Hard groove**: percussive, looping techno: four-on-the-floor under rolling toms, rims and shuffled hats, funky bass stabs, organ chords
- **Phonk**: drift phonk: a distorted 808 cowbell plays the riff over an 808 kick, clap on 2 and 4, a distorted gliding 808 bass, and Memphis-style vocal chops from the fourth sensor
- **Dream pop**: half-time and hazy: soft drums in a big room, shimmering echoed plucks, chorused major-seventh chords
- **Hyperpop**: fast and overloaded: distorted kick, hi-hat rolls, distorted 808, bright supersaw hooks, chipmunk vocal chops from the fourth sensor
- **Rock**: straight rock beat, picked eighth-note bass, distorted lead guitar, power-chord rhythm guitar (all synthesised, so a rock band as a synth would play it)
- **Drill**: half-time and dark: skippy hats and rolls, late snares, 808s that slide between octaves, piano and strings
- **R&B**: half-time and swung: soft kick and finger snaps, round bass, talkbox lead, electric-piano chords
- **Footwork** and **Jersey club**: fast, skittering or bouncy kick patterns with vocal chops from the fourth sensor. Their kicks are really triplets; the grid only has 16th notes, so these are close stand-ins

To add a kit, add a genre to `web/audio/patterns.js` and a kit of the same name to `web/audio/kits.js`; both files say how at the end of their tables.

**BPM and tempo.** A finger's BPM appears once it has stabilised, about 8 s after a still finger lands; until then its number is a shimmering placeholder and it does not steer the music. The song's tempo is twice the average heart rate of every stabilised finger. It moves in whole BPM, only once the average has shifted by 2 heart BPM, only at a bar line, and it holds for 8 s after the last finger lifts. The dashboard shows both as **song bpm** and **avg heart bpm** (rules and knobs: `web/audio/tempo.js`, `web/signal.js`).

Each active sensor evolves its voice from its recent signal history and the shared musical grid. Kit choice is the only creative control; everything else is operational. Pulse amplitude and beat-interval variation are bounded modulation sources, not calibrated finger-pressure or breathing-rate readings.

**Genre button.** A push button between GPIO26 (pin 37) and any GND on the Pi steps to the next kit, wrapping from the last to the first. The Pi sends a `b` line over the serial link on each press (debounced 40 ms); with no button wired nothing happens.

**Stand-in heartbeats.** Off by default, since all four sensors work. If a sensor is missing, open the page with `?standin=2,3` (sensor numbers) and click that voice's blob to start a stand-in heartbeat; click again to stop. It runs at about the average of the real fingers' stabilised BPM and does not count toward the song tempo.

Handy URL tricks:
- **Not all four sensors wired?** `?fill=sim` simulates the channels that read `0`. The real ones play from your fingers.
- **A sensor died?** `?sim=4` (or `?sim=3,4`) simulates it for one visit. List it in `BROKEN_SENSORS` in `web/serial.js` to make that the default. A simulated sensor plays a heartbeat whenever every working sensor has a finger on it, so the four can still merge.
- **Save log is gone.** The button and `web/ui/log.js` were removed, so `tools/analyze-log.mjs` has no in-app source for its CSVs. It still replays any log in the old format (older files are in `~/Downloads/flatline-log-*.csv`).
- **Sound breaking up?** `?perf` shows a small readout: how many notes were scheduled late, the longest stall of the page, and slow frames. Late notes or stalls mean the page is being held up; all zeros means the cause is outside it (CPU load from other programs, or the audio device).

## Test
```bash
for t in test audio-test fluid-test stage-test; do node web/$t.mjs || break; done
```

## Legacy: Arduino
<details>
<summary>The original Arduino + mux sketches and Linux troubleshooting</summary>

`firmware/flatline/` is the old Arduino + TCA9548A sketch, kept for reference. The Pi is the default sensor source now.

### Testing with one sensor
`firmware/flatline_single` is for testing with a single MAX30102 wired straight to the Uno, without the mux: SDA → A4, SCL → A5, VIN → 3.3V, GND → GND. It sends the same `ir0,ir1,ir2,ir3` lines as the full firmware. The real reading goes on `CHANNEL` (default 0, drums, so your finger sets the tempo) and the other channels send `0`.

```bash
arduino-cli core install arduino:avr
arduino-cli lib install "SparkFun MAX3010x Pulse and Proximity Sensor Library"
arduino-cli compile -b arduino:avr:uno firmware/flatline_single
arduino-cli upload  -b arduino:avr:uno -p /dev/ttyACM0 firmware/flatline_single
```

At boot it prints one `# MAX30102 found on A4/A5` (or `not found`) line, which the web app ignores. Then come 50 lines per second. With no finger the reading is around 1,000; with a finger it's above 50,000.

To play: open http://localhost:8000/?fill=sim&port=any, click **Connect sensors**, pick the Arduino. Your finger plays drums and the other three voices are simulated. Click any circle to move the sensor to that voice; its label shows `· sensor`.

### Troubleshooting (Linux)
These came up on an Arch Linux laptop with an Uno R3. The permission and browser notes apply to the Pi's serial port too, which shows up as `ttyACM*`.

**No `arduino-cli`, and no sudo needed to install it.** Download the release binary into your home folder:
```bash
mkdir -p ~/.local/bin
curl -fsSL https://github.com/arduino/arduino-cli/releases/download/v1.1.1/arduino-cli_1.1.1_Linux_64bit.tar.gz | tar xz -C ~/.local/bin arduino-cli
```

**`Permission denied` on `/dev/ttyACM0` (upload), or `Failed to open serial port` in the browser.** The port belongs to the `uucp` group (`dialout` on Debian/Ubuntu), and your user has to be in it:
```bash
sudo usermod -aG uucp <your-username>      # then log out and back in (a reboot also works)
```
Group changes only apply to programs started after a fresh login. To use the port right away:
```bash
sudo setfacl -m u:<your-username>:rw /dev/ttyACM0   # lasts until the Arduino is unplugged
newgrp uucp                                         # a shell with the new group, for arduino-cli
```
Type your username out instead of using `$USER`. On our machine `$USER` was empty, so `setfacl` failed with `Invalid argument near character 3`.

**The browser's port picker says "No serial ports available".** Usually the permission problem above. Also use Chrome, Chromium or Edge: Web Serial is what this project is built and tested on. On Arch: `sudo pacman -S chromium` or `yay -S google-chrome`.

**The picker lists lots of `ttyS0`, `ttyS1`, ... ports.** Those are built-in legacy serial ports with nothing attached. Pick **ttyACM0**. `ls -l /dev/serial/by-id/` shows which device is the Arduino.

**`Failed to open serial port` even with permissions.** Only one program can hold the port. Close `arduino-cli monitor`, the Arduino IDE serial monitor, or any other tab connected to it.

</details>
