import { GENE_KEYS } from "./genome";
import type { SpeciesManager } from "./speciation";
import type { Creature, ShockKind, SimStats } from "./types";
import type { World } from "./world";

/** Compute the emergent dashboard statistics from current sim state. */
export function computeStats(
  creatures: Creature[],
  species: SpeciesManager,
  world: World,
  tick: number,
  generation: number,
  births: number,
  deaths: number,
  activeShock: ShockKind | null,
): SimStats {
  const n = creatures.length;

  // Population-weighted gene means and variances in one pass.
  const mean: Record<string, number> = {};
  const m2: Record<string, number> = {};
  for (const k of GENE_KEYS) {
    mean[k] = 0;
    m2[k] = 0;
  }
  for (const c of creatures) {
    for (const k of GENE_KEYS) mean[k] += c.genome[k];
  }
  for (const k of GENE_KEYS) mean[k] /= Math.max(1, n);
  for (const c of creatures) {
    for (const k of GENE_KEYS) {
      const d = c.genome[k] - mean[k];
      m2[k] += d * d;
    }
  }

  const hotspots = GENE_KEYS.map((k) => ({
    gene: k,
    variance: m2[k] / Math.max(1, n),
  }))
    .sort((a, b) => b.variance - a.variance)
    .slice(0, 4);

  const live = species.liveSpecies().sort((a, b) => b.population - a.population);
  const dynasties = live
    .map((s) => ({
      speciesId: s.id,
      ageTicks: tick - s.bornTick,
      population: s.population,
    }))
    .sort((a, b) => b.ageTicks - a.ageTicks)
    .slice(0, 6);

  return {
    tick,
    generation,
    population: n,
    births,
    deaths,
    speciesCount: live.length,
    liveSpecies: live.slice(0, 24),
    meanGenes: mean,
    hotspots,
    dynasties,
    baseTemp: world.baseTemp,
    globalFoodMul: world.globalFoodMul,
    activeShock,
  };
}
