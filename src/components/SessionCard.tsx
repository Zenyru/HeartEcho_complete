import type { Averages, Phase } from "../types/message";
import { scoreLabel } from "../lib/calmScore";
import { formatTime } from "../lib/stats";

// The one card on the right. It shows only what matters right now:
//   before the session → the 3 steps
//   measuring          → a countdown
//   breathing          → the Calm Score, WHY it moved, and the time left
export default function SessionCard({
  phase,
  elapsed,
  baselineSeconds,
  sessionSeconds,
  score,
  baseline,
  bpm,
  gsr,
  extraTime,
}: {
  phase: Phase;
  elapsed: number; //           seconds since this step started
  baselineSeconds: number;
  sessionSeconds: number;
  score: number | null; //      Calm Score right now
  baseline: Averages | null; // how you were at the start
  bpm: number | null; //        heart rate now
  gsr: number | null; //        skin response now
  extraTime: boolean; //        true = we added time because you got stressed near the end
}) {
  // ---- before the session: how it works ----
  if (phase === "idle" || phase === "report") {
    return (
      <div className="glass-card">
        <div className="card-label">How it works</div>
        <ol className="mt-3 space-y-2.5 text-sm text-white/80">
          <li className="flex items-start"><b className="step-num">1</b> Sit still for 20 s so we can measure you</li>
          <li className="flex items-start"><b className="step-num">2</b> Follow the breathing ring for 3 min</li>
          <li className="flex items-start"><b className="step-num">3</b> See how much calmer you got</li>
        </ol>
      </div>
    );
  }

  // ---- step 1: measuring ----
  if (phase === "baseline") {
    return (
      <div className="glass-card">
        <div className="card-label">Step 1 of 2 · Measuring you</div>
        <div className="mt-3 text-[44px] font-extralight leading-none tabular-nums text-white">
          {Math.max(0, baselineSeconds - elapsed)}s
        </div>
        <div className="mt-2 text-sm text-white/60">Sit still and breathe normally</div>
        <ProgressBar value={elapsed / baselineSeconds} />
      </div>
    );
  }

  // ---- step 2: breathing → Calm Score + why ----
  const heartChange = baseline?.bpm != null && bpm !== null ? Math.round(baseline.bpm - bpm) : null; //  + = slower
  const skinChange =
    baseline?.gsr && gsr !== null ? Math.round(((baseline.gsr - gsr) / baseline.gsr) * 100) : null; //  + = less sweat

  return (
    <div className="glass-card">
      <div className="card-label">Calm score</div>

      {/* the big number + a short sentence */}
      <div className="mt-2 flex items-baseline gap-2">
        <span className="score-number">{score ?? "--"}</span>
        <span className="text-xs text-white/40">/ 100</span>
      </div>
      <div className="text-sm text-white/70">{scoreLabel(score)}</div>

      {/* the score on a line: the mark in the middle is where you started (50) */}
      <div className="score-track">
        <div className="score-start" title="Where you started" />
        <div className="score-dot" style={{ left: `${score ?? 50}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-white/35">
        <span>Tense</span>
        <span>Start</span>
        <span>Calm</span>
      </div>

      {/* WHY the score moved: the two body sensors */}
      <div className="mt-4 space-y-1.5 text-sm">
        <Reason icon="♥" label="Heart" change={heartChange} better="BPM slower" worse="BPM faster" />
        <Reason icon="≈" label="Sweat" change={skinChange} better="% less" worse="% more" />
      </div>

      {/* added time after a stress reaction near the end */}
      {extraTime && (
        <div className="mt-4 rounded-xl bg-amber-300/10 px-3 py-2 text-xs text-amber-200">
          Your body reacted to something, so we added a little extra time to calm down again.
        </div>
      )}

      {/* time left */}
      <div className="mt-4 flex justify-between text-xs text-white/50">
        <span>Step 2 of 2 · Breathing</span>
        <span className="tabular-nums">{formatTime(Math.max(0, sessionSeconds - elapsed))} left</span>
      </div>
      <ProgressBar value={elapsed / sessionSeconds} />
    </div>
  );
}

// One line like "♥ Heart   6 BPM slower" (green when it's calmer, amber when it's not)
function Reason({ icon, label, change, better, worse }: { icon: string; label: string; change: number | null; better: string; worse: string }) {
  let text = "measuring…";
  let colour = "rgba(255,255,255,0.4)";
  if (change !== null) {
    if (change === 0) text = "same as the start";
    else text = Math.abs(change) + " " + (change > 0 ? better : worse);
    colour = change > 0 ? "#5ef0b4" : change < 0 ? "#ffc36b" : "rgba(255,255,255,0.6)";
  }
  return (
    <div className="flex justify-between">
      <span className="text-white/60">
        {icon} {label}
      </span>
      <span style={{ color: colour }}>{text}</span>
    </div>
  );
}

// A thin bar that fills from 0 to 1
function ProgressBar({ value }: { value: number }) {
  return (
    <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
      <div className="progress-fill" style={{ width: `${Math.min(100, value * 100)}%` }} />
    </div>
  );
}
