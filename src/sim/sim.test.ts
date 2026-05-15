import { describe, expect, it } from "vitest";
import { genomeDistance, meanGenome, mutate, randomGenome } from "./genome";
import { RNG } from "./rng";
import { Simulation } from "./simulation";

describe("RNG", () => {
  it("is deterministic for a given seed", () => {
    const a = new RNG(42);
    const b = new RNG(42);
    const seqA = Array.from({ length: 50 }, () => a.next());
    const seqB = Array.from({ length: 50 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("stays within [0, 1)", () => {
    const r = new RNG(7);
    for (let i = 0; i < 10000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("genome", () => {
  it("mutate keeps every gene in [0, 1]", () => {
    const r = new RNG(1);
    let g = randomGenome(r);
    for (let i = 0; i < 500; i++) {
      g = mutate(g, r, 0.5, 0.2);
      for (const v of Object.values(g)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it("distance is zero to self and positive to a mutant", () => {
    const r = new RNG(2);
    const g = randomGenome(r);
    expect(genomeDistance(g, g)).toBe(0);
    expect(genomeDistance(g, mutate(g, r, 1, 0.3))).toBeGreaterThan(0);
  });

  it("meanGenome averages component-wise", () => {
    const r = new RNG(3);
    const gs = [randomGenome(r), randomGenome(r), randomGenome(r)];
    const m = meanGenome(gs);
    for (const k of Object.keys(m) as (keyof typeof m)[]) {
      const avg = (gs[0][k] + gs[1][k] + gs[2][k]) / 3;
      expect(m[k]).toBeCloseTo(avg, 10);
    }
  });
});

describe("Simulation", () => {
  it("is reproducible: same seed → identical trajectory", () => {
    const run = () => {
      const s = new Simulation({ seed: 99 });
      for (let i = 0; i < 1500; i++) s.step();
      const st = s.snapshot(true, 1).stats;
      return { pop: st.population, species: st.speciesCount, gen: st.generation };
    };
    expect(run()).toEqual(run());
  });

  it("sustains a population and speciates over a long run", () => {
    const s = new Simulation({ seed: 1337 });
    for (let i = 0; i < 12000; i++) s.step();
    const st = s.snapshot(true, 1).stats;
    expect(st.population).toBeGreaterThan(20);
    expect(st.speciesCount).toBeGreaterThanOrEqual(1);
    expect(st.generation).toBeGreaterThan(5);
  });

  it("a shock measurably perturbs the world", () => {
    const s = new Simulation({ seed: 5 });
    for (let i = 0; i < 3000; i++) s.step();
    const before = s.creatures.length;
    s.shock("asteroid");
    expect(s.creatures.length).toBeLessThan(before);
    expect(s.events.some((e) => e.shock === "asteroid")).toBe(true);
  });

  it("ancestry chains back to a founder", () => {
    const s = new Simulation({ seed: 8 });
    for (let i = 0; i < 2000; i++) s.step();
    const someone = s.creatures[s.creatures.length - 1];
    const chain = s.getAncestry(someone.id);
    expect(chain.length).toBeGreaterThan(0);
    expect(chain[0].id).toBe(someone.id);
  });
});
