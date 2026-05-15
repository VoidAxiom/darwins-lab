import { genomeDistance, meanGenome } from "./genome";
import type { RNG } from "./rng";
import type { Creature, Species } from "./types";

/**
 * Online speciation by greedy genome-space clustering.
 *
 * Every creature keeps a `speciesId`. Periodically we re-cluster: each living
 * creature is assigned to the nearest existing species centroid if it is
 * within `threshold`, otherwise it founds a brand-new species whose parent is
 * the species it drifted away from. Centroids are then recomputed from members.
 * Species with no living members are marked extinct (but kept for the lineage
 * tree and timeline). This is cheap, incremental, and produces the visible
 * "branching clans" the UI is built around.
 */
export class SpeciesManager {
  species = new Map<number, Species>();
  private nextId = 1;
  private readonly threshold: number;
  /** Minimum members for a cluster to count as a real, named clan. */
  private readonly minViable: number;
  private readonly palette: string[];
  private paletteCursor = 0;

  constructor(threshold = 0.55, minViable = 12) {
    this.threshold = threshold;
    this.minViable = minViable;
    this.palette = buildPalette();
  }

  private newColor(): string {
    const c = this.palette[this.paletteCursor % this.palette.length];
    this.paletteCursor++;
    return c;
  }

  /** Create the single founding species for the initial population. */
  seed(creatures: Creature[], tick: number): number {
    const id = this.nextId++;
    this.species.set(id, {
      id,
      parentId: null,
      color: this.newColor(),
      centroid: meanGenome(creatures.map((c) => c.genome)),
      bornTick: tick,
      population: creatures.length,
      peakPopulation: creatures.length,
    });
    for (const c of creatures) c.speciesId = id;
    return id;
  }

  /**
   * Reassign creatures to species and spawn new species for genome clusters
   * that have drifted past the threshold. Returns the ids of species created
   * this pass (so the caller can log speciation events).
   */
  recluster(creatures: Creature[], tick: number, rng: RNG): number[] {
    const created: number[] = [];
    if (creatures.length === 0) {
      this.markExtinctions(tick, new Set());
      return created;
    }

    for (const c of creatures) {
      let bestId = -1;
      let bestDist = Infinity;
      for (const sp of this.species.values()) {
        if (sp.extinctTick !== undefined) continue;
        const d = genomeDistance(c.genome, sp.centroid);
        if (d < bestDist) {
          bestDist = d;
          bestId = sp.id;
        }
      }

      if (bestId === -1 || bestDist > this.threshold) {
        // Drifted too far from every clan — found a new one, branching off
        // whichever species it currently belongs to.
        const parentId = bestId === -1 ? c.speciesId : c.speciesId;
        const id = this.nextId++;
        this.species.set(id, {
          id,
          parentId: this.species.has(parentId) ? parentId : null,
          color: this.newColor(),
          centroid: { ...c.genome },
          bornTick: tick,
          population: 0,
          peakPopulation: 0,
        });
        c.speciesId = id;
        created.push(id);
      } else {
        c.speciesId = bestId;
      }
    }

    // Consolidation pass: a clan only "counts" if it reaches a minimum viable
    // size. Members of sub-viable clusters are absorbed into the nearest
    // genuinely viable clan, which keeps the species count meaningful (a
    // handful of real lineages) instead of hundreds of one-off mutants.
    const groupOf = () => {
      const m = new Map<number, Creature[]>();
      for (const c of creatures) {
        let g = m.get(c.speciesId);
        if (!g) m.set(c.speciesId, (g = []));
        g.push(c);
      }
      return m;
    };
    let members = groupOf();
    const viableIds: number[] = [];
    for (const [id, group] of members) {
      if (group.length >= this.minViable) viableIds.push(id);
    }
    if (viableIds.length > 0) {
      for (const [id, group] of members) {
        if (group.length >= this.minViable) continue;
        // Reassign every member to the nearest viable clan's centroid.
        for (const c of group) {
          let bestId = viableIds[0];
          let bestDist = Infinity;
          for (const vid of viableIds) {
            const sp = this.species.get(vid)!;
            const d = genomeDistance(c.genome, sp.centroid);
            if (d < bestDist) {
              bestDist = d;
              bestId = vid;
            }
          }
          c.speciesId = bestId;
        }
        // A provisional clan born this very pass that never took hold is
        // noise — drop it entirely so the lineage tree stays readable.
        const sp = this.species.get(id);
        if (sp && sp.bornTick === tick && sp.peakPopulation < this.minViable) {
          this.species.delete(id);
        }
      }
      members = groupOf();
    }

    const alive = new Set<number>();
    for (const [id, group] of members) {
      const sp = this.species.get(id);
      if (!sp) continue;
      sp.centroid = meanGenome(group.map((g) => g.genome));
      sp.population = group.length;
      sp.peakPopulation = Math.max(sp.peakPopulation, group.length);
      sp.extinctTick = undefined;
      alive.add(id);
    }
    this.markExtinctions(tick, alive);
    void rng;
    return created.filter((id) => {
      const sp = this.species.get(id);
      return sp !== undefined && sp.population >= this.minViable;
    });
  }

  private markExtinctions(tick: number, alive: Set<number>) {
    for (const sp of this.species.values()) {
      if (sp.extinctTick === undefined && !alive.has(sp.id) && sp.population > 0) {
        sp.population = 0;
        sp.extinctTick = tick;
      } else if (sp.extinctTick === undefined && !alive.has(sp.id)) {
        sp.population = 0;
      }
    }
  }

  liveSpecies(): Species[] {
    return [...this.species.values()].filter((s) => s.extinctTick === undefined && s.population > 0);
  }

  asRecord(): Record<number, Species> {
    const out: Record<number, Species> = {};
    for (const [id, sp] of this.species) out[id] = sp;
    return out;
  }
}

/** A spread-out, readable categorical palette generated in HSL. */
function buildPalette(): string[] {
  const colors: string[] = [];
  const golden = 137.508; // golden-angle hue stepping → maximally distinct
  for (let i = 0; i < 96; i++) {
    const h = (i * golden) % 360;
    const s = 60 + ((i * 17) % 25);
    const l = 50 + ((i * 13) % 18);
    colors.push(`hsl(${h.toFixed(0)} ${s}% ${l}%)`);
  }
  return colors;
}
