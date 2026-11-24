import type { Averages } from "../types/message";

// ---------- Calm Score (0 – 100) ----------
// We compare how your body is NOW with how it was at the START (the baseline).
// 50 = exactly the same as when you started. Higher = calmer. Lower = more stressed.
//
//   Heart:        every 1 BPM slower       → +3 points
//   Skin (GSR):   every 1% less sweat      → +1.5 points
//   (the room sensor is NOT part of the score: it measures the room, not you)
//
// Example: heart 90 → 80 (+30), sweat 10% lower (+15) → 50 + 45 = 95
const START = 50;
const POINTS_PER_BPM = 3;
const POINTS_PER_GSR_PERCENT = 1.5;

export function calmScore(baseline: Averages, now: Averages): number | null {
  if (baseline.bpm === null || now.bpm === null) return null; // we need at least the heart rate

  let score = START;

  // 1) heart rate: lower than the start = calmer
  score += (baseline.bpm - now.bpm) * POINTS_PER_BPM;

  // 2) skin response: less sweat than the start = calmer (only if the GSR sensor is sending)
  if (baseline.gsr !== null && baseline.gsr > 0 && now.gsr !== null) {
    const percentLess = ((baseline.gsr - now.gsr) / baseline.gsr) * 100;
    score += percentLess * POINTS_PER_GSR_PERCENT;
  }

  // keep it between 0 and 100, as a whole number
  return Math.round(Math.min(100, Math.max(0, score)));
}

// A short sentence for the score
export function scoreLabel(score: number | null): string {
  if (score === null) return "Measuring your starting point";
  if (score >= 80) return "Deeply calm";
  if (score >= 60) return "Calmer than when you started";
  if (score >= 40) return "About the same as the start";
  return "A little tense, keep breathing";
}

// ---------- Stress spike ----------
// Sweat rises within a second or two when you're startled (a loud clap, a hard question).
// We look at the last few GSR values: if the newest is 8% higher than the oldest, that's a spike.
const SPIKE_PERCENT = 8;

export function isStressSpike(recentGsr: number[]): boolean {
  if (recentGsr.length < 4) return false; // not enough values yet
  const oldest = recentGsr[0];
  const newest = recentGsr[recentGsr.length - 1];
  if (oldest <= 0) return false;
  return ((newest - oldest) / oldest) * 100 >= SPIKE_PERCENT;
}
