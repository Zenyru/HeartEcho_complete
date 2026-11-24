"use client"; // Uses the browser

import { useEffect, useRef } from "react";  


const ASH_COUNT = 480;          // how many specks float around in total
const BIG_SHARE = 0.05;         // share of specks that are big glowing ones (0.05 = 5%)
const MEDIUM_SHARE = 0.1;       // share that are medium (the rest are tiny)
const BRIGHTNESS = 0.55;        // overall brightness (0 = invisible, 1 = full)
const RISE = 0.12;              // how fast the ash floats upwards (pixels per frame for the closest specks)
const SWAY = 0.35;              // how much each speck sways side to side while it floats (pixels per frame)
const BOKEH_COUNT = 6;          // how many big, very blurry coloured glows float in the far background
const BOKEH_MAX_SIZE = 70;      // biggest blurry glow radius in pixels
const BOKEH_BRIGHTNESS = 0.065; // how strong those blurry glows are

// Ash colours: mostly white, some icy blue and a few warm ones (like the specks in your screenshot)
const ASH_COLOURS = [
  [240, 244, 255], // white (most common)
  [240, 244, 255], // white again, so it's picked more often
  [240, 244, 255], // white
  [160, 200, 255], // icy blue
  [255, 190, 150], // warm orange
  [255, 170, 220], // soft pink
];

// Background blur colours: the orb/button palette
const BOKEH_COLOURS = [
  [255, 45, 225], // pink
  [130, 45, 255], // purple
  [60, 90, 255], //  blue
  [60, 210, 255], // cyan
];

// One speck of ash
type Ash = {
  x: number; //         horizontal position (pixels)
  y: number; //         vertical position (pixels)
  depth: number; //     0.2 (far) to 1 (close): close specks are brighter and move faster
  size: number; //      radius of the speck in pixels
  big: boolean; //      true = one of the big glowing ones (drawn with a soft halo)
  swayFreq: number; //  how quickly it sways left/right (each one different, so they don't move in sync)
  phase: number; //     where it starts in its sway / twinkle
  colour: number; //    which colour from ASH_COLOURS (by position in the list)
};

// One big blurry background glow
type Bokeh = {
  x: number; //         horizontal position (pixels)
  y: number; //         vertical position (pixels)
  r: number; //         radius in pixels
  vx: number; //        horizontal speed (pixels per frame)
  vy: number; //        vertical speed (pixels per frame)
  phase: number; //     for its slow brighten/dim
  colour: number[]; //  [red, green, blue]
};

const pick = <T,>(list: T[]): T =>
  list[Math.floor(Math.random() * list.length)]; // returns a random item from a list

// Makes a soft glowing dot image ONCE per colour; drawing a ready-made image is much faster than building a gradient every frame
function makeGlowSprite(rgb: number[]): HTMLCanvasElement {
  const s = 64; // image size in pixels
  const c = document.createElement("canvas"); // an off-screen canvas (never shown on the page)
  c.width = s; //  width
  c.height = s; // height
  const g = c.getContext("2d")!; // its paintbrush
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); // circle fading outwards
  grad.addColorStop(0, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 1)`); //      bright centre
  grad.addColorStop(0.12, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.8)`); // still bright just outside the core
  grad.addColorStop(0.3, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.18)`); // soft halo
  grad.addColorStop(1, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0)`); //      fades to nothing at the edge
  g.fillStyle = grad; // paint with the gradient
  g.fillRect(0, 0, s, s); // fill the whole little image
  return c; // hand back the finished image
}

export default function Particles() {
  const canvasRef = useRef<HTMLCanvasElement>(null); // will point at the <canvas> once React creates it

  useEffect(() => {
    const canvas = canvasRef.current; // the canvas element
    if (!canvas) return; // stop if it isn't there yet
    const ctx = canvas.getContext("2d"); // the 2D "paintbrush"
    if (!ctx) return; // stop if the browser can't give us one

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches; // user asked for less motion?
    const sprites = ASH_COLOURS.map(makeGlowSprite); // one ready-made glow image per ash colour
    const fills = ASH_COLOURS.map(c => `rgb(${c[0]}, ${c[1]}, ${c[2]})`); // the same colours as CSS strings, for plain dots

    let width = 0; //  screen width
    let height = 0; // screen height
    let ash: Ash[] = []; //     all ash specks
    let bokeh: Bokeh[] = []; // all blurry background glows
    let frameId = 0; // id of the next frame, so we can cancel it

    // Creates one speck of ash at a random spot
    const makeAsh = (): Ash => {
      const roll = Math.random(); // decides which size group it's in
      const big = roll < BIG_SHARE; // a few big glowing ones
      const medium = !big && roll < BIG_SHARE + MEDIUM_SHARE; // some medium ones
      const depth = big
        ? 0.75 + Math.random() * 0.25
        : 0.2 + Math.random() * 0.8; // big ones are always close
      return {
        x: Math.random() * width, //  anywhere across
        y: Math.random() * height, // anywhere down
        depth, // remember it
        size: big
          ? 1.6 + Math.random() * 1.6 // big: 1.6–3.2 px core (plus a glow around it)
          : medium
            ? 0.9 + Math.random() * 0.7 // medium: 0.9–1.6 px
            : 0.35 + Math.random() * 0.5, // tiny: 0.35–0.85 px (most of them)
        big, // remember if it's a big one
        swayFreq: 0.0004 + Math.random() * 0.0008, // each sways at its own pace
        phase: Math.random() * Math.PI * 2, // random starting point
        colour: Math.floor(Math.random() * ASH_COLOURS.length), // random colour
      };
    };

    // Fit the canvas to the window and create all the particles
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2); // screen sharpness (2 on retina), capped for speed
      width = window.innerWidth; //   window width
      height = window.innerHeight; // window height
      canvas.width = width * dpr; //   real pixel width (keeps tiny specks crisp)
      canvas.height = height * dpr; // real pixel height
      canvas.style.width = width + "px"; //   size on the page
      canvas.style.height = height + "px"; // size on the page
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS pixels on any screen

      ash = Array.from({ length: ASH_COUNT }, makeAsh); // make all the ash

      bokeh = Array.from({ length: BOKEH_COUNT }, () => ({
        x: Math.random() * width, //  anywhere across
        y: Math.random() * height, // anywhere down
        r: BOKEH_MAX_SIZE * (0.4 + Math.random() * 0.6), // 40–100% of the max size
        vx: (Math.random() - 0.5) * 0.08, // very slow sideways drift
        vy: (Math.random() - 0.5) * 0.08, // very slow up/down drift
        phase: Math.random() * Math.PI * 2, // random start for its slow pulse
        colour: pick(BOKEH_COLOURS), // random palette colour
      }));
    };

    // Draw one frame (about 60 times a second)
    const draw = (now: number) => {
      ctx.clearRect(0, 0, width, height); // wipe the previous frame
      ctx.globalCompositeOperation = "lighter"; // overlapping light adds up, like real light

      // --- 1. Big blurry background glows (drawn first, so the ash sits on top) ---
      for (const b of bokeh) {
        if (!reduceMotion) {
          b.x += b.vx; // drift sideways
          b.y += b.vy; // drift up/down
        }
        if (b.x < -b.r) b.x = width + b.r; //  off the left → back on the right
        if (b.x > width + b.r) b.x = -b.r; //  off the right → back on the left
        if (b.y < -b.r) b.y = height + b.r; // off the top → back at the bottom
        if (b.y > height + b.r) b.y = -b.r; // off the bottom → back at the top

        const a =
          BOKEH_BRIGHTNESS * (0.7 + 0.3 * Math.sin(now * 0.0004 + b.phase)); // slowly brighten and dim
        const [r, g, bl] = b.colour; // unpack colour
        const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r); // soft circle
        grad.addColorStop(0, `rgba(${r}, ${g}, ${bl}, ${a})`); //          centre: faint colour
        grad.addColorStop(0.6, `rgba(${r}, ${g}, ${bl}, ${a * 0.5})`); //  most of the disc: half that
        grad.addColorStop(1, `rgba(${r}, ${g}, ${bl}, 0)`); //             edge: nothing
        ctx.fillStyle = grad; // paint with the gradient
        ctx.fillRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2); // only the square around it
      }

      // --- 2. The floating ash ---
      for (const p of ash) {
        if (!reduceMotion) {
          const sway = Math.sin(now * p.swayFreq + p.phase); // -1 → 1 → -1: a slow left-right wave, different for each speck
          p.x += sway * SWAY * p.depth; //                       sway sideways, like ash caught in warm air
          p.y -= RISE * (0.4 + p.depth); //                      float upwards; close ones faster (gives depth)
        }
        // wrap around the edges, so the screen never empties out
        if (p.y < -10) {
          p.y = height + 10;
          p.x = Math.random() * width;
        } // off the top → back in at the bottom, somewhere new
        if (p.x < -10) p.x = width + 10; // off the left → back on the right
        if (p.x > width + 10) p.x = -10; // off the right → back on the left

        // Twinkle: brightness slowly breathes up and down, each at its own pace
        const twinkle =
          0.55 + 0.45 * Math.sin(now * p.swayFreq * 2.3 + p.phase * 1.7); // between 10% and 100%
        const alpha = BRIGHTNESS * (0.2 + 0.8 * p.depth * p.depth) * twinkle; // far specks dimmer

        if (p.big) {
          // Big ones: draw the ready-made soft glow image (bright core + halo)
          const d = p.size * 9; // image size on screen: the halo spreads ~4.5× the core radius each side
          ctx.globalAlpha = alpha; // its brightness
          ctx.drawImage(sprites[p.colour], p.x - d / 2, p.y - d / 2, d, d); // centred on the speck
        } else {
          // Tiny and medium ones: a crisp little dot
          ctx.globalAlpha = alpha; // its brightness
          ctx.fillStyle = fills[p.colour]; // its colour
          ctx.beginPath(); // start a new shape
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); // small circle
          ctx.fill(); // draw it
        }
      }

      ctx.globalAlpha = 1; // reset brightness
      ctx.globalCompositeOperation = "source-over"; // back to normal blending
      frameId = requestAnimationFrame(draw); // draw again next frame
    };

    resize(); // first setup
    window.addEventListener("resize", resize); // redo when the window changes size
    frameId = requestAnimationFrame(draw); // start animating

    return () => {
      cancelAnimationFrame(frameId); // stop animating when the component is removed
      window.removeEventListener("resize", resize); // stop listening for resizes
    };
  }, []); // run the setup only once

  return (
    <canvas
      ref={canvasRef} // connect the canvas to the code above
      aria-hidden="true" // decorative only
      style={{
        position: "fixed", // covers the window, doesn't scroll
        inset: 0, // all four edges
        zIndex: 0, // background layer (your content sits above it)
        pointerEvents: "none", // clicks pass straight through
      }}
    />
  );
}
