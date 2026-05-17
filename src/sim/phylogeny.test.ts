import { describe, expect, it } from "vitest";
import { computePhylogeny } from "./phylogeny";
import type { Species } from "./types";

describe("computePhylogeny", () => {
  const species = (values: Partial<Species>): Species => ({
    id: values.id ?? 1,
    parentId: values.parentId ?? null,
    color: values.color ?? "#000000",
    centroid: values.centroid ?? ({} as any),
    bornTick: values.bornTick ?? 0,
    population: values.population ?? 10,
    peakPopulation: values.peakPopulation ?? 10,
    ...values,
  });

  it("returns empty layout for empty input", () => {
    const result = computePhylogeny({}, 1234);

    expect(result.nodes).toEqual([]);
    expect(result.links).toEqual([]);
    expect(result.rows).toBe(1);
    expect(result.t0).toBe(0);
  });

  it("filters out species with peakPopulation below minPeak", () => {
    const speciesById: Record<number, Species> = {
      1: species({ id: 1, parentId: null, peakPopulation: 5 }),
      2: species({ id: 2, parentId: 1, peakPopulation: 9 }),
      3: species({ id: 3, parentId: 1, peakPopulation: 11 }),
    };

    const result = computePhylogeny(speciesById, 100, { minPeak: 10 });

    const ids = result.nodes.map((n) => n.id);
    expect(ids).toEqual([3]);
  });

  it("relinks through pruned intermediates to nearest kept ancestor", () => {
    const speciesById: Record<number, Species> = {
      1: species({ id: 1, parentId: null, peakPopulation: 20 }),
      2: species({ id: 2, parentId: 1, peakPopulation: 4 }),
      3: species({ id: 3, parentId: 2, peakPopulation: 30 }),
    };

    const result = computePhylogeny(speciesById, 100, { minPeak: 10 });
    const keptNode = result.nodes.find((n) => n.id === 3);

    expect(keptNode?.parentId).toBe(1);

    const linksForNode = result.links.filter((l) => l.child.id === 3);
    expect(linksForNode).toHaveLength(1);
    expect(linksForNode[0]?.parent.id).toBe(1);
  });

  it("sets alive false when extinctTick is present", () => {
    const speciesById: Record<number, Species> = {
      1: species({
        id: 1,
        parentId: null,
        peakPopulation: 20,
        extinctTick: 3,
        population: 8,
      }),
      2: species({
        id: 2,
        parentId: 1,
        peakPopulation: 20,
        extinctTick: undefined,
        population: 12,
      }),
    };

    const result = computePhylogeny(speciesById, 50);
    const extinct = result.nodes.find((n) => n.id === 1);
    const alive = result.nodes.find((n) => n.id === 2);

    expect(extinct?.alive).toBe(false);
    expect(extinct?.endTick).toBe(3);
    expect(alive?.alive).toBe(true);
    expect(alive?.endTick).toBe(50);
  });

  it("keeps the most significant lineages when maxNodes is hit", () => {
    const speciesById: Record<number, Species> = {
      1: species({ id: 1, peakPopulation: 5 }),
      2: species({ id: 2, peakPopulation: 50 }),
      3: species({ id: 3, peakPopulation: 30 }),
      4: species({ id: 4, peakPopulation: 20 }),
      5: species({ id: 5, peakPopulation: 15 }),
      6: species({ id: 6, peakPopulation: 10 }),
    };

    const result = computePhylogeny(speciesById, 20, {
      minPeak: 0,
      maxNodes: 3,
    });

    const ids = new Set(result.nodes.map((n) => n.id));
    expect(result.nodes).toHaveLength(3);
    expect(ids.has(2)).toBe(true);
    expect(ids.has(3)).toBe(true);
    expect(ids.has(4)).toBe(true);
  });

  it("assigns unique rows and computes t0 with bornTick bounds", () => {
    const speciesById: Record<number, Species> = {
      1: species({ id: 1, parentId: null, bornTick: 10, peakPopulation: 100 }),
      2: species({ id: 2, parentId: 1, bornTick: 0, peakPopulation: 90 }),
      3: species({ id: 3, parentId: 1, bornTick: 5, peakPopulation: 80 }),
      4: species({ id: 4, parentId: 2, bornTick: -5, peakPopulation: 70 }),
    };

    const result = computePhylogeny(speciesById, 20, { minPeak: 0 });

    const rows = result.nodes.map((n) => n.row);
    const uniqueRows = new Set(rows);
    expect(uniqueRows.size).toBe(result.nodes.length);
    expect(result.rows).toBe(result.nodes.length);
    expect(result.t0).toBeLessThanOrEqual(-5);
  });
});
