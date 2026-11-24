import Sparkline from "./Sparkline";

// One glass card for one sensor: name, live value, change since the start, and a mini chart
export default function SensorCard({
  icon,
  title,
  value,
  unit,
  change,
  good,
  colour,
  history,
  hint,
  minRange = 0,
  chart,
}: {
  icon: string; //                   a small symbol, e.g. "♥"
  title: string; //                  e.g. "Heart rate"
  value: string; //                  the number to show (already formatted), or "--"
  unit: string; //                   e.g. "BPM"
  change: string | null; //          e.g. "▼ 6 since start" (null = no baseline yet)
  good: boolean | null; //           is that change a calming one? (colours it green / amber)
  colour: string; //                 the card's accent colour
  history: (number | null)[]; //     last minute of values for the mini chart
  minRange?: number; //              smallest range the mini chart shows (see Sparkline)
  hint: string; //                   one line explaining what the sensor means
  chart?: React.ReactNode; //        optional: something to show instead of the mini chart (the live pulse wave)
}) {
  return (
    <div className="glass-card" style={{ ["--accent" as string]: colour }}>
      {/* top row: icon + title */}
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-white/55">
        <span className="card-icon">{icon}</span>
        {title}
      </div>

      {/* the big live number */}
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="text-[34px] font-extralight leading-none tabular-nums text-white">{value}</span>
        <span className="text-xs tracking-widest text-white/45">{unit}</span>
      </div>

      {/* change since the start of the session */}
      <div
        className="mt-1 h-4 text-xs"
        style={{ color: good === null ? "rgba(255,255,255,0.4)" : good ? "#5ef0b4" : "#ffc36b" }}
      >
        {change ?? hint}
      </div>

      {/* mini chart of the last minute (or the live wave, if one was given) */}
      <div className="mt-2">{chart ?? <Sparkline values={history} colour={colour} minRange={minRange} />}</div>
    </div>
  );
}
