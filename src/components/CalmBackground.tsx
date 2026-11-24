"use client"; // Runs in the browser

import type { ReactNode } from "react"; 
import Particles from "./particles"; 

const BREATHE_IN = 4; //        seconds the glow takes to grow (matches the breathing guide's "in")
const BREATHE_OUT = 6; //       seconds the glow takes to shrink (matches "out")
const GLOW_SCALE = 2.0; //      how big the glow is compared to the orb (2.6 = 2.6× the orb's size)
const GLOW_STRENGTH = 0.08; //  how strong the colour is in the centre of the glow (0 = invisible, 1 = solid)
const GRAIN_OPACITY = 0.035; //  how visible the film grain is (0 = off); keep it tiny
const COLOUR_FADE = 4; //       seconds to fade between colours when the BPM range changes
const GAP = 32; //              space (pixels) between the things stacked on the page (orb, status, button…)

// Picks the glow colour from the heart rate (same idea as the orb: pinker = faster, cyan = calm)
function glowColour(bpm: number | null): string {
  if (bpm === null) return "130, 45, 255"; // no reading yet → soft purple (neutral)
  if (bpm > 95) return "255, 60, 150"; //    elevated → pink
  if (bpm > 80) return "255, 45, 225"; //    settling → magenta
  if (bpm > 65) return "130, 45, 255"; //    calm → purple
  return "60, 210, 255"; //                  deeply calm → cyan
}

// A tiny SVG "noise" image written inline, so there's no extra file to download.
// feTurbulence = the browser generates random speckles; that's what makes the film grain.
const GRAIN_SVG =
  'url("data:image/svg+xml;utf8,' + // tell CSS this url is an SVG written right here
  "<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'>" + // a 160×160 tile (it repeats across the screen)
  "<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter>" + // the noise generator
  "<rect width='100%' height='100%' filter='url(%23n)'/>" + // fill the tile with the noise (%23 = "#", escaped for the url)
  '</svg>")'; // close the svg and the url

export default function CalmBackground({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        position: "relative", // lets the layers inside be positioned against this box
        isolation: "isolate", // starts a fresh layer stack, so z-index here can't fight with anything outside
        minHeight: "100vh", // at least the full height of the window
        overflow: "hidden", // stops the big glow from causing sideways scrolling
        background: "#000", // pure black under everything
      }}
    >
      {/* Layer 1: deep navy centre fading to black at the edges (also acts as a vignette) */}
      <div
        aria-hidden="true" // decorative only, so screen readers skip it
        style={{
          position: "fixed", // stays put while scrolling, covers the window
          inset: 0, // stretch to all four edges
          zIndex: 0, // bottom layer
          pointerEvents: "none", // clicks pass straight through
          background:
            "radial-gradient(ellipse at center, #070918 0%, #030409 55%, #000 100%)", // very dark navy → near-black → black
        }}
      />

      {/* Layer 2: very faint film grain so the dark never looks flat */}
      <div
        aria-hidden="true" // decorative only
        style={{
          position: "fixed", // covers the window
          inset: 0, // all four edges
          zIndex: 0, // still a background layer
          pointerEvents: "none", // clicks pass through
          backgroundImage: GRAIN_SVG, // the noise tile from above, repeated
          opacity: GRAIN_OPACITY, // barely visible
          mixBlendMode: "overlay", // blends into the colours underneath instead of painting grey on top
        }}
      />

      {/* Layer 2.5: tiny dust specks + a few big blurry glows drifting slowly (settings are at the top of Particles.tsx) */}
      <Particles />

      {/* Layer 3: YOUR content (orb, status line, buttons), always on top and centred */}
      <div
        style={{
          position: "relative", // needed so zIndex works
          zIndex: 1, // above the two background layers
          minHeight: "100vh", // full window height, so vertical centring works
          display: "flex", // flexbox layout...
          flexDirection: "column", // ...stacking children top to bottom
          alignItems: "center", // centre them left-to-right
          justifyContent: "center", // centre them top-to-bottom
          gap: GAP, // space between each child
          padding: 16, // a little breathing room at the edges on small screens
        }}
      >
        {
          children /* whatever you put between <CalmBackground> and </CalmBackground> appears here */
        }
      </div>
    </div>
  );
}

export function OrbGlow({
  bpm,
  size,
  followBreath = false,
  children,
}: {
  bpm: number | null;
  size: number;
  followBreath?: boolean; // true = grow and shrink with the breathing ring instead of the fixed 4 s / 6 s animation
  children: ReactNode;
}) {
  const rgb = glowColour(bpm); // current glow colour as "r, g, b"
  const total = BREATHE_IN + BREATHE_OUT; // one full breath in seconds (10 by default)
  const inPercent = (BREATHE_IN / total) * 100; // where "fully grown" is in the animation (40% by default)
  const glowSize = size * GLOW_SCALE; // glow diameter in pixels

  return (
    <div
      style={{
        position: "relative", // the glow is positioned against this box
        width: size, // exactly the orb's width...
        height: size, // ...and height, so "the centre of this box" = "the centre of the orb"
        flexShrink: 0, // never let the flex layout squash it
      }}
    >
      {/* The breathing animation: small → big over the "in" time, big → small over the "out" time */}
      <style>{`
        @keyframes calm-breathe {
          0%   { transform: translate(-50%, -50%) scale(0.92); opacity: 0.7; }  /* start: smaller and dimmer */
          ${inPercent}% { transform: translate(-50%, -50%) scale(1.04); opacity: 1; } /* end of breathing in: biggest, brightest */
          100% { transform: translate(-50%, -50%) scale(0.92); opacity: 0.7; }  /* end of breathing out: small again */
        }
        @media (prefers-reduced-motion: reduce) {
          .calm-glow { animation: none !important; } /* if the user asked for less motion, keep it still */
        }
      `}</style>

      {/* The glow itself */}
      <div
        className="calm-glow" // used by the reduced-motion rule above
        aria-hidden="true" // decorative only
        style={{
          position: "absolute", // positioned inside the box above
          top: "50%", //  put its top-left corner at the box's centre...
          left: "50%", // ...then translate(-50%, -50%) shifts it back so its centre = the orb's centre
          width: glowSize, //  glow width
          height: glowSize, // glow height (same, so it's a circle)
          zIndex: 0, // behind the orb
          pointerEvents: "none", // clicks pass through
          borderRadius: "50%", // round
          background: `radial-gradient(circle, rgba(${rgb}, ${GLOW_STRENGTH}) 0%, rgba(${rgb}, 0) 70%)`, // colour in the middle, fading out
          filter: "blur(50px)", // extra softness so there's no visible edge
          // followBreath: the BreathingRing writes how full the breath is (0 → 1) into the CSS variable --breath
          transform: followBreath
            ? "translate(-50%, -50%) scale(calc(0.92 + var(--breath, 0) * 0.14))" // bigger as you breathe in
            : "translate(-50%, -50%)", // centred even before the animation starts
          opacity: followBreath ? "calc(0.65 + var(--breath, 0) * 0.35)" : undefined, // brighter as you breathe in
          animation: followBreath ? "none" : `calm-breathe ${total}s ease-in-out infinite`, // otherwise breathe forever, smoothly
          transition: `background ${COLOUR_FADE}s ease`, // fade gently when the colour changes
        }}
      />

      {/* Your orb, on top of the glow */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          height: "100%",
        }}
      >
        {
          children /* whatever you put between <OrbGlow> and </OrbGlow> (your .orb-wrap) */
        }
      </div>
    </div>
  );
}
