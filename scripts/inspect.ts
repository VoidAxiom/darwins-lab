/**
 * Inspection harness — the agent's feedback loop.
 *
 *   npm run inspect -- [ticks] [frames]
 *
 * Runs the simulation, captures PNG snapshots at regular intervals into
 * `inspect/`, and writes `inspect/report.json` + a console digest covering
 * population, speciation, gene drift, throughput, and event highlights. Read
 * the PNGs to visually judge clustering/colour/density; read the digest to
 * judge ecological balance; then tune and rerun.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { encodePNG } from "./lib/png";
import { renderFrame } from "./lib/render";
import { SHOCK_LABELS } from "../src/sim/events";
import { Simulation } from "../src/sim/simulation";
import type { ShockKind } from "../src/sim/types";

const TICKS = Number(process.argv[2] ?? 24000);
const FRAMES = Number(process.argv[3] ?? 8);
const SEED = Number(process.argv[4] ?? 1337);
const OUT = join(process.cwd(), "inspect");
mkdirSync(OUT, { recursive: true });

// A scripted "story" so every run exercises shocks and recovery.
const SHOCKS: { at: number; kind: ShockKind }[] = [
  { at: Math.floor(TICKS * 0.3), kind: "drought" },
  { at: Math.floor(TICKS * 0.5), kind: "plague" },
  { at: Math.floor(TICKS * 0.68), kind: "asteroid" },
  { at: Math.floor(TICKS * 0.85), kind: "predatorInvasion" },
];

const sim = new Simulation({ seed: SEED });
const frameAt = new Set(
  Array.from({ length: FRAMES }, (_, i) => Math.floor(((i + 1) * TICKS) / FRAMES) - 1),
);

interface Sample {
  tick: number;
  generation: number;
  population: number;
  species: number;
  baseTemp: number;
  foodMul: number;
  topClan: number;
  topClanPop: number;
  meanGenes: Record<string, number>;
}
const samples: Sample[] = [];
let frameIdx = 0;
const t0 = Date.now();

for (let i = 0; i < TICKS; i++) {
  for (const s of SHOCKS) if (s.at === i) sim.shock(s.kind);
  sim.step();

  if (i % 1000 === 0 || frameAt.has(i)) {
    const st = sim.snapshot(true, 1).stats;
    samples.push({
      tick: st.tick,
      generation: st.generation,
      population: st.population,
      species: st.speciesCount,
      baseTemp: +st.baseTemp.toFixed(3),
      foodMul: +st.globalFoodMul.toFixed(3),
      topClan: st.liveSpecies[0]?.id ?? -1,
      topClanPop: st.liveSpecies[0]?.population ?? 0,
      meanGenes: Object.fromEntries(
        Object.entries(st.meanGenes).map(([k, v]) => [k, +v.toFixed(3)]),
      ),
    });
  }

  if (frameAt.has(i)) {
    const { buf, width, height } = renderFrame(sim, { scale: 1, legendH: 46 });
    const png = encodePNG(buf, width, height);
    const name = `frame-${String(frameIdx).padStart(2, "0")}-t${i}.png`;
    writeFileSync(join(OUT, name), png);
    frameIdx++;
  }

  if (sim.creatures.length === 0) {
    console.log(`\n!! EXTINCTION at tick ${i} (gen ${sim.generation}) — world collapsed.`);
    break;
  }
}

const dt = Date.now() - t0;
const tps = Math.round((sim.tick / dt) * 1000);
const report = {
  seed: SEED,
  ticks: sim.tick,
  wallMs: dt,
  ticksPerSec: tps,
  finalPopulation: sim.creatures.length,
  finalSpecies: sim.species.liveSpecies().length,
  finalGeneration: sim.generation,
  shocks: SHOCKS.map((s) => ({ ...s, label: SHOCK_LABELS[s.kind] })),
  samples,
  events: sim.events.slice(-40),
};
writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2));

console.log(`\n=== Darwin's Lab inspection (seed ${SEED}) ===`);
console.log(`ran ${sim.tick} ticks in ${dt}ms → ${tps} ticks/s`);
console.log(
  `final: pop ${sim.creatures.length}, species ${report.finalSpecies}, generation ${sim.generation}`,
);
console.log("\ntick    gen   pop   spp  temp  food  topClan");
for (const s of samples.filter((_, idx) => idx % 2 === 0)) {
  console.log(
    `${String(s.tick).padStart(6)} ${String(s.generation).padStart(5)} ` +
      `${String(s.population).padStart(5)} ${String(s.species).padStart(4)} ` +
      `${s.baseTemp.toFixed(2)} ${s.foodMul.toFixed(2)}  #${s.topClan}(${s.topClanPop})`,
  );
}
console.log("\nlast events:");
for (const e of report.events.slice(-10)) console.log(`  [${e.kind}] ${e.text}`);
console.log(`\nframes + report written to ${OUT}/`);
