import type { Source } from "../types/message";

// The bar across the top: logo on the left, connection + music on the right
export default function TopBar({
  source,
  musicOn,
  soundBlocked,
  onToggleMusic,
}: {
  source: Source; //             where readings come from
  musicOn: boolean; //           is music switched on?
  soundBlocked: boolean; //      did the browser block the sound? (then the button asks for a click)
  onToggleMusic: () => void; //  called when the music button is clicked
}) {
  // what the connection pill says
  const pill = {
    none: { text: "Not connected", colour: "rgba(255,255,255,0.35)" },
    arduino: { text: "Sensor connected", colour: "#5ef0b4" },
    demo: { text: "Demo mode", colour: "#ffc36b" },
  }[source];

  return (
    <header className="fixed left-0 right-0 top-0 z-20 flex items-center justify-between px-5 py-4 sm:px-8">
      {/* logo */}
      <div className="flex items-center gap-2.5">
        <span className="logo-heart">♥</span>
        <span className="text-lg font-light tracking-[0.25em] text-white">
          HEART<span className="text-white/45">ECHO</span>
        </span>
      </div>

      <div className="flex items-center gap-3">
        {/* connection pill */}
        <div className="pill">
          <span className="pill-dot" style={{ background: pill.colour, boxShadow: `0 0 8px ${pill.colour}` }} />
          <span className="hidden sm:inline">{pill.text}</span>
        </div>

        {/* music on/off */}
        <button
          className="pill cursor-pointer hover:text-white"
          onClick={onToggleMusic}
          aria-pressed={musicOn}
          style={soundBlocked ? { color: "#ffc36b", borderColor: "rgba(255,195,107,0.6)" } : undefined} // amber when blocked
        >
          {soundBlocked ? "🔇 Click for sound" : musicOn ? "♪ Music on" : "♪ Music off"}
        </button>
      </div>
    </header>
  );
}
