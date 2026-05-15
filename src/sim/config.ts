export interface SimConfig {
  seed: number;
  cols: number;
  rows: number;
  cellSize: number;
  /** Founding population size. */
  founders: number;
  /** Hard population ceiling — scarcity culls the weakest beyond this. */
  capacity: number;
  mutationRate: number;
  mutationMagnitude: number;
  /** Ticks between species re-clustering passes. */
  reclusterEvery: number;
  /** Ticks between food regrowth passes. */
  regrowEvery: number;
  /** Ticks between history snapshots. */
  historyEvery: number;
  /** Season length in ticks (full warm→cold→warm cycle). */
  seasonLength: number;
  /** Genome distance beyond which a creature founds a new species. */
  speciationThreshold: number;
}

export const DEFAULT_CONFIG: SimConfig = {
  seed: 1337,
  cols: 160,
  rows: 110,
  cellSize: 6,
  founders: 320,
  capacity: 1600,
  mutationRate: 0.12,
  mutationMagnitude: 0.045,
  reclusterEvery: 240,
  regrowEvery: 4,
  historyEvery: 120,
  seasonLength: 3200,
  speciationThreshold: 0.5,
};
