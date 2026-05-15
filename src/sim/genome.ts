import type { RNG } from "./rng";

/**
 * The genome is a fixed set of named genes, each a scalar in [0, 1]. Behaviour
 * and physiology are derived from these at simulation time, so evolution only
 * ever has to mutate a flat vector — which keeps speciation (genome distance)
 * and the inspector UI simple.
 */
export const GENE_KEYS = [
  "speed", // movement distance per tick
  "vision", // sensing radius
  "aggression", // tendency to attack rather than flee
  "camouflage", // chance to be missed by predators
  "metabolism", // baseline energy burn (low = thrifty, slow)
  "reproduction", // energy threshold to reproduce (low = r-strategy)
  "offspringInvestment", // energy passed to each child
  "memory", // how long a creature remembers food/danger locations
  "cooperation", // willingness to share food / herd with kin
  "diet", // 0 = pure herbivore, 1 = pure carnivore
  "size", // affects combat, energy needs, and predation
  "tempPreference", // preferred climate band (0 = cold, 1 = hot)
] as const;

export type GeneKey = (typeof GENE_KEYS)[number];

export type Genome = Record<GeneKey, number>;

/** Human-readable labels + one-line descriptions for the inspector UI. */
export const GENE_INFO: Record<GeneKey, { label: string; about: string }> = {
  speed: { label: "Speed", about: "Distance covered per tick when foraging or fleeing." },
  vision: { label: "Vision", about: "Radius within which food, mates, and threats are sensed." },
  aggression: { label: "Aggression", about: "Bias toward attacking rather than fleeing." },
  camouflage: { label: "Camouflage", about: "Chance to evade a predator's strike entirely." },
  metabolism: { label: "Metabolism", about: "Baseline energy burn. Low is thrifty but sluggish." },
  reproduction: { label: "Reproduction", about: "Energy needed before a creature will breed." },
  offspringInvestment: { label: "Investment", about: "Energy endowed to each offspring at birth." },
  memory: { label: "Memory", about: "How long known food/danger sites are remembered." },
  cooperation: { label: "Cooperation", about: "Willingness to herd with and share food among kin." },
  diet: { label: "Diet", about: "0 = herbivore, 1 = carnivore. Mid values omnivore." },
  size: { label: "Size", about: "Bigger wins fights but needs more food." },
  tempPreference: { label: "Climate", about: "Preferred temperature band (cold → hot)." },
};

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/** A fresh, fully random genome — used to seed the founding population. */
export function randomGenome(rng: RNG): Genome {
  const g = {} as Genome;
  for (const k of GENE_KEYS) g[k] = rng.next();
  // Bias the founders toward viable generalists so the world doesn't die out
  // in the first few hundred ticks before selection can do anything.
  g.metabolism = rng.range(0.25, 0.55);
  g.diet = rng.range(0.0, 0.35); // start mostly herbivorous
  g.reproduction = rng.range(0.35, 0.7);
  return g;
}

/**
 * Produce a mutated copy of a parent genome. Most genes drift by a small
 * Gaussian step; occasionally a gene takes a large "macro-mutation" jump,
 * which is what produces visible speciation events rather than slow creep.
 */
export function mutate(parent: Genome, rng: RNG, rate: number, magnitude: number): Genome {
  const child = {} as Genome;
  for (const k of GENE_KEYS) {
    let v = parent[k];
    if (rng.chance(rate)) {
      v += rng.gaussian(0, magnitude);
    }
    if (rng.chance(rate * 0.08)) {
      // Rare macro-mutation: a big jump that can found a new lineage.
      v += rng.gaussian(0, magnitude * 6);
    }
    child[k] = clamp01(v);
  }
  return child;
}

/** Average of two genomes plus mutation — used for sexual reproduction. */
export function recombine(a: Genome, b: Genome, rng: RNG, rate: number, magnitude: number): Genome {
  const blended = {} as Genome;
  for (const k of GENE_KEYS) {
    // Per-gene crossover: inherit wholesale from one parent, biased to the mean.
    blended[k] = rng.chance(0.5) ? a[k] : b[k];
  }
  return mutate(blended, rng, rate, magnitude);
}

/** Euclidean distance in gene space — the basis for clustering into species. */
export function genomeDistance(a: Genome, b: Genome): number {
  let sum = 0;
  for (const k of GENE_KEYS) {
    const d = a[k] - b[k];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

/** Element-wise mean of many genomes — a clan's "centroid" / archetype. */
export function meanGenome(genomes: Genome[]): Genome {
  const mean = {} as Genome;
  for (const k of GENE_KEYS) mean[k] = 0;
  for (const g of genomes) for (const k of GENE_KEYS) mean[k] += g[k];
  const n = Math.max(1, genomes.length);
  for (const k of GENE_KEYS) mean[k] /= n;
  return mean;
}
