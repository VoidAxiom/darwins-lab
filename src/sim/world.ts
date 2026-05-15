import type { RNG } from "./rng";

export type TerrainKind = "water" | "desert" | "plains" | "forest" | "mountain";

export const TERRAIN_COLORS: Record<TerrainKind, string> = {
  water: "#1c3a5e",
  desert: "#c9a86b",
  plains: "#5a7d3a",
  forest: "#2f5a2f",
  mountain: "#6b6b73",
};

/**
 * The world is a low-resolution grid. Each cell carries a terrain kind, a
 * local temperature offset, a food capacity, and a current food amount that
 * regrows over time. Creatures live in continuous space on top of the grid;
 * the grid is what makes terrain, scarcity, and climate spatial.
 */
export class World {
  readonly cols: number;
  readonly rows: number;
  readonly cellSize: number;

  terrain: Uint8Array; // index into TERRAIN_ORDER
  tempOffset: Float32Array; // per-cell climate offset, [-0.3, 0.3]
  foodCap: Float32Array; // max food a cell can hold
  food: Float32Array; // current food

  /** Global climate state, mutated by seasons and by shock events. */
  baseTemp = 0.5; // [0,1], 0 cold .. 1 hot
  globalFoodMul = 1; // multiplier applied to all regrowth (drought/abundance)

  constructor(cols: number, rows: number, cellSize: number) {
    this.cols = cols;
    this.rows = rows;
    this.cellSize = cellSize;
    const n = cols * rows;
    this.terrain = new Uint8Array(n);
    this.tempOffset = new Float32Array(n);
    this.foodCap = new Float32Array(n);
    this.food = new Float32Array(n);
  }

  get width() {
    return this.cols * this.cellSize;
  }
  get height() {
    return this.rows * this.cellSize;
  }

  idxAt(x: number, y: number): number {
    let cx = Math.floor(x / this.cellSize);
    let cy = Math.floor(y / this.cellSize);
    if (cx < 0) cx = 0;
    else if (cx >= this.cols) cx = this.cols - 1;
    if (cy < 0) cy = 0;
    else if (cy >= this.rows) cy = this.rows - 1;
    return cy * this.cols + cx;
  }

  terrainAt(x: number, y: number): TerrainKind {
    return TERRAIN_ORDER[this.terrain[this.idxAt(x, y)]];
  }

  /** Effective temperature at a point: global climate + local offset. */
  tempAt(x: number, y: number): number {
    const t = this.baseTemp + this.tempOffset[this.idxAt(x, y)];
    return t < 0 ? 0 : t > 1 ? 1 : t;
  }
}

export const TERRAIN_ORDER: TerrainKind[] = [
  "water",
  "desert",
  "plains",
  "forest",
  "mountain",
];
const TERRAIN_INDEX: Record<TerrainKind, number> = {
  water: 0,
  desert: 1,
  plains: 2,
  forest: 3,
  mountain: 4,
};

/** Cheap value-noise field built from a few summed sine octaves + jitter. */
function noiseField(rng: RNG, cols: number, rows: number): Float32Array {
  const field = new Float32Array(cols * rows);
  const octaves = [
    { fx: rng.range(0.03, 0.07), fy: rng.range(0.03, 0.07), amp: 1 },
    { fx: rng.range(0.1, 0.18), fy: rng.range(0.1, 0.18), amp: 0.5 },
    { fx: rng.range(0.25, 0.4), fy: rng.range(0.25, 0.4), amp: 0.25 },
  ];
  const px = rng.range(0, 100);
  const py = rng.range(0, 100);
  let min = Infinity;
  let max = -Infinity;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let v = 0;
      for (const o of octaves) {
        v += o.amp * Math.sin((x + px) * o.fx) * Math.cos((y + py) * o.fy);
      }
      const i = y * cols + x;
      field[i] = v;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  const span = max - min || 1;
  for (let i = 0; i < field.length; i++) field[i] = (field[i] - min) / span;
  return field;
}

/** Generate a fresh world with coherent continents, climate, and food. */
export function generateWorld(
  rng: RNG,
  cols = 160,
  rows = 110,
  cellSize = 6,
): World {
  const world = new World(cols, rows, cellSize);
  const elevation = noiseField(rng, cols, rows);
  const moisture = noiseField(rng, cols, rows);

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const e = elevation[i];
      const m = moisture[i];

      let kind: TerrainKind;
      if (e < 0.32) kind = "water";
      else if (e > 0.82) kind = "mountain";
      else if (m < 0.32) kind = "desert";
      else if (m > 0.62) kind = "forest";
      else kind = "plains";
      world.terrain[i] = TERRAIN_INDEX[kind];

      // Latitude-based climate: poles cold, equator hot, plus elevation cooling.
      const lat = Math.abs(y / rows - 0.5) * 2; // 0 equator .. 1 pole
      world.tempOffset[i] = (0.35 - lat * 0.6 - e * 0.2) * 0.5;

      const cap =
        kind === "forest"
          ? 9
          : kind === "plains"
            ? 6
            : kind === "desert"
              ? 1.5
              : kind === "mountain"
                ? 2
                : 0; // water grows no forage
      world.foodCap[i] = cap;
      world.food[i] = cap * rng.range(0.4, 1);
    }
  }
  return world;
}

/**
 * Regrow food. Forest/plains recover faster; growth scales with how close the
 * local temperature is to a temperate optimum and with the global multiplier
 * (which droughts and ice ages push down). Called every few ticks, not every
 * tick, so it stays cheap on large worlds.
 */
export function regrowFood(world: World, amount: number) {
  const { food, foodCap, cols, rows } = world;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const cap = foodCap[i];
      if (cap <= 0) continue;
      const temp = world.baseTemp + world.tempOffset[i];
      // Bell curve around a temperate optimum (~0.55).
      const climate = Math.exp(-((temp - 0.55) ** 2) / 0.08);
      const grow = amount * climate * world.globalFoodMul;
      const next = food[i] + grow * (1 - food[i] / cap);
      food[i] = next > cap ? cap : next;
    }
  }
}
