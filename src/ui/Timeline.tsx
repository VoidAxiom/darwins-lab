import { useMemo } from "react";
import { useLab } from "../store";

/**
 * Evolutionary history scrubber. Plots population (filled) and clan count
 * (line) across the whole ring-buffer history; dragging the playhead pins a
 * past moment whose vitals are shown. Positions aren't replayed (history is
 * deliberately downsampled for bounded memory) — this is the macro view.
 */
export function Timeline() {
  const history = useLab((s) => s.snapshot?.history ?? []);
  const scrubIndex = useLab((s) => s.scrubIndex);
  const setScrub = useLab((s) => s.setScrub);

  const W = 1000;
  const H = 90;

  const { popPath, popArea, spPath, maxPop, maxSp } = useMemo(() => {
    if (history.length < 2) {
      return { popPath: "", popArea: "", spPath: "", maxPop: 1, maxSp: 1 };
    }
    const maxPop = Math.max(1, ...history.map((f) => f.population));
    const maxSp = Math.max(1, ...history.map((f) => f.speciesCount));
    const x = (i: number) => (i / (history.length - 1)) * W;
    const yP = (v: number) => H - (v / maxPop) * H;
    const yS = (v: number) => H - (v / maxSp) * (H * 0.85);
    const popPath = history.map((f, i) => `${i ? "L" : "M"}${x(i)},${yP(f.population)}`).join("");
    const popArea = `M0,${H} ${history
      .map((f, i) => `L${x(i)},${yP(f.population)}`)
      .join("")} L${W},${H} Z`;
    const spPath = history.map((f, i) => `${i ? "L" : "M"}${x(i)},${yS(f.speciesCount)}`).join("");
    return { popPath, popArea, spPath, maxPop, maxSp };
  }, [history]);

  const sel = scrubIndex != null ? history[scrubIndex] : history[history.length - 1];

  const onScrub = (e: React.MouseEvent<SVGSVGElement>) => {
    if (history.length < 2) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const idx = Math.round(frac * (history.length - 1));
    setScrub(idx === history.length - 1 ? null : idx);
  };

  return (
    <div>
      <div className="row" style={{ marginBottom: 4 }}>
        <strong className="tiny">Evolutionary Timeline</strong>
        {sel && (
          <span className="tiny muted">
            gen {sel.generation.toLocaleString()} · tick {sel.tick.toLocaleString()} · pop{" "}
            {sel.population.toLocaleString()} · {sel.speciesCount} clans · climate{" "}
            {sel.baseTemp.toFixed(2)} · food {(sel.globalFoodMul * 100) | 0}%
          </span>
        )}
        <span style={{ flex: 1 }} />
        {scrubIndex != null && (
          <button className="btn tiny" onClick={() => setScrub(null)}>
            ⏵ Back to live
          </button>
        )}
        <span className="tiny muted">
          pop↦{maxPop} · clans↦{maxSp}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ width: "100%", height: 90, display: "block", cursor: "crosshair" }}
        onClick={onScrub}
      >
        <rect x={0} y={0} width={W} height={H} fill="#0e1218" />
        <path d={popArea} fill="rgba(92,200,255,0.18)" />
        <path d={popPath} fill="none" stroke="#5cc8ff" strokeWidth={1.5} />
        <path d={spPath} fill="none" stroke="#69d28a" strokeWidth={1.5} />
        {sel && history.length > 1 && (
          <line
            x1={(history.indexOf(sel) / (history.length - 1)) * W}
            x2={(history.indexOf(sel) / (history.length - 1)) * W}
            y1={0}
            y2={H}
            stroke="#fff"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        )}
      </svg>
      <div className="legend" style={{ marginTop: 4 }}>
        <span>
          <span className="swatch" style={{ background: "#5cc8ff" }} />
          population
        </span>
        <span>
          <span className="swatch" style={{ background: "#69d28a" }} />
          clan count
        </span>
        <span className="muted">click the chart to scrub history</span>
      </div>
    </div>
  );
}
