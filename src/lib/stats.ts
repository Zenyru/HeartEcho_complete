import type { Averages, Reading } from "../types/message";

// Average of a list of numbers, skipping the empty (null) ones.
// [70, null, 72] → 71      [] or [null, null] → null
export function average(values: (number | null)[]): number | null {
  const real = values.filter((v): v is number => v !== null); // keep only real numbers
  if (real.length === 0) return null; //                         nothing to average
  const sum = real.reduce((acc, v) => acc + v, 0);
  return sum / real.length;
}

// Average of every sensor over a list of readings
export function averagesOf(readings: Reading[]): Averages {
  return {
    bpm: average(readings.map((r) => r.bpm)),
    gsr: average(readings.map((r) => r.gsr)),
    roomTemp: average(readings.map((r) => r.roomTemp)),
    humidity: average(readings.map((r) => r.humidity)),
  };
}

// Turns seconds into "m:ss", e.g. 95 → "1:35"
export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m + ":" + String(s).padStart(2, "0");
}
