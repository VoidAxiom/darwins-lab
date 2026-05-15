/**
 * Local, zero-cost narrator. Turns the most significant recent events + the
 * dominant clan's genome into a short "nature documentary" line. This is the
 * default so the product is fully functional with no API spend at all; the
 * optional LLM narrator only ever *replaces* this on demand.
 */
import { GENE_INFO, type GeneKey } from "../sim/genome";
import type { EventRecord, SimStats } from "../sim/types";

function dominantTraitPhrase(meanGenes: Record<string, number>): string {
  const entries = Object.entries(meanGenes) as [GeneKey, number][];
  const high = entries.filter(([, v]) => v > 0.62).sort((a, b) => b[1] - a[1]);
  const low = entries.filter(([, v]) => v < 0.32).sort((a, b) => a[1] - b[1]);
  const bits: string[] = [];
  if (high[0]) bits.push(`high ${GENE_INFO[high[0][0]].label.toLowerCase()}`);
  if (low[0]) bits.push(`low ${GENE_INFO[low[0][0]].label.toLowerCase()}`);
  return bits.join(" and ") || "an unremarkable, generalist build";
}

export function narrateHeuristic(stats: SimStats, events: EventRecord[]): string {
  const gen = stats.generation.toLocaleString();
  const recent = events.slice(-12);
  const shock = [...recent].reverse().find((e) => e.kind === "shock");
  const speciation = [...recent].reverse().find((e) => e.kind === "speciation");
  const extinction = [...recent].reverse().find((e) => e.kind === "extinction");
  const collapse = [...recent].reverse().find((e) => e.kind === "collapse");
  const trait = dominantTraitPhrase(stats.meanGenes);

  if (collapse) {
    return `Generation ${gen}: silence. The world has emptied — every lineage gone, the map barren. An experiment in extinction.`;
  }
  if (shock && stats.tick - shock.tick < 1500) {
    return `Generation ${gen}: in the wake of catastrophe, ${stats.population.toLocaleString()} survivors across ${stats.speciesCount} clans cling on, now favouring ${trait}.`;
  }
  if (extinction && stats.tick - extinction.tick < 900) {
    return `Generation ${gen}: a lineage winks out. The survivors — ${stats.speciesCount} clans, ${stats.population.toLocaleString()} strong — drift toward ${trait}.`;
  }
  if (speciation && stats.tick - speciation.tick < 900) {
    return `Generation ${gen}: a new clan breaks away, and the family tree forks again. ${stats.speciesCount} lineages now share the world, trending toward ${trait}.`;
  }
  const dom = stats.liveSpecies[0];
  if (dom) {
    return `Generation ${gen}: clan #${dom.id} dominates with ${dom.population.toLocaleString()} of ${stats.population.toLocaleString()} creatures, the population settling into ${trait}.`;
  }
  return `Generation ${gen}: ${stats.population.toLocaleString()} creatures in ${stats.speciesCount} clans, evolving toward ${trait}.`;
}
