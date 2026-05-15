import { useLab } from "../store";

const ICON: Record<string, string> = {
  speciation: "🌱",
  extinction: "💀",
  bottleneck: "⚠️",
  shock: "⚡",
  dynasty: "👑",
  collapse: "🕳️",
};

/** Reverse-chronological feed of macro-evolutionary events. */
export function EventsLog() {
  const events = useLab((s) => s.snapshot?.events ?? []);
  return (
    <div className="card">
      <h3>Event Log</h3>
      <div className="events">
        {events.length === 0 && <span className="muted tiny">No events yet…</span>}
        {[...events].reverse().map((e, i) => (
          <div className={`ev ${e.kind}`} key={`${e.tick}-${i}`}>
            {ICON[e.kind] ?? "•"} {e.text}
          </div>
        ))}
      </div>
    </div>
  );
}
