import { GENE_KEYS } from "./genome";
import type { HistoryFrame, SimSnapshot } from "./types";

export function runToJSON(snapshot: SimSnapshot, seed: number): string {
  const payload = {
    seed,
    tick: snapshot.stats.tick,
    generation: snapshot.stats.generation,
    stats: snapshot.stats,
    history: snapshot.history,
    events: snapshot.events,
  };

  return JSON.stringify(payload, null, 2);
}

export function runToCSV(history: HistoryFrame[]): string {
  const geneHeaders = GENE_KEYS.map((k) => `gene_${k}`);
  const header = ["tick", "generation", "population", "speciesCount", "baseTemp", "globalFoodMul", ...geneHeaders].join(",");

  if (history.length === 0) return `${header}`;

  const rows = history.map((frame) => {
    const geneCells = GENE_KEYS.map((k) => {
      const v = frame.meanGenes[k];
      return v == null ? "" : String(v);
    });

    return [
      frame.tick,
      frame.generation,
      frame.population,
      frame.speciesCount,
      frame.baseTemp,
      frame.globalFoodMul,
      ...geneCells,
    ]
      .map((v) => String(v))
      .join(",");
  });

  return [header, ...rows].join("\n");
}
