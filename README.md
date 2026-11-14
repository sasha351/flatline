# trackPrint

Four heart-rate sensors → four-voice electronic band in the browser.
ch0 drums · ch1 bass · ch2 lead · ch3 pad.

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
- Planned: GME12864 0.96" OLED (SSD1306), WS2812B LED strip, 2 buttons + 1 switch (see Wiring)

## Wiring
Only 21 of the 40 header pins are needed. Pin numbers are physical header pins: pin 1 is the square pad at the SD-card end, odd pins are on the inner row and even pins on the board edge. *Planned* rows are reserved for hardware the software doesn't use yet.

| Pin | Function | Connects to |
|---|---|---|
| 1 | 3.3V | VIN of sensor 0, sensor 1, display |
| 2 | 5V | LED strip 5V *(planned; small strips only)* |
| 3 | GPIO2, `i2c-1` SDA | sensor 0 SDA + display SDA |
| 5 | GPIO3, `i2c-1` SCL | sensor 0 SCL + display SCL |
| 6 | GND | sensor 0 + display |
| 9 | GND | sensor 1 |
| 11 | GPIO17, `i2c-3` SDA | sensor 1 SDA |
| 13 | GPIO27, `i2c-3` SCL | sensor 1 SCL |
| 14 | GND | sensor 2 |
| 15 | GPIO22, `i2c-4` SDA | sensor 2 SDA |
| 16 | GPIO23, `i2c-4` SCL | sensor 2 SCL |
| 17 | 3.3V | VIN of sensor 2, sensor 3 |
| 18 | GPIO24, `i2c-5` SDA | sensor 3 SDA |
| 19 | GPIO10, SPI MOSI | LED strip data in *(planned)* |
| 20 | GND | sensor 3 + LED strip GND |
| 22 | GPIO25, `i2c-5` SCL | sensor 3 SCL |
| 29 | GPIO5 | button A *(planned)* |
| 30 | GND | buttons A and B |
| 31 | GPIO6 | button B *(planned)* |
| 37 | GPIO26 | switch *(planned)* |
| 39 | GND | switch |

Pins 1 and 17 are the same 3.3V supply, and every GND pin is the same ground, so swap in any spare GND (25, 34) if that makes wiring easier. Split power with a splice or a strip of perfboard rather than stacking wires on one pin. Leave pins 8/10 (GPIO14/15, the boot console) and 27/28 (GPIO0/1, reserved for add-on board ID) alone.

**Sensors.** Only 3.3V belongs on GPIO pins. Never put 5V on one. The breakouts' own SDA/SCL resistors are the real pull-ups. The Pi's weak internal ones (see setup) only keep an empty bus from hanging. Some cheap purple MAX30102 boards pull up to 1.8V, and those need the pull-up jumper or trace moved to 3.3V. This matters most for sensor 0, which shares its bus with the display. If a sensor reads `0`, check its wiring and pull-up voltage.

**Display** (GME12864, SSD1306 OLED, address `0x3C`; planned). It shares `i2c-1` with sensor 0, since their addresses differ. Power it from 3.3V, not 5V: its pull-ups run at its supply voltage, and 5V on SDA/SCL can damage the Pi. VCC and GND swap places between batches, so wire it by the labels on the board.

**LED strip** (WS2812B; planned). It needs `dtparam=spi=on`. Pin 12 (GPIO18, PWM) is the alternative data pin. WS2812B wants a data signal near 5V, and 3.3V is unreliable, so add a 74AHCT125 level shifter powered from 5V, or at least a ~330 Ω resistor in the data line. Put a ~1000 µF capacitor across the strip's 5V/GND. The laptop's USB port supplies about 500–900 mA and the Pi uses about 150 mA, while each LED can draw up to 60 mA at full white. Keep pin 2 to a few LEDs or low brightness, and give larger strips their own 5V supply with a shared ground.

**Buttons and switch** (planned). Wire GPIO to one side and GND to the other. The Pi's internal pull-ups read high, and a press reads low. Debounce in software.

## Pi setup
Flash Raspberry Pi OS Lite (Trixie), enable SSH, then from this repo:
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

## Sensor reader
`pi/trackprint.py` sets up each MAX30102 the same way the old Arduino sketch did: LED power 0x1F, 4-sample average, red+IR, 200 sps, which works out to 50 Hz out. It writes one `ir0,ir1,ir2,ir3` line every 20 ms to `/dev/ttyGS0`, with `0` for a missing sensor. Each sensor is read in its own thread, so an unplugged sensor drops to `0` and is picked up again within about 2 s of being plugged back in.

Checks, over ssh:
```bash
i2cdetect -y 1        # also -y 3, -y 4, -y 5; each should show 57
journalctl -u trackprint -f                                     # "sensor on i2c-N ready" / "lost"
sudo systemctl stop trackprint && python3 /opt/trackprint/trackprint.py -   # print lines to the terminal
sudo systemctl start trackprint
```
A value jumps above ~50000 with a finger on.

Connect the Pi's **USB** port (not PWR IN) to the laptop. That one cable powers the Pi and carries the data. The Pi takes about 30 s to boot, and then it shows up as a serial port (`/dev/cu.usbmodem*` on a Mac). Shut it down with `sudo poweroff` before unplugging, so the SD card doesn't get corrupted.

`firmware/trackprint/` is the old Arduino + TCA9548A sketch, kept for reference.

## Run
```bash
cd web && python3 -m http.server 8000
```
Open http://localhost:8000 in Chrome or Edge. Use **Simulate** (no hardware) or **Connect sensors**, and pick the Pi's serial port.

To check wiring, open http://localhost:8000/sensors.html instead and press **Connect Pi**. It shows each sensor's raw value, status (not detected / no finger / finger on / saturated), a live trace and BPM, plus the incoming line rate. Only one tab can hold the serial port at a time.

## Test
```bash
node web/test.mjs
```
