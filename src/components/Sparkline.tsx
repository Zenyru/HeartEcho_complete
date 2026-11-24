// A tiny line chart of the last minute (no axes, just the shape of the line)
export default function Sparkline({
  values,
  colour,
  height = 36,
  minRange = 0,
}: {
  values: (number | null)[]; // the numbers to draw, oldest first
  colour: string; //           line colour
  height?: number;
  minRange?: number; // the chart always covers at least this much, so tiny wobbles don't look like big jumps
}) {
  const width = 200; // the SVG is drawn 200 wide and stretched to fit its box
  const points = values
    .map((v, i) => ({ v, i })) //              remember each value's position
    .filter((p): p is { v: number; i: number } => p.v !== null); // skip the empty ones

  if (points.length < 2) {
    // not enough data yet → a faint dashed line
    return (
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none">
        <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="rgba(255,255,255,0.12)" strokeDasharray="4 6" />
      </svg>
    );
  }

  // find the lowest and highest values, so the line fills the box top to bottom
  let min = Math.min(...points.map((p) => p.v));
  let max = Math.max(...points.map((p) => p.v));
  // if the values hardly change, widen the window around them (e.g. room temp 27.3–27.5 → 26.4–28.4)
  if (max - min < minRange) {
    const middle = (max + min) / 2;
    min = middle - minRange / 2;
    max = middle + minRange / 2;
  }
  const range = max - min || 1; // avoid dividing by 0 when all values are the same

  // turn each value into an x,y position in the box
  const last = values.length - 1 || 1;
  const xy = points.map((p) => {
    const x = (p.i / last) * width;
    const y = height - 3 - ((p.v - min) / range) * (height - 6); // 3 px padding top and bottom
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const id = "spark-" + colour.replace(/[^a-z0-9]/gi, ""); // a unique name for the gradient

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none">
      <defs>
        {/* soft colour under the line, fading to nothing */}
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={colour} stopOpacity="0.28" />
          <stop offset="100%" stopColor={colour} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* the filled area: the line, then down to the bottom corners */}
      <polygon points={`${xy.join(" ")} ${xy[xy.length - 1].split(",")[0]},${height} ${xy[0].split(",")[0]},${height}`} fill={`url(#${id})`} />
      {/* the line itself */}
      <polyline
        points={xy.join(" ")}
        fill="none"
        stroke={colour}
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke" // keeps the line thin even though the SVG is stretched
      />
    </svg>
  );
}
