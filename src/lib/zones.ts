// ---------- Heart-rate zones ----------
// Each range of heart rate gets its OWN breathing technique and its OWN music.
// The faster the heart, the simpler the technique (a racing heart can't do long holds).

// One breathing technique: seconds for each part of a breath (0 = skip that part)
export type BreathPattern = {
  name: string; //     e.g. "Box breathing"
  inhale: number; //   breathe in
  topUp: number; //    a second, small breath in on top of the first (used by the "physiological sigh")
  hold1: number; //    hold with full lungs
  exhale: number; //   breathe out
  hold2: number; //    hold with empty lungs
  inWord: string; //   what the guide says while breathing in
  outWord: string; //  what the guide says while breathing out
};

export type Zone = {
  id: "surging" | "racing" | "fast" | "elevated" | "settling" | "calm";
  label: string; //          shown on screen
  minBpm: number; //         this zone starts at this BPM (and goes up to the next zone)
  colour: string; //         the zone's colour on screen
  pattern: BreathPattern; // how to breathe in this zone
  mood: number; //           which music track to play (position in FILES in music.ts)
  moodName: string; //       name of that music
  tip: string; //            why this breathing helps
};

// From the FASTEST heart to the calmest. zoneForBpm() walks down this list.
// The higher the heart rate, the SHORTER and easier the breaths: a very fast heart
// can't manage long breaths, so we start small and stretch them out as it slows down.
export const ZONES: Zone[] = [
  {
    id: "surging",
    label: "Surging",
    minBpm: 120,
    colour: "#ff2d2d",
    pattern: { name: "Physiological sigh", inhale: 2, topUp: 1, hold1: 0, exhale: 6, hold2: 0, inWord: "In through the nose…", outWord: "Long sigh out…" },
    mood: 0,
    moodName: "Still",
    tip: "Two breaths in through the nose (a big one, then a small top-up), then one long sigh out. The fastest known way to calm down. If you feel unwell, stop and tell someone.",
  },
  {
    id: "racing",
    label: "Racing",
    minBpm: 108,
    colour: "#ff4060",
    pattern: { name: "Pursed-lip breathing", inhale: 2, topUp: 0, hold1: 0, exhale: 4, hold2: 0, inWord: "In through the nose…", outWord: "Blow out slowly…" },
    mood: 1,
    moodName: "Ground",
    tip: "Breathe in through your nose, then blow out gently through pursed lips, like cooling hot tea. It slows your breathing without any effort.",
  },
  {
    id: "fast",
    label: "Fast",
    minBpm: 95,
    colour: "#ff4f8a",
    pattern: { name: "Humming breath", inhale: 4, topUp: 0, hold1: 0, exhale: 6, hold2: 0, inWord: "Breathe in…", outWord: "Hum out… mmm" },
    mood: 2,
    moodName: "Anchor",
    tip: "Breathe in, then hum softly with your mouth closed as you breathe out. The hum stretches the out-breath, and the gentle buzz relaxes you.",
  },
  {
    id: "elevated",
    label: "Elevated",
    minBpm: 82,
    colour: "#ff4fd8",
    pattern: { name: "Box breathing", inhale: 4, topUp: 0, hold1: 4, exhale: 4, hold2: 4, inWord: "Breathe in…", outWord: "Breathe out…" },
    mood: 3,
    moodName: "Drift",
    tip: "Four equal sides: in, hold, out, hold. Steady and easy to follow.",
  },
  {
    id: "settling",
    label: "Settling",
    minBpm: 70,
    colour: "#9a6bff",
    pattern: { name: "Resonance breathing", inhale: 5.5, topUp: 0, hold1: 0, exhale: 5.5, hold2: 0, inWord: "Breathe in…", outWord: "Breathe out…" },
    mood: 4,
    moodName: "Flow",
    tip: "About 5–6 breaths a minute, the rhythm where your heart and breath move together.",
  },
  {
    id: "calm",
    label: "Calm",
    minBpm: 0,
    colour: "#3cd2ff",
    pattern: { name: "4-7-8 breathing", inhale: 4, topUp: 0, hold1: 7, exhale: 8, hold2: 0, inWord: "In through the nose…", outWord: "Whoosh out…" },
    mood: 5,
    moodName: "Float",
    tip: "In through the nose for 4, hold for 7, then whoosh out through the mouth for 8. A deep relaxing breath to keep the calm you've reached.",
  },
];

// The zone a BPM belongs to (first zone from the top whose minimum it reaches)
export function zoneForBpm(bpm: number): Zone {
  for (const zone of ZONES) {
    if (bpm >= zone.minBpm) return zone;
  }
  return ZONES[ZONES.length - 1];
}

// The zone we use before there's any heart rate ("settling" = a neutral middle)
export const DEFAULT_ZONE: Zone = ZONES.find((z) => z.id === "settling")!;

// The top of a zone = the minimum of the zone above it (the highest zone has no top)
function upperLimit(zone: Zone): number {
  const i = ZONES.indexOf(zone);
  return i === 0 ? Infinity : ZONES[i - 1].minBpm;
}

// ---------- ZoneTracker ----------
// Works like the BpmSmoother: we give it a BPM once a second and it gives back a STEADY zone.
// It only changes zone when the heart is:
//   1) clearly past the edge (2 BPM past it, so 81 ↔ 82 doesn't flip back and forth), AND
//   2) stays there for 5 seconds in a row.
const MARGIN = 2;
const HOLD_SECONDS = 5;

export class ZoneTracker {
  private current: Zone = DEFAULT_ZONE; // before any reading
  private candidate: Zone | null = null; // the zone we might move to
  private count = 0; //                     how many seconds in a row it has looked like that zone
  private hasReading = false; //            the first reading sets the zone straight away

  update(bpm: number | null): Zone {
    if (bpm === null) return this.current; // no heart rate → stay where we are

    // very first reading: jump straight to the right zone
    if (!this.hasReading) {
      this.hasReading = true;
      this.current = zoneForBpm(bpm);
      return this.current;
    }

    // still inside the current zone (with the 2 BPM margin)? → nothing changes
    const clearlyOutside = bpm < this.current.minBpm - MARGIN || bpm >= upperLimit(this.current) + MARGIN;
    if (!clearlyOutside) {
      this.candidate = null;
      this.count = 0;
      return this.current;
    }

    // outside → count how long it stays in the new zone
    const next = zoneForBpm(bpm);
    if (this.candidate !== null && this.candidate.id === next.id) {
      this.count++;
    } else {
      this.candidate = next;
      this.count = 1;
    }

    if (this.count >= HOLD_SECONDS) {
      this.current = next; // it stayed long enough → switch
      this.candidate = null;
      this.count = 0;
    }
    return this.current;
  }

  reset() {
    this.current = DEFAULT_ZONE;
    this.candidate = null;
    this.count = 0;
    this.hasReading = false;
  }
}
