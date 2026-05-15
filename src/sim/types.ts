import type { Genome } from "./genome";

export interface Creature {
  id: number;
  parentId: number | null;
  speciesId: number;
  /** Generation depth in this creature's lineage (founders = 0). */
  generation: number;
  bornTick: number;

  x: number;
  y: number;
  /** Heading, radians — kept so movement has momentum instead of jitter. */
  heading: number;

  energy: number;
  age: number;
  genome: Genome;

  /** Short-term spatial memory of the best food site recently seen. */
  memX: number;
  memY: number;
  memStrength: number;

  /** Set when infected; counts down. Disease drains energy while > 0. */
  sick: number;
}

/** A clan / species: a cluster in genome space with a recorded ancestry. */
export interface Species {
  id: number;
  /** Species this one split from, or null for a founding lineage. */
  parentId: number | null;
  color: string;
  centroid: Genome;
  bornTick: number;
  /** Tick the last member died; undefined while still alive. */
  extinctTick?: number;
  population: number;
  peakPopulation: number;
}

export type ShockKind =
  | "iceAge"
  | "heatwave"
  | "plague"
  | "drought"
  | "predatorInvasion"
  | "asteroid";

export interface EventRecord {
  tick: number;
  generation: number;
  kind:
    | "speciation"
    | "extinction"
    | "bottleneck"
    | "shock"
    | "dynasty"
    | "collapse";
  shock?: ShockKind;
  speciesId?: number;
  /** Short machine-generated summary; the narrator may rewrite this. */
  text: string;
}

/** Lightweight per-creature payload sent to the renderer each frame. */
export interface CreatureDot {
  id: number;
  x: number;
  y: number;
  speciesId: number;
  energy: number;
  size: number;
  sick: boolean;
}

/** A downsampled frame stored in the history ring buffer for scrubbing. */
export interface HistoryFrame {
  tick: number;
  generation: number;
  population: number;
  speciesCount: number;
  /** Population per species id at this moment. */
  speciesPop: Record<number, number>;
  /** Population-weighted mean of every gene. */
  meanGenes: Record<string, number>;
  baseTemp: number;
  globalFoodMul: number;
}

export interface SimStats {
  tick: number;
  generation: number;
  population: number;
  births: number;
  deaths: number;
  speciesCount: number;
  liveSpecies: Species[];
  meanGenes: Record<string, number>;
  /** Genes with the highest cross-population variance ("mutation hotspots"). */
  hotspots: { gene: string; variance: number }[];
  /** Longest-surviving lineages still alive. */
  dynasties: { speciesId: number; ageTicks: number; population: number }[];
  baseTemp: number;
  globalFoodMul: number;
  activeShock: ShockKind | null;
}

/** Full per-frame payload from worker → UI. */
export interface SimSnapshot {
  stats: SimStats;
  dots: CreatureDot[];
  events: EventRecord[];
  history: HistoryFrame[];
  speciesById: Record<number, Species>;
  running: boolean;
  speed: number;
}
