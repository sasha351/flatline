# flatline

The project folder, repo, and Pi service are still named `trackprint`.

Project setup and usage are documented below. For design decisions and implementation history, see the [documentation index](docs/README.md).

Four heart-rate sensors → four-voice electronic band in the browser.
ch0 drums · ch1 bass · ch2 lead · ch3 pad.

**Quick start.** No hardware needed: `cd web && python3 -m http.server 8000`, open http://localhost:8000 in Chrome or Edge, press **Simulate**. With the Pi: [set it up once](#pi-setup), plug its USB port into the laptop, then do the same and press **Connect sensors**.

## How it fits together
```
4x MAX30102 ──(4 separate I2C buses)──► Raspberry Pi Zero 2 W ──(USB serial)──► laptop browser
```
Every MAX30102 has the same fixed I2C address (0x57), so two of them can't share a bus. We don't use a multiplexer. Instead, each sensor gets its own I2C bus on the Pi: one hardware bus plus three software (`i2c-gpio`) buses.

The Pi runs in USB gadget mode, so the laptop sees it as a serial port. It sends the same `ir0,ir1,ir2,ir3` lines at 50 Hz that the web app already reads, so nothing changes on the browser side.

## Parts
- Raspberry Pi Zero 2 W with a microSD card running Raspberry Pi OS Lite
- 4x MAX30102 breakout
- A micro-USB **data** cable (not a charge-only cable)

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
ssh flatline@flatline.local 'mkdir -p trackprint'
scp pi/* flatline@flatline.local:trackprint/
ssh flatline@flatline.local 'cd trackprint && sudo ./setup.sh && sudo reboot'
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
- installs the reader to `/opt/trackprint/trackprint.py` and enables `trackprint.service`, which starts it at boot

To update the reader later, copy `pi/` over again and re-run `setup.sh`, then run `sudo systemctl restart trackprint`.

For the laptop-side tools below, add an `ssh flatline` alias to `~/.ssh/config` (`Host flatline`, `HostName flatline.local`, `User flatline`) and use key login, because they run `ssh flatline` non-interactively. Once the Pi is plugged in over USB, ssh needs its Wi-Fi.

## Sensor reader
`pi/trackprint.py` sets up each MAX30102 the same way the old Arduino sketch did: LED power 0x1F, 4-sample average, red+IR, 200 sps, which works out to 50 Hz out. LED power is `0x1F` by default (the `LED_POWER` knob in the file). It writes one `ir0,ir1,ir2,ir3` line every 20 ms to `/dev/ttyGS0`, with `0` for a missing sensor. Each sensor is read in its own thread, so an unplugged sensor drops to `0` and is picked up again within about 2 s of being plugged back in.

Checks, over ssh:
```bash
i2cdetect -y 1        # also -y 3, -y 4, -y 5; each should show 57
journalctl -u trackprint -f                                     # "sensor on i2c-N ready" / "lost"
sudo systemctl stop trackprint && python3 /opt/trackprint/trackprint.py -   # print lines to the terminal
sudo systemctl start trackprint
```
A value jumps above ~45000 with a finger on (the app counts anything over 30000 as a finger).

**Tuning the signal, no restart** (over ssh, as `flatline`, no sudo):
```bash
echo led=0x3F > ~/trackprint.conf && pkill -HUP -f trackprint.py   # LED power 0x00-0x7F; raise it if the signal is weak, lower it if raw IR saturates near 262143. Kept across restarts.
pkill -USR1 -f trackprint.py                                       # write the last 30 s of red + IR per sensor to /tmp/trackprint-dump.csv
```

**Live pulse-quality meter** (on the laptop, needs `numpy`):
```bash
python3 tools/pulse_meter.py
```
Every 2 s it pulls the last 8 s of red + IR over ssh and prints, per sensor, the signal level, pulse size, rhythm, IR/red ratio and shake, with a verdict (`GOOD pulse, 72 BPM`, `MOVING: hold still`, ...). Use it to find the right LED power and finger pressure. It covers sensors 1-3, since sensor 4 is broken. Ctrl+C stops it.

Connect the Pi's **USB** port (not PWR IN) to the laptop. That one cable powers the Pi and carries the data. The Pi takes about 30 s to boot, and then it shows up as a serial port (`/dev/cu.usbmodem*` on a Mac). Shut it down with `sudo poweroff` before unplugging, so the SD card doesn't get corrupted.

`firmware/trackprint/` is the old Arduino + TCA9548A sketch, kept for reference. The Arduino sections below (single-sensor testing, Linux troubleshooting) are legacy: the Pi is the default sensor source now.

## Run
```bash
cd web && python3 -m http.server 8000
```
Open http://localhost:8000 in Chrome or Edge. Use **Simulate** (no hardware) or **Connect sensors**. The picker lists only the Pi (its USB gadget serial port); add `?port=any` to list every port, e.g. for the old Arduino.

The kit menu contains four evolving genre styles:

- **French house** — disco four-on-the-floor with sidechain pump, plucked bass, talkbox vowel lead, and short phased saw stabs
- **UK garage** — shuffled two-step with a rim and metal hats, rubbery FM bass, chopped ah/oh vocal lead, and organ stabs
- **Ambient** — sparse percussion, long bass swells, sustained chords, and wide melodic space
- **Russian hardbass** — long distorted kick, offbeat fat-saw donk bass, supersaw riffs, and rave stabs

Each active sensor evolves its assigned voice automatically from its recent signal history
and the shared musical grid. Kit selection is the only creative control; connection,
simulation, and routing controls remain operational controls. Pulse amplitude and beat
interval variation are bounded modulation sources, not calibrated finger-pressure or
breathing-rate controls.

Not all four sensors wired yet? Open http://localhost:8000/?fill=sim and use **Connect sensors**: channels whose sensor reads `0` (not plugged in) get simulated pulses, the real ones play from your fingers.

**Save log / analyze.** **Save log** downloads a CSV of every reading since connecting. Replay it through the real beat detector with `node tools/analyze-log.mjs ~/Downloads/flatline-log-*.csv`.

**Broken sensor.** All four sensors are read by default. If one stops working, the app can simulate it: open `?sim=4` (or `?sim=3,4`) for one visit, or list it in `BROKEN_SENSORS` in `web/serial.js` to make that the default. A simulated sensor plays a heartbeat whenever every working sensor has a finger on it, so the four can still merge. Logs note which sensors were simulated and the analyzer skips them.

## Testing with one sensor (legacy Arduino)
`firmware/trackprint_single` is for testing with a single MAX30102 wired straight to the Uno, without the mux: SDA → A4, SCL → A5, VIN → 3.3V, GND → GND. It sends the same `ir0,ir1,ir2,ir3` lines as the full firmware. The real reading goes on `CHANNEL` (default 0, drums, so your finger sets the tempo) and the other channels send `0`.

```bash
arduino-cli core install arduino:avr
arduino-cli lib install "SparkFun MAX3010x Pulse and Proximity Sensor Library"
arduino-cli compile -b arduino:avr:uno firmware/trackprint_single
arduino-cli upload  -b arduino:avr:uno -p /dev/ttyACM0 firmware/trackprint_single
```

At boot it prints one `# MAX30102 found on A4/A5` (or `not found`) line, which the web app ignores. Then come 50 lines per second. With no finger the reading is around 1,000; with a finger it's above 50,000.

To play: open http://localhost:8000/?fill=sim&port=any, click **Connect sensors**, pick the Arduino. Your finger plays drums and the other three voices are simulated. Click any circle to move the sensor to that voice; its label shows `· sensor`. This works with whichever channel the sensor is on, so you don't need to change `CHANNEL` and re-upload.

## Troubleshooting (Linux)
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
Group changes only apply to programs started after a fresh login. Restarting the browser isn't enough. To use the port right away, before logging out:
```bash
sudo setfacl -m u:<your-username>:rw /dev/ttyACM0   # lasts until the Arduino is unplugged
newgrp uucp                                         # a shell with the new group, for arduino-cli
```
Type your username out instead of using `$USER`. On our machine `$USER` was empty, so `setfacl` failed with `Invalid argument near character 3`.

**The browser's port picker says "No serial ports available".** This is usually the permission problem above. Also use Chrome, Chromium or Edge: Web Serial is what this project is built and tested on there. On Arch: `sudo pacman -S chromium` (official repos) or `yay -S google-chrome` (AUR).

**The picker lists lots of `ttyS0`, `ttyS1`, ... ports.** Those are built-in legacy serial ports with nothing attached. Pick **ttyACM0** (it may be labelled "Arduino Uno"). `ls -l /dev/serial/by-id/` shows which device is the Arduino.

**`Failed to open serial port` even with permissions.** Only one program can hold the port. Close `arduino-cli monitor`, the Arduino IDE serial monitor, or any other tab connected to it.

## Test
```bash
for t in test audio-test fluid-test stage-test; do node web/$t.mjs || break; done
```
