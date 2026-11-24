// Keeps the last few BPM values and gives back their average, so the number on screen is steady.
// It also throws away values that are impossible or that jump too far (a finger twitch).
export class BpmSmoother {
  private history: number[] = [];
  private rejectedCount = 0; // how many jumps in a row we've thrown away

  constructor(private windowSize: number) {}

  addValue(bpm: number): number | null {
    // Rejecting values that are too low or too high to avoid unrealistic BPM values
    if (bpm < 40 || bpm > 200) {
      return null;
    }

    const currentAverage = this.average(); // average BEFORE adding the new value

    // rejecting values that are too far from the average to avoid sudden jumps in the BPM value
    if (currentAverage !== null && Math.abs(currentAverage - bpm) > 15) {
      this.rejectedCount++; // one more jump in a row
      if (this.rejectedCount < 3) {
        return null; // probably noise → ignore it (it is NOT added to the history)
      }
      // 3 jumps in a row = the heart really changed → start fresh from the new level
      this.reset();
    }

    this.rejectedCount = 0; // a good value breaks the "in a row" chain
    this.history.push(bpm); // Add the new value to the history
    if (this.history.length > this.windowSize) {
      this.history.shift(); //remove the oldest value from the history
    }
    return Math.round(this.average() ?? bpm); // Return the average, rounded to the nearest integer
  }

  average(): number | null {
    if (this.history.length === 0) return null; // If there are no values in the history, return null
    const sum = this.history.reduce((acc, val) => acc + val, 0); // Calculate the sum of the values in the history
    return sum / this.history.length; // Return the average of the values in the history
  }

  reset() {
    this.history = []; // Clear the history of values
    this.rejectedCount = 0;
  }
}
