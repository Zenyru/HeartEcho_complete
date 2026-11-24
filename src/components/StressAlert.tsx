// A small pop-up that appears when the skin sensor sees a sudden stress reaction
export default function StressAlert({ show }: { show: boolean }) {
  return (
    <div className={"stress-alert " + (show ? "stress-alert-show" : "")} role="status" aria-live="polite">
      <span className="stress-alert-ping" />
      <div>
        <div className="text-sm text-white">Stress response detected</div>
        <div className="text-xs text-white/55">Your skin reacted. Slow breath out…</div>
      </div>
    </div>
  );
}
