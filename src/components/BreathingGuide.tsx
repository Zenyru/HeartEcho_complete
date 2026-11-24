"use client"; // Runs in the browser (it animates with requestAnimationFrame)

import { useEffect, useRef, useState } from "react"; // useRef = box that keeps a value, useState = value that re-draws the page, useEffect = run code after showing
import type { BreathPattern } from "../lib/zones";

// ---------- Settings you can tweak ----------
const RING_SCALE = 0.5; //       ring radius compared to the orb size (0.5 = right on the orb's edge)
const RING_COLOUR = "#9fd0ff"; // colour of the filling ring
const RING_WIDTH = 3; //         thickness of the filling ring (pixels)

// The pattern used before the website tells us which one to use
const DEFAULT_PATTERN: BreathPattern = {
  name: "Slow breathing",
  inhale: 4,
  topUp: 0,
  hold1: 0,
  exhale: 6,
  hold2: 0,
  inWord: "Breathe in…",
  outWord: "Breathe out…",
};

// Both components below share ONE clock, so the ring and the words always match.
let cycleStart: number | null = null; //          when the current breath started (ms), or null if stopped
let pattern: BreathPattern = DEFAULT_PATTERN; //  the pattern we're breathing right now
let nextPattern: BreathPattern | null = null; //  a new pattern waiting for the current breath to finish

// Change the breathing pattern. If a breath is in progress we wait until it ends,
// so the ring never jumps in the middle of a breath.
function setPattern(p: BreathPattern) {
  if (p.name === pattern.name) {
    nextPattern = null; // already breathing this one
    return;
  }
  if (cycleStart === null) pattern = p; // not breathing yet → switch now
  else nextPattern = p; //                 breathing → switch after this breath
}

const cycleLength = (p: BreathPattern) => p.inhale + p.topUp + p.hold1 + p.exhale + p.hold2; // seconds in one breath

// Works out where we are in the breath at a given moment
function breathAt(now: number) {
  if (cycleStart === null) cycleStart = now;

  // a whole breath has finished → start the next one (and switch pattern if one is waiting)
  while (now - cycleStart >= cycleLength(pattern) * 1000) {
    cycleStart += cycleLength(pattern) * 1000;
    if (nextPattern) {
      pattern = nextPattern;
      nextPattern = null;
    }
  }

  const t = (now - cycleStart) / 1000; // seconds into this breath
  const ease = (x: number) => 0.5 - 0.5 * Math.cos(x * Math.PI); // slow → fast → slow, feels like real breathing
  const { inhale, topUp, hold1, exhale, inWord, outWord, name } = pattern;
  const inTop = topUp > 0 ? 0.8 : 1; // with a top-up breath, the first breath only fills the ring to 80%

  // the end time of each part of the breath
  const endIn = inhale;
  const endTopUp = endIn + topUp;
  const endHold = endTopUp + hold1;
  const endOut = endHold + exhale;

  // which part of the breath are we in? → the word, how full the ring is, and seconds left
  if (t < endIn) {
    return { name, word: inWord, fill: inTop * ease(t / inhale), secondsLeft: Math.ceil(endIn - t) };
  }
  if (t < endTopUp) {
    const part = (t - endIn) / topUp;
    return { name, word: "Top up…", fill: inTop + (1 - inTop) * ease(part), secondsLeft: Math.ceil(endTopUp - t) };
  }
  if (t < endHold) {
    return { name, word: "Hold…", fill: 1, secondsLeft: Math.ceil(endHold - t) };
  }
  if (t < endOut) {
    const part = (t - endHold) / exhale;
    return { name, word: outWord, fill: 1 - ease(part), secondsLeft: Math.ceil(endOut - t) };
  }
  // anything left is the last part: hold with empty lungs (hold2)
  return { name, word: "Hold…", fill: 0, secondsLeft: Math.ceil(cycleLength(pattern) - t) || 1 };
}

// ====================================================================================
// 1) BreathingRing: put this INSIDE <OrbGlow>, next to your orb. It draws a ring
//    around the orb that fills while breathing in and empties while breathing out.
// ====================================================================================
export function BreathingRing({ size, active, breath }: { size: number; active: boolean; breath: BreathPattern }) {
  const arcRef = useRef<SVGCircleElement>(null); // the filling part of the ring
  const dotRef = useRef<SVGCircleElement>(null); //  the glowing dot at the tip of the ring

  const radius = size * RING_SCALE; // ring radius in pixels
  const box = radius * 2 + 40; //     SVG size: the ring plus a little room for the glow
  const centre = box / 2; //          middle of the SVG
  const length = 2 * Math.PI * radius; // full distance around the ring (circumference)

  // tell the shared clock which pattern to use (it switches at the end of the current breath)
  useEffect(() => {
    setPattern(breath);
  }, [breath]);

  useEffect(() => {
    if (!active) {
      cycleStart = null; // stopped → forget the clock, so next time starts fresh at "Breathe in"
      document.documentElement.style.setProperty("--breath", "0");
      return; // nothing to animate
    }

    let frameId = 0; // id of the next frame, so we can cancel it
    const draw = (now: number) => {
      const { fill } = breathAt(now); // how full the ring should be (0 → 1)
      // We change the SVG directly instead of using React state: 60 updates a second would make React re-draw the whole page
      arcRef.current?.setAttribute("stroke-dashoffset", String(length * (1 - fill))); // show only the "filled" part of the ring
      const angle = fill * 2 * Math.PI - Math.PI / 2; // where the tip is (starts at the top, goes clockwise)
      dotRef.current?.setAttribute("cx", String(centre + Math.cos(angle) * radius)); // tip x
      dotRef.current?.setAttribute("cy", String(centre + Math.sin(angle) * radius)); // tip y
      dotRef.current?.setAttribute("opacity", String(fill > 0.01 ? 1 : 0)); // hide the dot when the ring is empty
      // share the breath with CSS, so the glow behind the orb grows and shrinks with it (see OrbGlow)
      document.documentElement.style.setProperty("--breath", fill.toFixed(3));
      frameId = requestAnimationFrame(draw); // again next frame
    };
    frameId = requestAnimationFrame(draw); // start animating
    return () => cancelAnimationFrame(frameId); // stop when switched off or removed
  }, [active, length, centre, radius]); // restart if any of these change

  return (
    <svg
      width={box} //  SVG width
      height={box} // SVG height
      aria-hidden="true" // decorative (the words below say the same thing for screen readers)
      style={{
        position: "absolute", // placed inside the orb's box...
        left: "50%", //          ...centred horizontally
        top: "50%", //           ...and vertically
        transform: "translate(-50%, -50%)", // pull it back by half its size so its centre = the orb's centre
        overflow: "visible", //  let the glow spill outside the SVG
        pointerEvents: "none", // clicks pass through
        opacity: active ? 1 : 0, // invisible when the guide is off
        transition: "opacity 0.8s ease", // fade in/out gently
      }}
    >
      {/* The faint full circle (the "track" the ring fills along) */}
      <circle cx={centre} cy={centre} r={radius} fill="none" stroke="rgba(160, 200, 255, 0.12)" strokeWidth={2} />

      {/* The filling part */}
      <circle
        ref={arcRef} // the animation loop changes how much of it shows
        cx={centre} // centre x
        cy={centre} // centre y
        r={radius} // ring radius
        fill="none" // just the outline
        stroke={RING_COLOUR} // colour
        strokeWidth={RING_WIDTH} // thickness
        strokeLinecap="round" // rounded ends
        strokeDasharray={length} // one "dash" as long as the whole ring...
        strokeDashoffset={length} // ...shifted fully out of view to start (empty ring)
        transform={`rotate(-90 ${centre} ${centre})`} // start at the top instead of the right
        style={{ filter: `drop-shadow(0 0 6px ${RING_COLOUR})` }} // soft glow
      />

      {/* Glowing dot at the tip */}
      <circle
        ref={dotRef} // the animation loop moves it
        cx={centre} // start position (updated every frame)
        cy={centre - radius} // top of the ring
        r={RING_WIDTH + 1.5} // a bit fatter than the ring
        fill="#e6f4ff" // almost white
        opacity={0} // hidden until the ring starts filling
        style={{ filter: `drop-shadow(0 0 8px ${RING_COLOUR})` }} // glow
      />
    </svg>
  );
}

// ====================================================================================
// 2) BreathingText: put this UNDER the orb. Shows "Breathe in… / Hold… / Breathe out…"
//    and a countdown.
// ====================================================================================
export function BreathingText({ active, orbSize }: { active: boolean; orbSize: number }) {
  const [word, setWord] = useState("Breathe in…"); //  which word to show
  const [secondsLeft, setSecondsLeft] = useState(0); // the countdown number
  const [technique, setTechnique] = useState(""); //   name of the technique we're doing
  const [isNew, setIsNew] = useState(false); //         true for a few seconds after the technique changes

  useEffect(() => {
    if (!active) return; // nothing to do when off

    let lastName = ""; // the technique on the previous check
    let newTimer = 0;
    // Check 10 times a second; React only re-draws when the word or number actually changes
    const id = window.setInterval(() => {
      const b = breathAt(performance.now()); // where we are in the breath
      setWord(b.word); //                  update the word (no re-draw if it's the same)
      setSecondsLeft(b.secondsLeft); //    update the number (no re-draw if it's the same)
      setTechnique(b.name);
      // the technique just changed (not the very first one) → show "New technique" for 5 seconds
      if (lastName !== "" && b.name !== lastName) {
        setIsNew(true);
        window.clearTimeout(newTimer);
        newTimer = window.setTimeout(() => setIsNew(false), 5000);
      }
      lastName = b.name;
    }, 100);
    return () => {
      window.clearInterval(id); // stop checking when switched off or removed
      window.clearTimeout(newTimer);
    };
  }, [active]); // restart when switched on/off

  return (
    <div
      aria-live="polite" // screen readers announce the change between "in" and "out"
      style={{
        textAlign: "center", // centred
        minHeight: 84, //      keeps its space even when hidden, so the page doesn't jump
        marginTop: orbSize * (RING_SCALE - 0.5), // push down by how far the ring sticks out past the orb, so they never touch
        opacity: active ? 1 : 0, // invisible when the guide is off
        transition: "opacity 0.8s ease", // fade in/out gently
      }}
    >
      <div style={{ fontSize: 28, fontWeight: 300, letterSpacing: 1, color: "#fff" }}>{word}</div>
      <div style={{ fontSize: 19, letterSpacing: 2, color: "rgba(255, 255, 255, 0.5)", marginTop: 4 }}>
        {secondsLeft || "" /* seconds left in this part */}
      </div>
      {/* the technique's name; it glows for a few seconds when it has just changed */}
      <div className={"technique-name" + (isNew ? " technique-new" : "")}>
        {isNew ? "New technique · " : ""}
        {technique}
      </div>
    </div>
  );
}
