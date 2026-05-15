import { useLab } from "../store";

const SPEEDS = [1, 4, 16, 48, 120, 300];

/** Run/pause, speed, reseed. Lives in the bottom bar. */
export function Controls() {
  const running = useLab((s) => s.running);
  const speed = useLab((s) => s.speed);
  const seed = useLab((s) => s.seed);
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
    </div>
  );
}
