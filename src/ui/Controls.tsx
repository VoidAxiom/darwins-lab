import { useLab } from "../store";
import { runToCSV, runToJSON } from "../sim/exportRun";

const SPEEDS = [1, 4, 16, 48, 120, 300];

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

/** Run/pause, speed, reseed. Lives in the bottom bar. */
export function Controls() {
  const running = useLab((s) => s.running);
  const speed = useLab((s) => s.speed);
  const seed = useLab((s) => s.seed);
  const snapshot = useLab((s) => s.snapshot);
  const start = useLab((s) => s.start);
  const pause = useLab((s) => s.pause);
  const setSpeed = useLab((s) => s.setSpeed);
  const reset = useLab((s) => s.reset);

  return (
    <div className="row">
      <button className="btn primary" onClick={() => (running ? pause() : start())}>
        {running ? "⏸ Pause" : "▶ Run"}
      </button>
      <span className="muted tiny">Speed</span>
      {SPEEDS.map((s) => (
        <button
          key={s}
          className={`btn ${speed === s ? "active" : ""}`}
          onClick={() => setSpeed(s)}
        >
          {s}×
        </button>
      ))}
      <span style={{ flex: 1 }} />
      <span className="muted tiny">seed</span>
      <input
        className="btn"
        style={{ width: 78 }}
        defaultValue={seed}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            const v = Number((e.target as HTMLInputElement).value);
            if (Number.isFinite(v)) reset(v);
          }
        }}
      />
      <button className="btn" onClick={() => reset(Math.floor(Math.random() * 1e9))}>
        🎲 New world
      </button>
      <button className="btn" onClick={() => reset(seed)}>
        ↺ Restart
      </button>
      <button
        className="btn"
        disabled={!snapshot}
        onClick={() => {
          const latestSnapshot = useLab.getState().snapshot;
          if (!latestSnapshot) return;
          const text = runToJSON(latestSnapshot, seed);
          downloadText(`darwins-lab-${seed}-gen${latestSnapshot.stats.generation}.json`, text);
        }}
      >
        ⤓ JSON
      </button>
      <button
        className="btn"
        disabled={!snapshot}
        onClick={() => {
          const latestSnapshot = useLab.getState().snapshot;
          if (!latestSnapshot) return;
          const text = runToCSV(latestSnapshot.history);
          downloadText(`darwins-lab-${seed}-gen${latestSnapshot.stats.generation}.csv`, text);
        }}
      >
        ⤓ CSV
      </button>
    </div>
  );
}
