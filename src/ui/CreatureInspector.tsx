import { useEffect } from "react";
import { GENE_INFO, type GeneKey } from "../sim/genome";
import { refreshInspect, useLab } from "../store";

/** Deep-dive on the clicked creature: genome, role, and its ancestry chain. */
export function CreatureInspector() {
  const selectedId = useLab((s) => s.selectedId);
  const inspect = useLab((s) => s.inspect);
  const speciesById = useLab((s) => s.snapshot?.speciesById);
  const select = useLab((s) => s.select);
  const running = useLab((s) => s.running);

  // Keep the ancestry/alive flag fresh while the world runs.
  useEffect(() => {
    if (selectedId == null || !running) return;
    const t = setInterval(refreshInspect, 700);
    return () => clearInterval(t);
  }, [selectedId, running]);

  if (selectedId == null) {
    return (
      <div className="card muted tiny">
        Click any creature on the map to inspect its genome, lineage, and fate.
      </div>
    );
  }
  if (!inspect || inspect.id !== selectedId) {
    return <div className="card muted tiny">Loading creature #{selectedId}…</div>;
  }

  const genome = inspect.genome;
  const sp = inspect.chain[0] ? speciesById?.[inspect.chain[0].speciesId] : undefined;
  const role =
    genome && genome.diet > 0.55
      ? "🥩 Carnivore"
      : genome && genome.diet > 0.4
        ? "🍗 Omnivore"
        : "🌿 Herbivore";

  return (
    <div className="card">
      <h3>
        Creature #{selectedId}{" "}
        <button
          className="btn tiny"
          style={{ float: "right", padding: "2px 8px" }}
          onClick={() => select(null)}
        >
          ✕
        </button>
      </h3>
      <div className="statgrid" style={{ marginBottom: 10 }}>
        <span className="k">Status</span>
        <span className="v" style={{ color: inspect.alive ? "var(--good)" : "var(--danger)" }}>
          {inspect.alive ? "alive" : "deceased"}
        </span>
        <span className="k">Clan</span>
        <span className="v">
          {sp && <span className="swatch" style={{ background: sp.color }} />}#
          {inspect.chain[0]?.speciesId}
        </span>
        <span className="k">Generation</span>
        <span className="v">{inspect.chain[0]?.generation ?? "—"}</span>
        <span className="k">Niche</span>
        <span className="v">{role}</span>
      </div>

      {genome && (
        <>
          <div className="tiny muted" style={{ marginBottom: 4 }}>
            Genome
          </div>
          {(Object.keys(genome) as GeneKey[]).map((k) => (
            <div className="genebar" key={k} title={GENE_INFO[k].about}>
              <span className="lbl">{GENE_INFO[k].label}</span>
              <span className="bar">
                <span
                  style={{
                    width: `${genome[k] * 100}%`,
                    background: "linear-gradient(90deg,#3a8a5a,#69d28a)",
                  }}
                />
              </span>
              <span className="num">{genome[k].toFixed(2)}</span>
            </div>
          ))}
        </>
      )}

      <AncestryTree />
    </div>
  );
}

/** Compact lineage view: each ancestor row + how its genome drifted. */
function AncestryTree() {
  const inspect = useLab((s) => s.inspect);
  if (!inspect || inspect.chain.length < 2) {
    return (
      <p className="tiny muted" style={{ marginTop: 10 }}>
        Founder lineage — no recorded ancestors.
      </p>
    );
  }
  const chain = inspect.chain;
  return (
    <div style={{ marginTop: 10 }}>
      <div className="tiny muted" style={{ marginBottom: 4 }}>
        Ancestry ({chain.length} recorded generations)
      </div>
      <div className="ancestry">
        {chain.map((node, i) => {
          const child = chain[i - 1];
          let drift = "";
          if (child) {
            // Surface the single gene that mutated most between this ancestor
            // and its descendant — the visible "what changed" story.
            let maxK = "";
            let maxD = 0;
            for (const k of Object.keys(node.genome)) {
              const d = Math.abs(node.genome[k as never] - child.genome[k as never]);
              if (d > maxD) {
                maxD = d;
                maxK = k;
              }
            }
            if (maxD > 0.02)
              drift = `→ ${GENE_INFO[maxK as GeneKey].label} ${maxD > 0 ? "shifted" : ""} ${(maxD * 100).toFixed(0)}%`;
          }
          return (
            <div className="gen" key={node.id}>
              <span>
                gen {node.generation} · #{node.id}
              </span>
              <span className="muted">{drift || (i === 0 ? "selected" : "")}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
