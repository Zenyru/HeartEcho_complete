"use client";

import { useEffect, useRef, useState } from "react";

// A FAKE body for testing without the Arduino.
// It sends exactly the same lines the Arduino sends ("W:-35", "BEAT", "BPM:72", "GSR:430", "ROOM:27.4,68"),
// so the rest of the website can't tell the difference.
//
// Before the calming part it stays stressed. During calming it slowly relaxes.
const STRESSED = { bpm: 112, gsr: 620 }; // how the fake body starts (112 = "racing" zone, so the demo walks down through 5 zones)
const CALM = { bpm: 66, gsr: 450 }; //     where it ends up after calming
const ROOM = { temp: 27.4, humidity: 66 }; // a typical warm Sri Lankan room (it doesn't change with the person)
const RELAX_SPEED = 0.0005; //                         how quickly it moves towards CALM each step (bigger = faster)
const STEP_MS = 20; //                                  the fake body updates 50 times a second (like the Arduino's wave)

export function useDemo(onLine: (line: string) => void, calming: boolean) {
  const [running, setRunning] = useState(false);
  const timer = useRef<number | null>(null);
  const body = useRef({ ...STRESSED }); // the fake body's current values
  const clock = useRef({ beatPart: 0, sinceGsr: 0, sinceRoom: 0 }); // how far into this heartbeat (0 → 1), ms since GSR / room

  // keep the newest onLine and calming in refs, so the timer always sees them
  const onLineRef = useRef(onLine);
  const calmingRef = useRef(calming);
  useEffect(() => {
    onLineRef.current = onLine;
    calmingRef.current = calming;
  }, [onLine, calming]);

  // one small step of the fake body
  const step = () => {
    const b = body.current;
    const c = clock.current;
    const send = (line: string) => onLineRef.current(line);

    // 1) relax only while calming, otherwise stay stressed
    const target = calmingRef.current ? CALM : STRESSED;
    b.bpm += (target.bpm - b.bpm) * RELAX_SPEED;
    b.gsr += (target.gsr - b.gsr) * RELAX_SPEED;

    c.sinceGsr += STEP_MS;
    c.sinceRoom += STEP_MS;

    // 2) the pulse wave: one heartbeat = a quick tall bump, then a small second bump (like a real finger sensor)
    c.beatPart += (STEP_MS * b.bpm) / 60000; // e.g. 72 BPM → 0.024 of a beat every 20 ms
    if (c.beatPart >= 1) {
      c.beatPart -= 1; // a new heartbeat starts now
      send("BEAT");
      send("BPM:" + Math.round(b.bpm + Math.random() * 2 - 1)); // real hearts wobble ±1 BPM
    }
    const t = c.beatPart;
    const bump = Math.exp(-(((t - 0.12) / 0.07) ** 2)) + 0.35 * Math.exp(-(((t - 0.45) / 0.1) ** 2));
    send("W:" + Math.round(bump * 200 + Math.random() * 6));

    // 3) skin response twice a second, room every 2 seconds (same as the Arduino)
    if (c.sinceGsr >= 500) {
      c.sinceGsr = 0;
      send("GSR:" + Math.round(b.gsr + Math.random() * 6 - 3));
    }
    if (c.sinceRoom >= 2000) {
      c.sinceRoom = 0;
      const temp = ROOM.temp + Math.random() * 0.2 - 0.1; //                 tiny wobble, like a real sensor
      const humidity = ROOM.humidity + Math.round(Math.random() * 2 - 1);
      send("ROOM:" + temp.toFixed(1) + "," + humidity);
    }
  };

  const start = () => {
    if (timer.current) return; // already running
    body.current = { ...STRESSED }; // fresh, stressed body every time
    timer.current = window.setInterval(step, STEP_MS);
    setRunning(true);
  };

  const stop = () => {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
    setRunning(false);
    onLineRef.current("NOFINGER");
  };

  // pretend something startled the person: heart jumps, sweat jumps (like a loud clap in real life)
  const startle = () => {
    body.current.bpm += 16;
    body.current.gsr *= 1.2;
  };

  // stop the timer if the page is closed
  useEffect(() => {
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, []);

  return { running, start, stop, startle };
}
