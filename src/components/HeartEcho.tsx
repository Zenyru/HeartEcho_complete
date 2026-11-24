"use client";
import React, { useEffect, useRef, useState } from "react";

// ---- our own code ----
import { parseArduinoMessage } from "../lib/parse"; //                 "BPM:72" → { type: "bpm", bpm: 72 }
import { BpmSmoother } from "../lib/smoother"; //                       steady BPM
import { calmScore, isStressSpike } from "../lib/calmScore"; //        Calm Score + stress spike check
import { averagesOf } from "../lib/stats"; //                           averages of readings
import { roomComfort } from "../lib/room"; //                          is the room good for relaxing?
import { startMusic, stopMusic, setMood, preloadMusic, unlockSound } from "../lib/music"; // calming music (6 tracks)
import { ZoneTracker, DEFAULT_ZONE, type Zone } from "../lib/zones"; //       heart-rate zones → breathing + music
import { useSerial } from "../hooks/useSerial"; //                      real Arduino over USB
import { useDemo } from "../hooks/useDemo"; //                          fake body for testing
import type { Averages, Phase, Reading, ReportData, signalMessage, Source } from "../types/message";

// ---- what you see ----
import CalmBackground, { OrbGlow } from "./CalmBackground"; // dark background, particles, glow
import { HeartSphere } from "./HeartSphere"; //                  the 3D orb
import { BreathingRing, BreathingText } from "./BreathingGuide"; // ring + "Breathe in…"
import StatusLine from "./statusLine"; //                        signal status under the orb
import TopBar from "./TopBar"; //                                logo, connection, music
import SensorCard from "./SensorCard"; //                        one card per sensor
import SessionCard from "./SessionCard"; //                      right side: steps / Calm Score / time left
import PulseWave from "./PulseWave"; //                          the live pulse wave
import StressAlert from "./StressAlert"; //                      pop-up on a stress spike
import SessionReport from "./SessionReport"; //                  results screen

// ---------- Settings ----------
const BASELINE_SECONDS = 20; // how long we measure the starting point
const SESSION_SECONDS = 180; // how long the breathing part lasts (3 minutes)
const EXTRA_SECONDS = 30; //    stressed near the end? → this much extra breathing time…
const MAX_EXTRA_SECONDS = 90; // …but never more than this in total
const LIVE_SECONDS = 60; //     how much history the mini charts show

export default function HeartEcho() {
  // ===== live sensor values (what's on screen) =====
  const [bpm, setBpm] = useState<number | null>(null);
  const [gsr, setGsr] = useState<number | null>(null);
  const [roomTemp, setRoomTemp] = useState<number | null>(null); // room temperature (DHT22)
  const [humidity, setHumidity] = useState<number | null>(null); // room humidity (DHT22)
  const [beatCount, setBeatCount] = useState(0); // goes up by 1 every heartbeat → the orb pulses
  const [status, setStatus] = useState<signalMessage>("waiting");

  // ===== the session =====
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0); //                       seconds into the current phase
  const [baseline, setBaseline] = useState<Averages | null>(null); //  how you were at the start
  const [score, setScore] = useState<number | null>(null); //          Calm Score right now
  const [live, setLive] = useState<Reading[]>([]); //                  last minute, for the mini charts
  const [report, setReport] = useState<ReportData | null>(null); //    results at the end
  const [sessionSeconds, setSessionSeconds] = useState(SESSION_SECONDS); // grows if you get stressed near the end

  // ===== extras =====
  const [musicOn, setMusicOn] = useState(true);
  const [showAlert, setShowAlert] = useState(false); // stress pop-up
  const [soundBlocked, setSoundBlocked] = useState(false); // true = the browser didn't allow sound yet
  const [orbSize, setOrbSize] = useState(340);
  const [zone, setZone] = useState<Zone>(DEFAULT_ZONE); // heart-rate zone → which breathing pattern + which music

  // ===== refs: values that change often but shouldn't re-draw the page =====
  const smoother = useRef(new BpmSmoother(5)); //       average of the last 5 BPM values
  // newest value of every sensor, for the 1-second clock
  const latest = useRef({
    bpm: null as number | null,
    gsr: null as number | null,
    roomTemp: null as number | null,
    humidity: null as number | null,
  });
  const session = useRef<Reading[]>([]); //             every second of the current session
  const phaseStart = useRef(0); //                      when the current phase started (set by startSession)
  const recentGsr = useRef<number[]>([]); //            last few GSR values, to spot a stress spike
  const lastAlert = useRef(0); //                       when we last showed the stress pop-up
  const stressTimes = useRef<number[]>([]); //          seconds into the session when stress showed up (⚡ on the report chart)
  const zoneTracker = useRef(new ZoneTracker()); //     picks a STEADY zone from the BPM (like the smoother)
  const wave = useRef<number[]>([]); //                 the live pulse wave (newest points), drawn by PulseWave
  const lastLine = useRef(0); //                        when the last line arrived (to notice if the Arduino goes quiet)

  // remember WHEN stress showed up during a session (at most one mark every 10 s)
  const markStress = () => {
    if (phase !== "baseline" && phase !== "calming") return; // only during a session
    const second = session.current.length;
    const lastMark = stressTimes.current[stressTimes.current.length - 1];
    if (lastMark === undefined || second - lastMark >= 10) stressTimes.current.push(second);
  };

  /********************************************************************************** */
  // 1) EVERY line from the Arduino (or the demo) comes here
  const handleMessage = (line: string) => {
    if (line.trim() === "") return; // empty line → ignore
    if (Date.now() - lastLine.current > 3000) setStatus("waiting"); // data is back after a quiet spell
    lastLine.current = Date.now();
    const message = parseArduinoMessage(line);

    // the wave comes 50 times a second: just store it (no React re-draw), PulseWave draws it
    if (message?.type === "wave") {
      wave.current.push(message.value);
      if (wave.current.length > 400) wave.current.shift(); // keep only the newest 400 (8 s)
      return;
    }

    if (message === null) return; // a line we don't understand (e.g. "READY") → ignore it

    if (message.type === "beat") {
      setBeatCount((count) => count + 1); // makes the orb pulse
    }

    if (message.type === "noFinger") {
      smoother.current.reset(); // forget the old BPM values
      setBpm(null);
      latest.current.bpm = null;
      setStatus("noFinger");
    }

    if (message.type === "bpm") {
      const smoothedBpm = smoother.current.addValue(message.bpm); // null = rejected (noise)
      if (smoothedBpm === null) {
        setStatus("unsteady"); // keep showing the last good number
      } else {
        setStatus("good");
        setBpm(smoothedBpm);
        latest.current.bpm = smoothedBpm;
      }
    }

    if (message.type === "gsr") {
      setGsr(message.value);
      latest.current.gsr = message.value;

      // keep the last 6 values (3 seconds) and check for a sudden jump
      recentGsr.current = [...recentGsr.current, message.value].slice(-6);
      const tenSecondsPassed = Date.now() - lastAlert.current > 10000; // don't show it again and again
      if (isStressSpike(recentGsr.current) && tenSecondsPassed) {
        lastAlert.current = Date.now();
        markStress();
        setShowAlert(true);
        window.setTimeout(() => setShowAlert(false), 5000); // hide after 5 s
      }
    }

    if (message.type === "room") {
      setRoomTemp(message.temp);
      setHumidity(message.humidity);
      latest.current.roomTemp = message.temp;
      latest.current.humidity = message.humidity;
    }
  };

  // 2) where the lines come from: the real Arduino, or the demo
  const serial = useSerial(handleMessage);
  const demo = useDemo(handleMessage, phase === "calming"); // the fake body relaxes only while calming
  const source: Source = serial.connected ? "arduino" : demo.running ? "demo" : "none";

  // Buttons that should start the music switch the sound on FIRST, inside the click
  // (browsers only allow sound that starts from a click)
  const tryDemo = () => {
    unlockSound();
    demo.start();
  };
  const connectSensor = () => {
    unlockSound();
    lastLine.current = Date.now(); // give the Arduino a moment to start up before we say "no data"
    serial.connect();
  };

  // starts the music and remembers whether the browser blocked the sound
  const playMusic = () => {
    startMusic(zone.mood).then((ok) => setSoundBlocked(!ok)); // ok = false → show "Click for sound"
  };

  /********************************************************************************** */
  // 3) THE SESSION: Measure (20 s) → Breathe (3 min, longer if stressed near the end) → Results

  const startSession = () => {
    unlockSound(); // this click lets the browser play sound later, when the breathing starts
    session.current = [];
    stressTimes.current = [];
    phaseStart.current = Date.now();
    setElapsed(0);
    setBaseline(null);
    setScore(null);
    setSessionSeconds(SESSION_SECONDS);
    setReport(null);
    setPhase("baseline");
  };

  const beginBreathing = () => {
    const start = averagesOf(session.current); // the average of the 20 s = your starting point
    setBaseline(start);
    phaseStart.current = Date.now();
    setElapsed(0);
    setPhase("calming"); // → the music starts (see 5 below)
  };

  const finishSession = () => {
    const readings = [...session.current];
    const breathingStart = Math.min(BASELINE_SECONDS, readings.length);
    const before = baseline ?? averagesOf(readings); //          finished early → use what we have
    const after = averagesOf(readings.slice(-20)); //            the last 20 seconds
    setReport({
      before,
      after,
      readings,
      finalScore: calmScore(before, after),
      calmingSeconds: readings.length - breathingStart, // one reading per second
      breathingStart,
      stressTimes: [...stressTimes.current],
    });
    setPhase("report");
  };

  const closeReport = () => {
    setReport(null);
    setPhase("idle");
  };

  // 4) THE CLOCK: once a second, save a snapshot, update the score, and move to the next phase
  useEffect(() => {
    if (source === "none") return; // nothing connected → nothing to record

    const id = window.setInterval(() => {
      // nothing from the Arduino for 3 seconds → say so (cable loose, wrong sketch, Serial Monitor open...)
      if (source === "arduino" && Date.now() - lastLine.current > 3000) setStatus("noData");

      const now = { ...latest.current }; // newest bpm, gsr, roomTemp, humidity
      const seconds = Math.floor((Date.now() - phaseStart.current) / 1000);
      setElapsed(seconds);

      // zone: once a second, ask the tracker which zone we're in (it only changes after 5 steady seconds)
      setZone(zoneTracker.current.update(now.bpm));

      // a) the last minute for the mini charts (always, even outside a session)
      setLive((prev) => [...prev, { time: 0, ...now, score: null }].slice(-LIVE_SECONDS));

      // b) during a session: save this second
      if (phase === "baseline" || phase === "calming") {
        session.current.push({ time: session.current.length, ...now, score: null });
        if (phase === "calming" && baseline) {
          const recent = averagesOf(session.current.slice(-5)); // last 5 s, so the score doesn't jitter
          const newScore = calmScore(baseline, recent);
          session.current[session.current.length - 1].score = newScore;
          setScore(newScore);

          // heart jumped 10+ BPM above its lowest point of the last 10 s → that's a stress reaction
          const last10 = session.current.slice(-10).map((r) => r.bpm).filter((b) => b !== null) as number[];
          if (now.bpm !== null && last10.length > 0 && now.bpm - Math.min(...last10) >= 10) markStress();
        }
      }

      // c) time's up → next phase
      if (phase === "baseline" && seconds >= BASELINE_SECONDS) beginBreathing();
      if (phase === "calming" && seconds >= sessionSeconds) {
        // Stressed near the end? Don't end on a stressed moment: breathe a bit longer first.
        const last = session.current.slice(-30).map((r) => r.bpm).filter((b) => b !== null) as number[];
        const heartStillUp = last.length > 0 && last[last.length - 1] - Math.min(...last) >= 10; // still 10+ BPM up
        const lastStress = stressTimes.current[stressTimes.current.length - 1] ?? -999;
        const stressedLately = session.current.length - lastStress <= 30; //                     stress in the last 30 s
        const canExtend = sessionSeconds < SESSION_SECONDS + MAX_EXTRA_SECONDS;
        if ((heartStillUp || stressedLately) && canExtend) setSessionSeconds(sessionSeconds + EXTRA_SECONDS);
        else finishSession();
      }
    }, 1000);

    return () => window.clearInterval(id); // restart the clock when the phase changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, phase, baseline, sessionSeconds]);

  // 5) MUSIC: plays only during the breathing part of a session.
  //    Each heart-rate zone has its own track; changing zone crossfades smoothly.
  const connected = source !== "none";
  const musicPlaying = phase === "calming" && connected && musicOn;

  useEffect(() => {
    if (musicPlaying) playMusic();
    else stopMusic(); // fades out (results screen, Finish, Disconnect, or music switched off)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [musicPlaying]);

  useEffect(() => {
    if (musicPlaying) setMood(zone.mood); // new zone → crossfade to its track
  }, [zone, musicPlaying]);

  const toggleMusic = () => {
    unlockSound(); // this is a click, so the browser allows sound now
    if (soundBlocked && musicPlaying) playMusic(); // sound was blocked → this click just switches it on
    else setMusicOn(!musicOn);
  };

  // load the music engine as soon as the page opens, so it's ready for the first click
  useEffect(() => {
    preloadMusic();
  }, []);

  // 6) smaller orb on phones (checked when the page opens and whenever the window is resized)
  useEffect(() => {
    const fit = () => setOrbSize(window.innerWidth < 640 ? 260 : 340);
    const frame = requestAnimationFrame(fit);
    window.addEventListener("resize", fit);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", fit);
    };
  }, []);

  /********************************************************************************** */
  // 7) what each sensor card shows: the change since the start of the session
  const change = (now: number | null, start: number | null | undefined, unit: string, decimals: number, percent = false) => {
    if (now === null || start === null || start === undefined) return null;
    let diff = now - start;
    if (percent) diff = (diff / start) * 100;
    const arrow = diff > 0 ? "▲" : diff < 0 ? "▼" : "•";
    return `${arrow} ${Math.abs(diff).toFixed(decimals)}${unit} since start`;
  };

  const breathing = phase === "calming";
  const inSession = phase === "baseline" || phase === "calming";
  const comfort = roomComfort(roomTemp, humidity); // e.g. { label: "Warm & humid", tip: "...", good: false }

  return (
    <CalmBackground>
      <TopBar source={source} musicOn={musicOn} soundBlocked={soundBlocked && musicPlaying} onToggleMusic={toggleMusic} />

      <main className="dashboard">
        {/* LEFT: the three sensors (2 on the body + 1 for the room) */}
        <section className="side-col order-2 lg:order-1">
          <SensorCard
            icon="♥"
            title="Heart rate"
            value={bpm !== null ? String(bpm) : "--"}
            unit="BPM"
            change={change(bpm, baseline?.bpm, "", 0)}
            good={baseline?.bpm != null && bpm !== null ? bpm <= baseline.bpm : null}
            colour="#ff4f9a"
            history={live.map((r) => r.bpm)}
            chart={<PulseWave wave={wave} colour="#ff4f9a" />}
            hint="Pulse sensor · fingertip"
          />
          <SensorCard
            icon="≈"
            title="Skin response"
            value={gsr !== null ? String(gsr) : "--"}
            unit="GSR"
            change={change(gsr, baseline?.gsr, "%", 0, true)}
            good={baseline?.gsr != null && gsr !== null ? gsr <= baseline.gsr : null}
            colour="#b98cff"
            history={live.map((r) => r.gsr)}
            hint="Sweat level · rises with stress"
          />
          <SensorCard
            icon="⌂"
            title="Room"
            value={roomTemp !== null ? roomTemp.toFixed(1) : "--"}
            unit="°C"
            change={humidity !== null ? `${humidity.toFixed(0)}% humidity · ${comfort.label}` : null}
            good={comfort.good}
            colour="#4fd6ff"
            history={live.map((r) => r.roomTemp)}
            minRange={2} // the room hardly changes, so show at least a 2 °C window
            hint="DHT22 · is the room good for relaxing?"
          />
        </section>

        {/* MIDDLE: the orb */}
        <section className="center-col order-1 lg:order-2">
          <OrbGlow bpm={bpm} size={orbSize} followBreath={breathing}>
            <BreathingRing size={orbSize} active={breathing} breath={zone.pattern} />
            <div className="orb-wrap" style={{ position: "relative", width: orbSize, height: orbSize }}>
              <HeartSphere bpm={bpm} beatCount={beatCount} size={orbSize} />
              <div className="orb-number">
                <span className="bpm-number" style={{ fontSize: orbSize * 0.16 }}>
                  {bpm ?? "--"}
                </span>
                <span>BPM</span>
              </div>
            </div>
          </OrbGlow>

          <BreathingText active={breathing} orbSize={orbSize} />
          <StatusLine status={status} />

          {/* the buttons change with what's happening */}
          <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
            {source === "none" && (
              <>
                <button className="glow-button" onClick={connectSensor}>
                  Connect sensor
                </button>
                <button className="ghost-button" onClick={tryDemo}>
                  Try demo
                </button>
              </>
            )}

            {source !== "none" && phase === "idle" && (
              <>
                <button className="glow-button" onClick={startSession}>
                  Start session
                </button>
                <button className="ghost-button" onClick={source === "demo" ? demo.stop : serial.disconnect}>
                  {source === "demo" ? "Stop demo" : "Disconnect"}
                </button>
              </>
            )}

            {inSession && (
              <button className="ghost-button" onClick={finishSession}>
                Finish session
              </button>
            )}
          </div>

          {source === "none" && (
            <p className="max-w-xs text-center text-xs leading-relaxed text-white/40">
              Put a finger on the pulse sensor and wear the skin straps on the other hand, then connect.
            </p>
          )}
        </section>

        {/* RIGHT: one simple card */}
        <section className="side-col order-3">
          <SessionCard
            phase={phase}
            elapsed={elapsed}
            baselineSeconds={BASELINE_SECONDS}
            sessionSeconds={sessionSeconds}
            extraTime={sessionSeconds > SESSION_SECONDS}
            score={score}
            baseline={baseline}
            bpm={bpm}
            gsr={gsr}
          />
          {source === "demo" && (
            <button className="ghost-button w-full" onClick={demo.startle}>
              ⚡ Demo: simulate a sudden fright
            </button>
          )}
        </section>
      </main>

      <StressAlert show={showAlert} />

      {report && <SessionReport report={report} onClose={closeReport} onRestart={startSession} />}
    </CalmBackground>
  );
}
