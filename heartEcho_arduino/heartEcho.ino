// CalmBeat / HeartEcho (pulse + GSR + temperature/humidity)
// LCD:     scrolling heartbeat line, or "Place finger" when there's no pulse
// Website: sends over USB at 115200 baud:
//            BEAT, BPM:72, NOFINGER        (pulse)
//            GSR:176                       (once a second; higher = more sweat = more stressed)
//            ROOM:25.9,70                  (temperature °C, humidity %, once a second; nothing if the sensor fails)
//            W:-35                         (the live pulse wave, 50 times a second, so the website can draw it)
//
// Wiring:  pulse signal -> A0, GSR signal -> A1, AM2302/DHT22 data -> D2,
//          LCD SDA -> A4, SCL -> A5
//
// Serial Monitor / Plotter: set baud to 115200.
// DEBUG = 1 prints a "DBG ..." line twice a second so you can see the sensor values.
// PLOT  = 1 prints the cleaned pulse wave for Tools -> Serial Plotter (to check the sensor).
// Keep both at 0 when connecting to the website.
//
// No LCD? Set USE_LCD to 0 below. Everything else works the same.
//
// WHAT CHANGED (so you don't need to tap the sensor any more):
//   1. The slow drift is removed from the pulse signal (finger pressure, light changes), so only the
//      heartbeat wave is left, centred on 0. Before, the drift was mixed in with the beat.
//   2. That wave is smoothed a little more and made 4x bigger, so even a small, gentle pulse is clear.
//   3. MIN_AMPLITUDE is now measured on that clean wave, so a still finger is enough.
//   4. "Finger off" now needs the signal to be gone for a while (not one tiny dip), so it doesn't
//      keep resetting.
//   5. BEAT / BPM are only sent once a real repeating pulse is confirmed (no random beats from noise),
//      and a "pulse" found at the very edge of the search range (= slow drift) is ignored.
//   6. The room sensor now sends ROOM:t,h, which is what the website expects.

#include <DHT.h>

#define DEBUG   0
#define PLOT    0
#define USE_LCD 1     // 1 = use the LCD screen, 0 = no LCD (the whole LCD section below is skipped)

const int PULSE_PIN = A0;
const int GSR_PIN   = A1;

#define DHTPIN  2
#define DHTTYPE DHT22
DHT dht(DHTPIN, DHTTYPE);
const float TEMP_OFFSET = 0.0;        // calibrate against a trusted thermometer

// GSR direction: the Grove GSR gives a LOWER number when you sweat. The website wants
// "higher = more stressed", so we flip it (1023 - reading).
// Test: take a sharp breath or get startled. The GSR number on the website should go UP.
// If it goes DOWN instead, change this to false.
const bool GSR_FLIP = true;

float gsrSmooth = -1;
float temperature = 0, humidity = 0;
bool  dhtOk = false;
unsigned long lastGSR = 0, lastDHT = 0, lastSend = 0;

// ---- pulse signal cleaning ----
float baseline = -1;            // the slow level of the signal (drift); we subtract it
float smoothWave = 0;           // the heartbeat wave after removing drift, lightly smoothed
const int GAIN = 4;             // make the wave 4x bigger, so small pulses still have detail
const int MIN_AMPLITUDE = 16;   // wave smaller than this (after cleaning, x4) = no finger / just noise
                                // (about 4 raw units; raise it if noise is detected as a pulse)

int spikeStep = 0;               // 1 = draw a heartbeat spike on the LCD next

int raw[10];
long rawSum = 0;
int rawIndex = 0;

const int N = 200;
const int MIN_WINDOW = 150;     // first search after 3 s of data
int wave[N];
int waveIndex = 0, waveCount = 0, tick = 0;

const int MIN_LAG = 19;   // 19 x 20 ms = fastest 157 BPM (the peak must sit above this edge)
const int MAX_LAG = 75;
int start = 0;
int winLen = 0;
long waveMean = 0;
int lag = 0;
float score[MAX_LAG + 2];

float peak = 0, trough = 0;
bool rising = false;
unsigned long lastBeat = 0;
unsigned long beatGap = 0;
unsigned long lastGoodResult = 0; // when the repeat search last found a clear pulse
unsigned long weakSince = 0;      // when the wave became too small (0 = it isn't)

int bpms[5];
int bpmCount = 0, bpmIndex = 0;
int lastResult = 0;               // the previous BPM result (to check that results agree)
int bpm = 0;
bool fingerOn = false;

unsigned long lastSample = 0, lastSearch = 0, lastDebug = 0;

int medianBpm() {
  int s[5];
  for (int i = 0; i < bpmCount; i++) s[i] = bpms[i];
  for (int i = 0; i < bpmCount; i++)
    for (int j = i + 1; j < bpmCount; j++)
      if (s[j] < s[i]) { int t = s[i]; s[i] = s[j]; s[j] = t; }
  return s[bpmCount / 2];
}

// ======================= LCD SECTION (only used when USE_LCD is 1) =======================
#if USE_LCD
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

LiquidCrystal_I2C lcd(0x27, 16, 2);

byte FLAT[8] = {0, 0, 0, 0, 0b11111, 0, 0, 0};
byte UP[8]   = {0b00001, 0b00001, 0b00001, 0b00001, 0b11111, 0, 0, 0};
byte DOWN[8] = {0b10000, 0b10000, 0b10000, 0b10000, 0b10011, 0b10100, 0b10100, 0b11000};
byte TOPL[8] = {0, 1, 1, 1, 1, 1, 1, 1};
byte TOPR[8] = {0, 16, 16, 16, 16, 16, 16, 16};

char top[16], bottom[16];
unsigned long lastScroll = 0;

// "Place finger" message + a flat line ready for when the pulse comes back
void lcdNoFinger() {
  lcd.clear();
  lcd.setCursor(0, 0); lcd.print("  Place finger");
  lcd.setCursor(0, 1); lcd.print("  on the sensor");
  for (int i = 0; i < 16; i++) { top[i] = ' '; bottom[i] = 1; }
}

void lcdStart() {
  Wire.begin();
  Wire.setClock(400000);
  lcd.init();
  lcd.backlight();
  lcd.createChar(1, FLAT);
  lcd.createChar(2, UP);
  lcd.createChar(3, DOWN);
  lcd.createChar(4, TOPL);
  lcd.createChar(5, TOPR);
  lcdNoFinger();
}

// Scroll the heartbeat line one step (every 110 ms while a finger is on)
void lcdScroll(unsigned long now) {
  if (!fingerOn || now - lastScroll < 110) return;
  lastScroll = now;
  for (int i = 0; i < 15; i++) { top[i] = top[i + 1]; bottom[i] = bottom[i + 1]; }
  if (spikeStep == 1)      { top[15] = 4;   bottom[15] = 2; spikeStep = 2; }
  else if (spikeStep == 2) { top[15] = 5;   bottom[15] = 3; spikeStep = 0; }
  else                     { top[15] = ' '; bottom[15] = 1; }
  lcd.setCursor(0, 0); for (int i = 0; i < 16; i++) lcd.write(top[i]);
  lcd.setCursor(0, 1); for (int i = 0; i < 16; i++) lcd.write(bottom[i]);
}

#else
// no LCD: these do nothing
void lcdStart() {}
void lcdNoFinger() {}
void lcdScroll(unsigned long now) {}
#endif
// ===================================== END OF LCD SECTION =================================

// Forget everything about the pulse (finger came off)
void resetPulse(unsigned long now) {
  fingerOn = false;
  bpmCount = 0;
  bpmIndex = 0;
  bpm = 0;
  beatGap = 0;
  spikeStep = 0;
  lastBeat = now;
  lastGoodResult = now;
  weakSince = 0;
}

void setup() {
  Serial.begin(115200);
  Serial.println("READY");                 // you should see this right after opening the Serial Monitor
  dht.begin();
  lcdStart();
  lastBeat = millis();
}

void loop() {
  if (micros() - lastSample < 2000) return;
  lastSample = micros();
  unsigned long now = millis();

  // 1. Smooth the reading (average of 10 = 20 ms, which also cancels 50 Hz mains hum)
  rawSum -= raw[rawIndex];
  raw[rawIndex] = analogRead(PULSE_PIN);
  rawSum += raw[rawIndex];
  rawIndex = (rawIndex + 1) % 10;
  int v = rawSum / 10;

  // 2. Remove the slow drift and keep only the heartbeat wave
  //    baseline follows the signal slowly (about half a second), so (v - baseline) is just the pulse
  if (rawIndex == 0 && baseline < 0) baseline = v;     // start once the first 10 readings are in
  if (baseline < 0) return;
  baseline += (v - baseline) / 250.0;
  smoothWave += ((v - baseline) - smoothWave) * 0.15;   // a little extra smoothing (removes jitter)
  int p = (int)(smoothWave * GAIN);                      // the clean pulse wave, centred on 0, 4x bigger

  // 3. Save the clean wave every 20 ms (the last 4 seconds are kept for the repeat search)
  if (++tick >= 10) {
    tick = 0;
    wave[waveIndex] = p;
    waveIndex = (waveIndex + 1) % N;
    if (waveCount < N) waveCount++;
#if !PLOT
    Serial.print("W:");                       // the live wave for the website (50 times a second)
    Serial.println(p);
#endif
#if PLOT
    // Serial Plotter: the clean wave, plus the two lines a beat has to cross
    Serial.print(p); Serial.print(" ");
    Serial.print((int)(trough + (peak - trough) * 2 / 3)); Serial.print(" ");
    Serial.println((int)(trough + (peak - trough) / 3));
#endif
  }

  // 4. Follow the top and bottom of the wave (they jump out instantly and drift back in about 1 s)
  if (p > peak) peak = p; else peak -= (peak - p) / 500.0;
  if (p < trough) trough = p; else trough += (p - trough) / 500.0;
  float amplitude = peak - trough;
  float middle = trough + amplitude / 2;
  float margin = amplitude / 6;

#if DEBUG
  if (now - lastDebug >= 500) {
    lastDebug = now;
    Serial.print("DBG v=");   Serial.print(v);
    Serial.print(" wave=");   Serial.print(p);
    Serial.print(" amp=");    Serial.print((int)amplitude);
    Serial.print(" need>=");  Serial.print(MIN_AMPLITUDE);
    Serial.print(" bpm=");    Serial.print(bpm);
    Serial.print(" finger="); Serial.println(fingerOn);
  }
#endif

  // 5. Start a repeat search (how often does the wave repeat?) every half second
  if (lag == 0 && waveCount >= MIN_WINDOW && amplitude >= MIN_AMPLITUDE && now - lastSearch >= 500) {
    lastSearch = now;
    winLen = waveCount;
    start = (waveIndex - winLen + N) % N;
    long sum = 0;
    int idx = start;
    for (int i = 0; i < winLen; i++) {
      sum += wave[idx];
      if (++idx >= N) idx = 0;
    }
    waveMean = sum / winLen;
    lag = MIN_LAG - 1;
  }

  // 6. Check one shift per loop
  if (lag > 0) {
    long match = 0, sizeA = 0, sizeB = 0;
    int ia = start;
    int ib = (start + lag) % N;
    for (int i = 0; i + lag < winLen; i++) {
      int a = wave[ia] - waveMean;
      int b = wave[ib] - waveMean;
      match += (long)a * b; sizeA += (long)a * a; sizeB += (long)b * b;
      if (++ia >= N) ia = 0;
      if (++ib >= N) ib = 0;
    }
    score[lag] = match / (sqrt((float)sizeA * (float)sizeB) + 1);
    lag++;
    if (lag > MAX_LAG + 1) {
      lag = 0;
      int best = MIN_LAG;
      for (int L = MIN_LAG; L <= MAX_LAG; L++) if (score[L] > score[best]) best = L;
      if (beatGap) {
        int prev = beatGap / 20;
        int nearPrev = 0;
        for (int L = max(MIN_LAG, prev * 8 / 10); L <= min(MAX_LAG, prev * 12 / 10); L++)
          if (nearPrev == 0 || score[L] > score[nearPrev]) nearPrev = L;
        if (nearPrev && score[nearPrev] >= score[best] * 0.85) best = nearPrev;
      }
      // A real pulse gives a clear PEAK inside the range. If the best match is at the very edge
      // (shortest or longest shift), it's just slow drift or noise, not a heartbeat → ignore it.
      bool isPeak = best > MIN_LAG && best < MAX_LAG &&
                    score[best] >= score[best - 1] && score[best] >= score[best + 1];
      // A real heartbeat's match score DIPS between beats (half a beat later the wave is upside down)
      // and then rises to the peak. Slow drift just slides down smoothly, with no dip.
      float lowest = score[best];
      for (int L = MIN_LAG; L < best; L++) if (score[L] < lowest) lowest = score[L];
      if (score[best] - lowest < 0.3) isPeak = false;
      if (isPeak && score[best] > 0.5) {                // a clear repeating pattern = a real pulse
        float a = score[best - 1], b = score[best], c = score[best + 1];
        float shift = (a - 2 * b + c != 0) ? 0.5 * (a - c) / (a - 2 * b + c) : 0;
        shift = constrain(shift, -0.5, 0.5);
        unsigned long gap = (best + shift) * 20;        // milliseconds per beat
        int result = 60000 / gap;
        // Before we trust a finger, two results in a row must AGREE (within 12%).
        // A real pulse gives the same answer again; noise jumps around.
        if (!fingerOn && bpmCount > 0 && abs(result - lastResult) > lastResult * 12 / 100) {
          bpmCount = 0;                                 // they disagree → start counting again
          bpmIndex = 0;
        }
        lastResult = result;
        beatGap = gap;
        bpms[bpmIndex] = result;
        bpmIndex = (bpmIndex + 1) % 5;
        if (bpmCount < 5) bpmCount++;
        bpm = medianBpm();
        lastGoodResult = now;
        if (bpmCount >= 2 && !fingerOn) {               // two clear, agreeing results → we trust it
          fingerOn = true;
          lastBeat = now;
        }
      }
    }
  }

  // 7. Beat detection: the wave rises clearly above its middle (and not too soon after the last beat)
  unsigned long ignoreTime = beatGap ? beatGap * 6 / 10 : 400;
  if (!rising && p > middle + margin && amplitude >= MIN_AMPLITUDE && now - lastBeat > ignoreTime) {
    rising = true;
    lastBeat = now;
    if (fingerOn) {                                   // only real, confirmed pulses go to the website
      spikeStep = 1;
      Serial.println("BEAT");
      Serial.print("BPM:");
      Serial.println(bpm);
    }
  }
  if (rising && p < middle - margin) rising = false;

  // 8. Finger off: the pulse has really gone (not just one small dip)
  if (amplitude < MIN_AMPLITUDE) { if (weakSince == 0) weakSince = now; }
  else weakSince = 0;
  bool weakTooLong   = weakSince != 0 && now - weakSince > 1500;   // wave too small for 1.5 s
  bool noBeats       = now - lastBeat > 3000;                       // no beat for 3 s
  bool noGoodResults = now - lastGoodResult > 5000;                 // no clear repeating pulse for 5 s
  if (fingerOn && (weakTooLong || noBeats || noGoodResults)) {
    Serial.println("NOFINGER");
    lcdNoFinger();
    resetPulse(now);
  } else if (!fingerOn && weakTooLong) {
    bpmCount = 0;                                       // don't mix old results with a new finger
    bpmIndex = 0;
  }

  // 9. Scroll the heartbeat line on the LCD (does nothing when USE_LCD is 0)
  lcdScroll(now);

  // 10. GSR (every 50 ms: average of 8 reads, then smoothed)
  if (now - lastGSR >= 50) {
    lastGSR = now;
    analogRead(GSR_PIN);                      // discard: ADC settles after a channel change
    long gs = 0;
    for (int i = 0; i < 8; i++) gs += analogRead(GSR_PIN);
    float g = gs / 8.0;
    if (GSR_FLIP) g = 1023 - g;               // so higher = more sweat
    gsrSmooth = (gsrSmooth < 0) ? g : 0.9 * gsrSmooth + 0.1 * g;
    analogRead(PULSE_PIN);                    // discard: switch the ADC back to the pulse pin
  }

  // 11. Temperature + humidity (AM2302 / DHT22 needs 2+ s between reads)
  if (now - lastDHT >= 2500) {
    lastDHT = now;
    float t = dht.readTemperature();
    float h = dht.readHumidity();
    if (!isnan(t) && !isnan(h)) {
      temperature = t + TEMP_OFFSET;
      humidity = h;
      dhtOk = true;
    } else {
      dhtOk = false;
    }
    analogRead(PULSE_PIN);
  }

  // 12. Send GSR and ROOM to the website once a second
#if !PLOT
  if (now - lastSend >= 1000) {
    lastSend = now;
    Serial.print("GSR:");
    Serial.println((int)(gsrSmooth + 0.5));
    if (dhtOk) {                              // ROOM:25.9,70  (the website's format)
      Serial.print("ROOM:");
      Serial.print(temperature, 1);
      Serial.print(",");
      Serial.println(humidity, 0);
    }
  }
#endif
}
