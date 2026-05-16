import { useMemo } from "react";
import { computePhylogeny } from "../sim/phylogeny";
import { useLab } from "../store";

/**
 * The clan family tree. Each clan is a horizontal lifeline placed by birth
 * time (x) and lineage row (y); branches connect a clan to its nearest
 * surviving-in-the-tree ancestor. Living clans glow and carry a dot sized by
 * population; extinct ones fade. "Lineages branch, dominate, and die out",
 * made literal. Layout logic is shared with the headless inspector.
 */
export function Phylogeny() {
  const speciesById = useLab((s) => s.snapshot?.speciesById);
  const tick = useLab((s) => s.snapshot?.stats.tick ?? 1);

  const layout = useMemo(
    () => computePhylogeny(speciesById ?? {}, tick, { minPeak: 12, maxNodes: 44 }),
    [speciesById, tick],
  );

  if (layout.nodes.length === 0) {
    return <div className="card muted tiny">Phylogeny — clans appear here as they diverge…</div>;
  }

  const W = 320;
  const rowH = 13;
  const H = Math.max(40, layout.rows * rowH + 14);
  const span = Math.max(1, tick - layout.t0);
  const x = (t: number) => 6 + ((t - layout.t0) / span) * (W - 12);
  const y = (r: number) => 8 + r * rowH;
  const aliveCount = layout.nodes.filter((n) => n.alive).length;

  return (
    <div className="card">
      <h3>Clan Phylogeny</h3>
      <div className="tiny muted" style={{ marginBottom: 6 }}>
        {layout.nodes.length} notable lineages · {aliveCount} alive · left = older
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: Math.min(280, H), display: "block" }}
      >
        {layout.links.map((l, i) => {
          const bx = x(l.child.bornTick);
          return (
            <path
              key={i}
              d={`M${x(l.parent.bornTick)},${y(l.parent.row)} L${bx},${y(l.parent.row)} L${bx},${y(l.child.row)}`}
              fill="none"
              stroke={l.child.color}
              strokeOpacity={0.4}
              strokeWidth={1}
            />
          );
        })}
        {layout.nodes.map((n) => (
          <g key={n.id}>
            <line
              x1={x(n.bornTick)}
              y1={y(n.row)}
              x2={x(n.endTick)}
              y2={y(n.row)}
              stroke={n.color}
              strokeWidth={n.alive ? 2.4 : 1.1}
              strokeOpacity={n.alive ? 1 : 0.38}
            />
            <circle cx={x(n.bornTick)} cy={y(n.row)} r={1.8} fill={n.color} fillOpacity={0.7} />
            {n.alive && (
              <circle cx={x(n.endTick)} cy={y(n.row)} r={Math.min(5, 2 + n.population / 130)} fill={n.color}>
                <title>
                  Clan #{n.id} — {n.population} alive (peaked {n.peakPopulation})
                </title>
              </circle>
            )}
          </g>
        ))}
      </svg>
      <div className="legend" style={{ marginTop: 4 }}>
        <span className="muted">node = current population · branches = descent</span>
      </div>
    </div>
  );
}
