import type { ReportData } from "../types/message";
import { averagesOf, formatTime } from "../lib/stats";
import { scoreLabel } from "../lib/calmScore";
import { roomComfort } from "../lib/room";

// The results screen at the end of a session: before vs after, a chart, and the final score
export default function SessionReport({
  report,
  onClose,
  onRestart,
}: {
  report: ReportData;
  onClose: () => void;
  onRestart: () => void;
}) {
  const { before, after } = report;

  // one card per body sensor. For both, going DOWN means calmer.
  const rows = [
    { name: "Heart rate", unit: "BPM", before: before.bpm, after: after.bpm, colour: "#ff4f9a" },
    { name: "Skin response", unit: "", before: before.gsr, after: after.gsr, colour: "#b98cff" },
  ];

  // the room: average over the whole session (it's about the room, so no before → after)
  const whole = averagesOf(report.readings); // averages over every second of the session
  const comfort = roomComfort(whole.roomTemp, whole.humidity);

  // the headline sentence
  let headline = "Session complete";
  if (before.bpm !== null && after.bpm !== null) {
    const drop = Math.round(before.bpm - after.bpm);
    if (drop > 0) headline = `Your heart slowed by ${drop} BPM`;
    else if (drop === 0) headline = "Your heart stayed steady";
  }

  return (
    <div className="report-backdrop">
      <div className="report-panel">
        <div className="text-[11px] uppercase tracking-[0.25em] text-white/45">
          Your results · {formatTime(report.calmingSeconds)} of breathing
        </div>
        <h2 className="mt-2 text-3xl font-extralight text-white sm:text-4xl">{headline}</h2>
        <p className="mt-1 text-sm text-white/55">
          Calm score <b className="font-normal text-white">{report.finalScore ?? "--"}</b> · {scoreLabel(report.finalScore)}
        </p>

        {/* before → after for each sensor */}
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {rows.map((row) => {
            const hasBoth = row.before !== null && row.after !== null;
            const diff = hasBoth ? row.after! - row.before! : 0;
            const calmer = diff < 0; // lower than at the start = calmer
            return (
              <div key={row.name} className="report-stat" style={{ ["--accent" as string]: row.colour }}>
                <div className="text-[11px] uppercase tracking-[0.18em] text-white/50">{row.name}</div>
                <div className="mt-2 flex items-baseline gap-2 tabular-nums">
                  <span className="text-lg text-white/45">{row.before?.toFixed(0) ?? "--"}</span>
                  <span className="text-white/30">→</span>
                  <span className="text-3xl font-extralight text-white">{row.after?.toFixed(0) ?? "--"}</span>
                  <span className="text-xs text-white/40">{row.unit}</span>
                </div>
                {hasBoth && (
                  <div className="mt-1 text-xs" style={{ color: calmer ? "#5ef0b4" : "#ffc36b" }}>
                    {diff > 0 ? "▲" : "▼"} {Math.abs(diff).toFixed(0)} {calmer ? "· calmer" : ""}
                  </div>
                )}
              </div>
            );
          })}

          {/* the room card */}
          <div className="report-stat" style={{ ["--accent" as string]: "#4fd6ff" }}>
            <div className="text-[11px] uppercase tracking-[0.18em] text-white/50">Your room</div>
            <div className="mt-2 flex items-baseline gap-2 tabular-nums">
              <span className="text-3xl font-extralight text-white">{whole.roomTemp?.toFixed(1) ?? "--"}</span>
              <span className="text-xs text-white/40">°C</span>
              <span className="text-lg text-white/60">{whole.humidity?.toFixed(0) ?? "--"}%</span>
            </div>
            <div className="mt-1 text-xs" style={{ color: comfort.good ? "#5ef0b4" : "#ffc36b" }}>
              {comfort.label}
            </div>
          </div>
        </div>

        {/* a tip about the room, only when it could be better */}
        {comfort.good === false && <p className="mt-3 text-xs text-white/55">💡 {comfort.tip}</p>}

        {/* heart rate over the whole session */}
        <HeartChart report={report} />

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button className="glow-button" onClick={onRestart}>
            New session
          </button>
          <button className="ghost-button" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="mt-4 text-center text-[11px] text-white/30">HeartEcho is a student project, not a medical device.</p>
      </div>
    </div>
  );
}

// A simple line chart of the heart rate, with a dashed line where the breathing started
function HeartChart({ report }: { report: ReportData }) {
  const baselineSeconds = report.breathingStart; // where the dashed line goes
  const W = 600; // chart size (stretches to fit)
  const H = 150;
  const points = report.readings.filter((r) => r.bpm !== null);
  if (points.length < 2) return null; // nothing to draw

  const bpms = points.map((r) => r.bpm!);
  const min = Math.min(...bpms) - 3; // a little room above and below
  const max = Math.max(...bpms) + 3;
  const lastTime = report.readings[report.readings.length - 1].time || 1;

  const x = (time: number) => (time / lastTime) * W; //           time → left/right
  const y = (bpm: number) => H - ((bpm - min) / (max - min)) * H; // bpm → up/down
  const line = points.map((r) => `${x(r.time).toFixed(1)},${y(r.bpm!).toFixed(1)}`).join(" ");

  return (
    <div className="report-stat mt-4">
      <div className="flex justify-between text-[11px] uppercase tracking-[0.18em] text-white/50">
        <span>Heart rate during the session</span>
        <span className="normal-case tracking-normal text-white/35">
          {Math.round(max)} – {Math.round(min)} BPM
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" className="mt-3 overflow-visible">
        <defs>
          <linearGradient id="report-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ff3c5a" />
            <stop offset="50%" stopColor="#822dff" />
            <stop offset="100%" stopColor="#3cd2ff" />
          </linearGradient>
        </defs>
        {/* dashed line: where the breathing guide started */}
        <line x1={x(baselineSeconds)} x2={x(baselineSeconds)} y1="0" y2={H} stroke="rgba(255,255,255,0.25)" strokeDasharray="4 5" vectorEffect="non-scaling-stroke" />
        {/* ⚡ amber lines: moments when stress showed up (a sweat spike or a sudden heart jump) */}
        {report.stressTimes.map((t) => (
          <line key={t} x1={x(t)} x2={x(t)} y1="0" y2={H} stroke="#ffc36b" strokeOpacity="0.6" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        ))}
        <polyline points={line} fill="none" stroke="url(#report-line)" strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="relative mt-1 h-4 text-[10px] text-white/35">
        <span className="absolute left-0">Start</span>
        {/* placed right under the dashed line */}
        {x(baselineSeconds) / W < 0.8 && ( // (hidden if it would bump into "End")
          <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${(x(baselineSeconds) / W) * 100}%` }}>
            ↑ breathing started
          </span>
        )}
        {report.stressTimes.map((t) => (
          <span key={t} className="absolute -translate-x-1/2 text-amber-200" style={{ left: `${(x(t) / W) * 100}%` }}>
            ⚡
          </span>
        ))}
        <span className="absolute right-0">End</span>
      </div>
      {report.stressTimes.length > 0 && (
        <p className="mt-2 text-xs text-white/50">
          <span className="text-amber-200">⚡</span> = your body reacted to something (a sweat spike or a sudden heart jump).
        </p>
      )}
    </div>
  );
}

