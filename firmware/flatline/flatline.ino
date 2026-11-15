// flatline: read 4x MAX30102 through a TCA9548A mux, stream raw IR as CSV.
// Line format: ir0,ir1,ir2,ir3  at 50 Hz, 115200 baud. Missing sensor = 0.
#include <Wire.h>
#include "MAX30105.h"  // SparkFun MAX3010x library; also drives the MAX30102

const uint8_t MUX_ADDR = 0x70;  // TCA9548A with A0-A2 tied to GND
const uint8_t N = 4;

MAX30105 sensors[N];
bool ok[N];
uint32_t lastIr[N];

void selectChannel(uint8_t ch) {
  Wire.beginTransmission(MUX_ADDR);
  Wire.write(1 << ch);
  Wire.endTransmission();
}

void setup() {
  Serial.begin(115200);
  while (!Serial) {}  // Leonardo: wait for USB host. No-op on Uno.
  Wire.begin();
  for (uint8_t i = 0; i < N; i++) {
    selectChannel(i);
    ok[i] = sensors[i].begin(Wire, I2C_SPEED_FAST);
    // ponytail: LED power 0x1F is the calibration knob; raise it if signal is weak, lower it if raw IR saturates near 262143
    // powerLevel, sampleAverage, ledMode(2=red+IR), sampleRate, pulseWidth, adcRange
    if (ok[i]) sensors[i].setup(0x1F, 4, 2, 200, 411, 4096);  // 200 sps / 4 avg = 50 Hz
  }
}

void loop() {
  static uint32_t next = 0;
  uint32_t now = millis();
  if ((int32_t)(now - next) < 0) return;
  next = now + 20;  // 50 Hz

  for (uint8_t i = 0; i < N; i++) {
    if (ok[i]) {
      selectChannel(i);
      sensors[i].check();  // non-blocking FIFO read
      while (sensors[i].available()) {
        lastIr[i] = sensors[i].getFIFOIR();
        sensors[i].nextSample();
      }
    }
    if (i) Serial.print(',');
    Serial.print(ok[i] ? lastIr[i] : 0);
  }
  Serial.println();
}
