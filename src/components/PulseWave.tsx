"use client";
import { useEffect, useRef } from "react";

const POINTS = 200; // how many points are on screen: 200 × 20 ms = the last 4 seconds

// The live pulse wave, like a hospital monitor.
// `wave` is a list that HeartEcho.tsx keeps filling with new points (50 a second).
// We redraw 60 times a second straight onto a <canvas> (no React re-draws, so it stays smooth).
export default function PulseWave({ wave, colour }: { wave: React.RefObject<number[]>; colour: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let frame = 0;

    const draw = () => {
      const canvas = canvasRef.current!;
      const g = canvas.getContext("2d")!;
      const w = canvas.clientWidth * 2; //  ×2 = sharp on high-res screens
      const h = canvas.clientHeight * 2;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      g.clearRect(0, 0, w, h); // wipe the last frame
      const points = wave.current.slice(-POINTS);

      if (points.length > 1) {
        // scale the wave to fill the box, whatever size the signal is
        const min = Math.min(...points);
        const max = Math.max(...points);
        const range = Math.max(max - min, 10); // (a flat line stays flat instead of turning into big noise)

        g.beginPath();
        points.forEach((value, i) => {
          const x = w - (points.length - 1 - i) * (w / (POINTS - 1)); // newest point on the right edge
          const y = h - 6 - ((value - min) / range) * (h - 12);
          if (i === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        });
        g.strokeStyle = colour;
        g.lineWidth = 3;
        g.lineJoin = "round";
        g.shadowColor = colour; // soft glow
        g.shadowBlur = 12;
        g.stroke();
      }
      frame = requestAnimationFrame(draw); // again on the next screen refresh
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame); // stop when the card is removed
  }, [wave, colour]);

  return <canvas ref={canvasRef} className="block h-12 w-full" />;
}
