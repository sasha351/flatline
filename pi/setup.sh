#!/bin/sh
# One-time Pi setup. Run from this folder on the Pi: sudo ./setup.sh
# Safe to re-run. Reboot afterwards.
set -eu
[ "$(id -u)" = 0 ] || { echo "run with sudo"; exit 1; }

CONFIG=/boot/firmware/config.txt
CMDLINE=/boot/firmware/cmdline.txt
USER_NAME=${SUDO_USER:-flatline}

apt-get install -y python3-smbus2 i2c-tools

# One hardware I2C bus + three bit-banged ones (sensor 0..3 -> i2c-1,3,4,5),
# and USB gadget mode so the laptop sees the Pi as a serial port.
# ponytail: also match the old "# trackPrint" marker so re-runs on a pre-rename Pi don't append twice
if ! grep -qE '^# (trackPrint|flatline)$' "$CONFIG"; then
  cat >> "$CONFIG" <<'EOF'

# flatline
[all]
dtparam=i2c_arm=on
dtoverlay=i2c-gpio,bus=3,i2c_gpio_sda=17,i2c_gpio_scl=27
dtoverlay=i2c-gpio,bus=4,i2c_gpio_sda=22,i2c_gpio_scl=23
dtoverlay=i2c-gpio,bus=5,i2c_gpio_sda=24,i2c_gpio_scl=25
dtoverlay=dwc2,dr_mode=peripheral
EOF
fi
# Weak internal pull-ups on the bit-banged pins: an empty bus then fails fast
# instead of hanging on clock-stretch timeouts. Breakout pull-ups still dominate.
grep -q '^gpio=17,22-25,27=pu' "$CONFIG" || echo 'gpio=17,22-25,27=pu' >> "$CONFIG"
# The OLED shares i2c-1 with sensor 0. At 400 kHz instead of the default 100 kHz, each frame write takes about a quarter of the time.
grep -q '^dtparam=i2c_arm_baudrate=' "$CONFIG" || echo 'dtparam=i2c_arm_baudrate=400000' >> "$CONFIG"

grep -q 'modules-load=dwc2,g_serial' "$CMDLINE" ||
  sed -i '1 s/$/ modules-load=dwc2,g_serial/' "$CMDLINE"

usermod -aG i2c,dialout "$USER_NAME"

# ponytail: one-time migration from the old trackprint name; delete once the Pi has run it
systemctl disable --now trackprint.service 2>/dev/null || true
rm -rf /opt/trackprint /etc/systemd/system/trackprint.service
[ -f "/home/$USER_NAME/trackprint.conf" ] && mv "/home/$USER_NAME/trackprint.conf" "/home/$USER_NAME/flatline.conf"

install -d /opt/flatline
install -m 755 flatline.py /opt/flatline/flatline.py
install -m 755 oled.py /opt/flatline/oled.py
sed "s/^User=.*/User=$USER_NAME/" flatline.service > /etc/systemd/system/flatline.service
systemctl daemon-reload
systemctl enable flatline.service

echo "done; reboot to apply"
