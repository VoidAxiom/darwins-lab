import { GENE_INFO, type GeneKey } from "../sim/genome";
import { useLab } from "../store";

/** Live vitals + dominant-trait genome bars + mutation hotspots + dynasties. */
export function StatsPanel() {
  const stats = useLab((s) => s.snapshot?.stats);
  const speciesById = useLab((s) => s.snapshot?.speciesById);
  if (!stats) return <div className="card muted tiny">Booting simulation…</div>;

  const genes = Object.entries(stats.meanGenes) as [GeneKey, number][];

  return (
    <>
      <div className="card">
        <h3>World Vitals</h3>
        <div className="statgrid">
          <span className="k">Generation</span>
          <span className="v">{stats.generation.toLocaleString()}</span>
          <span className="k">Tick</span>
          <span className="v">{stats.tick.toLocaleString()}</span>
          <span className="k">Population</span>
          <span className="v">{stats.population.toLocaleString()}</span>
          <span className="k">Clans alive</span>
          <span className="v">{stats.speciesCount}</span>
          <span className="k">Births / Deaths</span>
          <span className="v">
            {stats.births} / {stats.deaths}
          </span>
          <span className="k">Climate</span>
          <span className="v">
            {stats.baseTemp < 0.35 ? "❄ cold" : stats.baseTemp > 0.65 ? "🔥 hot" : "temperate"}
          </span>
          <span className="k">Food index</span>
          <span className="v">{(stats.globalFoodMul * 100).toFixed(0)}%</span>
        </div>
      </div>

      <div className="card">
        <h3>Dominant Traits</h3>
        {genes.map(([k, v]) => (
          <div className="genebar" key={k} title={GENE_INFO[k].about}>
            <span className="lbl">{GENE_INFO[k].label}</span>
            <span className="bar">
              <span
                style={{
                  width: `${v * 100}%`,
                  background: `linear-gradient(90deg,#3a6ea5,#5cc8ff)`,
                }}
              />
            </span>
            <span className="num">{v.toFixed(2)}</span>
          </div>
        ))}
      </div>

      <div className="card">
        <h3>Mutation Hotspots</h3>
        <div className="tiny muted" style={{ marginBottom: 6 }}>
          Genes under the most active selection right now.
        </div>
        {stats.hotspots.map((h) => (
          <div className="genebar" key={h.gene}>
            <span className="lbl">{GENE_INFO[h.gene as GeneKey].label}</span>
            <span className="bar">
              <span
                style={{
                  width: `${Math.min(100, h.variance * 900)}%`,
                  background: "linear-gradient(90deg,#a5683a,#ffb15c)",
                }}
              />
            </span>
            <span className="num">{(h.variance * 100).toFixed(1)}</span>
          </div>
        ))}
      </div>

      <div className="card">
        <h3>Longest Dynasties</h3>
        <div className="tiny">
          {stats.dynasties.map((d) => {
            const sp = speciesById?.[d.speciesId];
            return (
              <div className="gen" key={d.speciesId}>
                <span>
                  <span className="swatch" style={{ background: sp?.color ?? "#888" }} />
                  Clan #{d.speciesId}
                </span>
                <span className="muted">
                  {Math.round(d.ageTicks / 100) / 10}k ticks · {d.population} alive
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
