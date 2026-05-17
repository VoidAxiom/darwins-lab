import { describe, expect, it } from "vitest";
import { GENE_KEYS } from "./genome";
import { runToCSV, runToJSON } from "./exportRun";
import type { SimSnapshot } from "./types";

describe("exportRun", () => {
  it("exports JSON from snapshot + seed and round-trips", () => {
    const seed = 123456;
    const snapshot = {
      stats: {
        tick: 120,
        generation: 17,
        population: 42,
        births: 8,
        deaths: 1,
        speciesCount: 3,
        liveSpecies: [],
        meanGenes: { speed: 0.3, vision: 0.4 },
        hotspots: [],
        dynasties: [],
        baseTemp: 0.78,
        globalFoodMul: 1.2,
        activeShock: null,
      },
      dots: [],
      events: [{ tick: 10, generation: 3, kind: "extinction", text: "minor extinction" }],
      history: [
        {
          tick: 0,
          generation: 1,
          population: 11,
          speciesCount: 2,
          speciesPop: { 1: 6, 2: 5 },
          meanGenes: { speed: 0.1, vision: 0.2 },
          baseTemp: 0.6,
          globalFoodMul: 0.9,
        },
      ],
      speciesById: {},
      worldMeta: {
        cols: 1,
        rows: 1,
        cellSize: 1,
        terrain: new Uint8Array(),
        foodCap: new Float32Array(),
        food: new Float32Array(),
      },
      running: true,
      speed: 4,
    } as SimSnapshot;

    const out = runToJSON(snapshot, seed);
    const parsed = JSON.parse(out);
    expect(parsed.seed).toBe(seed);
    expect(parsed.tick).toBe(snapshot.stats.tick);
    expect(parsed.generation).toBe(snapshot.stats.generation);
    expect(parsed.stats).toEqual(snapshot.stats);
    expect(parsed.history).toEqual(snapshot.history);
    expect(parsed.events).toEqual(snapshot.events);
  });

  it("exports CSV with stable headers and expected row data", () => {
    const history = [
      {
        tick: 0,
        generation: 1,
        population: 5,
        speciesCount: 2,
        speciesPop: { 1: 3, 2: 2 },
        meanGenes: Object.fromEntries(GENE_KEYS.map((k, i) => [k, i + 0.1])) as Record<string, number>,
        baseTemp: 0.11,
        globalFoodMul: 0.9,
      },
      {
        tick: 10,
        generation: 2,
        population: 6,
        speciesCount: 3,
        speciesPop: { 1: 2, 2: 4 },
        meanGenes: {
          ...Object.fromEntries(GENE_KEYS.map((k, i) => [k, i + 1.1])),
          speed: 10,
          vision: 11,
        },
        baseTemp: 0.22,
        globalFoodMul: 1.1,
      },
    ] as any[];

    const csv = runToCSV(history);
    const lines = csv.split("\n");
    const header = `tick,generation,population,speciesCount,baseTemp,globalFoodMul,${GENE_KEYS.map((k) => `gene_${k}`).join(",")}`;

    expect(lines[0]).toBe(header);
    expect(lines).toHaveLength(history.length + 1);

    const firstData = lines[1].split(",");
    expect(firstData[0]).toBe(String(history[0].tick));
    expect(firstData[1]).toBe(String(history[0].generation));
    expect(firstData[2]).toBe(String(history[0].population));
    expect(firstData[3]).toBe(String(history[0].speciesCount));
    expect(firstData[4]).toBe(String(history[0].baseTemp));
    expect(firstData[5]).toBe(String(history[0].globalFoodMul));
    GENE_KEYS.forEach((gene, i) => {
      expect(firstData[6 + i]).toBe(String(history[0].meanGenes[gene]));
    });
  });

  it("returns only header for empty history", () => {
    const header = `tick,generation,population,speciesCount,baseTemp,globalFoodMul,${GENE_KEYS.map((k) => `gene_${k}`).join(",")}`;
    expect(runToCSV([])).toBe(header);
  });
});
