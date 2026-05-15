import { useLab } from "../store";
import { SHOCK_LABELS } from "../sim/events";
import type { ShockKind } from "../sim/types";

const SHOCKS: { kind: ShockKind; icon: string }[] = [
  { kind: "iceAge", icon: "❄️" },
  { kind: "heatwave", icon: "🔥" },
  { kind: "drought", icon: "🏜️" },
  { kind: "plague", icon: "🦠" },
  { kind: "predatorInvasion", icon: "🐺" },
  { kind: "asteroid", icon: "☄️" },
];

/** The "play god" panel — fire mass-extinction shocks at the world. */
export function ShockPanel() {
  const shock = useLab((s) => s.shock);
  const active = useLab((s) => s.snapshot?.stats.activeShock ?? null);

  return (
    <div className="card">
      <h3>Mass Extinction</h3>
      <div className="shockgrid">
        {SHOCKS.map((s) => (
          <button
            key={s.kind}
            className={`btn danger ${active === s.kind ? "active" : ""}`}
            onClick={() => shock(s.kind)}
            title={`Trigger ${SHOCK_LABELS[s.kind]}`}
          >
            {s.icon} {SHOCK_LABELS[s.kind]}
          </button>
        ))}
      </div>
      {active && (
        <p className="tiny" style={{ color: "var(--danger)", margin: "8px 0 0" }}>
          {SHOCK_LABELS[active]} in progress — the world is reeling.
        </p>
      )}
    </div>
  );
}
