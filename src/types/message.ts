// defining the types of messages that's sent from the arduino to the web
export type ArduinoMessage =
  //type of bpm instead of string becuase then no other string value is allowed
  | { type: "bpm"; bpm: number }
  | { type: "noFinger" }
  | { type: "beat" }
  | { type: "wave"; value: number } //                   one point of the live pulse wave (50 per second)
  | { type: "gsr"; value: number } //                    skin response (sweat level), higher = more stressed
  | { type: "room"; temp: number; humidity: number }; // room temperature (°C) and humidity (%) from the DHT22

//defining the type of signal messages of the arduino to the host machine
export type signalMessage = "waiting" | "good" | "unsteady" | "noFinger" | "noData";

// the steps of one calming session
//   idle     → nothing started yet
//   baseline → 20 s of measuring how you are at the START (we compare everything to this)
//   calming  → breathing guide + music
//   report   → before vs after
export type Phase = "idle" | "baseline" | "calming" | "report";

// where the readings come from
export type Source = "none" | "arduino" | "demo";

// one snapshot of all the sensors, taken once a second
export type Reading = {
  time: number; //              seconds since the session started
  bpm: number | null; //        heart rate
  gsr: number | null; //        skin response
  roomTemp: number | null; //   room temperature
  humidity: number | null; //   room humidity
  score: number | null; //      calm score at that moment
};

// the average of each sensor over a stretch of time (start of session / end of session)
export type Averages = {
  bpm: number | null;
  gsr: number | null;
  roomTemp: number | null;
  humidity: number | null;
};

// everything the report screen needs at the end of a session
export type ReportData = {
  before: Averages; //          average during the baseline (start)
  after: Averages; //           average over the last 20 s (end)
  readings: Reading[]; //       every second of the session, for the chart
  finalScore: number | null; // calm score at the end
  calmingSeconds: number; //    how long the calming part lasted
  breathingStart: number; //    the second the breathing guide started (for the chart)
  stressTimes: number[]; //     the seconds when stress showed up (⚡ marks on the chart)
};
