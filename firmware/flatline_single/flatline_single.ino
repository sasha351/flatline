// flatline single-sensor test: one MAX30102 wired straight to the Uno's I2C pins
// (SDA = A4, SCL = A5), no TCA9548A mux. Streams the same CSV as the full firmware,
// ir0,ir1,ir2,ir3 at 50 Hz, 115200 baud, with the real reading on CHANNEL and 0 on
// the others (0 = sensor missing). Open the web app with ?fill=sim to simulate those.
#include <Wire.h>
#include "MAX30105.h"  // SparkFun MAX3010x library; also drives the MAX30102

// Which voice the real sensor plays: 0 drums (sets the tempo), 1 bass, 2 lead, 3 pad.
const uint8_t CHANNEL = 0;
const uint8_t N = 4;

MAX30105 sensor;
bool ok = false;
uint32_t lastIr = 0;

void setup() {
  Serial.begin(115200);
  Wire.begin();
  ok = sensor.begin(Wire, I2C_SPEED_FAST);
  // Lines starting with '#' are ignored by the web app's parser, so they're safe to print.
  if (ok) {
    // ponytail: LED power 0x1F is the calibration knob; raise it if signal is weak, lower it if raw IR saturates near 262143
    // powerLevel, sampleAverage, ledMode(2=red+IR), sampleRate, pulseWidth, adcRange
    sensor.setup(0x1F, 4, 2, 200, 411, 4096);  // 200 sps / 4 avg = 50 Hz
    Serial.println(F("# MAX30102 found on A4/A5"));
  } else {
    Serial.println(F("# MAX30102 not found: check wiring (SDA=A4, SCL=A5, 3.3V, GND) and pull-ups"));
  }
}

void loop() {
  static uint32_t next = 0;
  uint32_t now = millis();
  if ((int32_t)(now - next) < 0) return;
  next = now + 20;  // 50 Hz

  if (ok) {
    sensor.check();  // non-blocking FIFO read
    while (sensor.available()) {
      lastIr = sensor.getFIFOIR();
      sensor.nextSample();
    }
  }
  for (uint8_t i = 0; i < N; i++) {
    if (i) Serial.print(',');
    Serial.print(i == CHANNEL && ok ? lastIr : 0);
  }
  Serial.println();
}
