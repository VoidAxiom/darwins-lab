import { useMemo } from "react";
import { useLab } from "../store";
import type { Species } from "../sim/types";

interface Node {
  sp: Species;
  children: Node[];
  row: number;
}

/**
 * The clan family tree. Each clan is plotted by birth time (x) with parent→
 * child branches; living clans glow, extinct ones fade. This is the "lineages
 * branch, dominate, and die out" story made literal.
 */
export function Phylogeny() {
  const speciesById = useLab((s) => s.snapshot?.speciesById);
  const tick = useLab((s) => s.snapshot?.stats.tick ?? 1);
  const select = useLab((s) => s.select);

  const { nodes, links, W, H, t0 } = useMemo(() => {
    const all = Object.values(speciesById ?? {});
    // Keep clans that actually mattered, so the tree stays legible.
    const keep = all.filter((s) => s.peakPopulation >= 12);
    const byId = new Map(keep.map((s) => [s.id, s]));
    const nodeById = new Map<number, Node>();
    for (const sp of keep) nodeById.set(sp.id, { sp, children: [], row: 0 });
    const roots: Node[] = [];
    for (const n of nodeById.values()) {
      const p = n.sp.parentId != null ? nodeById.get(n.sp.parentId) : undefined;
      if (p && byId.has(n.sp.parentId!)) p.children.push(n);
      else roots.push(n);
    }

    let row = 0;
    const assign = (n: Node) => {
      n.children.sort((a, b) => a.sp.bornTick - b.sp.bornTick);
      if (n.children.length === 0) {
        n.row = row++;
        return;
      }
      n.children.forEach(assign);
      n.row = n.children.reduce((s, c) => s + c.row, 0) / n.children.length;
    };
    roots.sort((a, b) => a.sp.bornTick - b.sp.bornTick);
    roots.forEach(assign);

    const t0 = Math.min(...keep.map((s) => s.bornTick), 0);
    const span = Math.max(1, tick - t0);
    const W = 320;
    const rowH = 16;
    const H = Math.max(40, row * rowH + 16);
    const x = (t: number) => 6 + ((t - t0) / span) * (W - 14);
    const y = (r: number) => 10 + r * rowH;

    const nodes = [...nodeById.values()].map((n) => ({
      id: n.sp.id,
      color: n.sp.color,
      alive: n.sp.extinctTick === undefined && n.sp.population > 0,
      x1: x(n.sp.bornTick),
      x2: x(n.sp.extinctTick ?? tick),
      y: y(n.row),
      pop: n.sp.population,
      peak: n.sp.peakPopulation,
    }));
    const links: { x1: number; y1: number; x2: number; y2: number; color: string }[] = [];
    for (const n of nodeById.values()) {
      for (const ch of n.children) {
        links.push({
          x1: x(n.sp.bornTick),
          y1: y(n.row),
          x2: x(ch.sp.bornTick),
          y2: y(ch.row),
          color: ch.sp.color,
        });
      }
    }
    return { nodes, links, W, H, t0 };
  }, [speciesById, tick]);

  if (nodes.length === 0) {
    return (
      <div className="card muted tiny">Phylogeny — clans appear here as they diverge…</div>
    );
  }

  return (
    <div className="card">
      <h3>Clan Phylogeny</h3>
      <div className="tiny muted" style={{ marginBottom: 6 }}>
        {nodes.length} notable lineages · left = older · bright = alive
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: Math.min(260, H), display: "block" }}
      >
        {links.map((l, i) => (
          <path
            key={i}
            d={`M${l.x1},${l.y1} C${(l.x1 + l.x2) / 2},${l.y1} ${(l.x1 + l.x2) / 2},${l.y2} ${l.x2},${l.y2}`}
            fill="none"
            stroke={l.color}
            strokeOpacity={0.45}
            strokeWidth={1}
          />
        ))}
        {nodes.map((n) => (
          <g key={n.id} style={{ cursor: "default" }}>
            <line
              x1={n.x1}
              y1={n.y}
              x2={n.x2}
              y2={n.y}
              stroke={n.color}
              strokeWidth={n.alive ? 2.4 : 1.2}
              strokeOpacity={n.alive ? 1 : 0.4}
            />
            <circle
              cx={n.x1}
              cy={n.y}
              r={2.4}
              fill={n.color}
              fillOpacity={n.alive ? 1 : 0.5}
            />
            {n.alive && (
              <circle cx={n.x2} cy={n.y} r={Math.min(5, 2 + n.pop / 120)} fill={n.color}>
                <title>
                  Clan #{n.id} — {n.pop} alive (peaked {n.peak})
                </title>
              </circle>
            )}
          </g>
        ))}
      </svg>
      <div className="legend" style={{ marginTop: 4 }}>
        <span className="muted">node size = current population · t₀ = tick {t0}</span>
        <button className="btn tiny" onClick={() => select(null)}>
          clear selection
        </button>
      </div>
    </div>
  );
}
