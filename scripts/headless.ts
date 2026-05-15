/**
 * Headless soak test: run the simulation for many thousands of ticks with no
 * UI and print periodic vitals. Used to sanity-check that populations don't
 * trivially die out or explode, and that speciation actually happens.
 *
 *   npm run sim:headless
 */
import { Simulation } from "../src/sim/simulation";

const sim = new Simulation({ seed: 1337 });
const TICKS = Number(process.argv[2] ?? 30000);

const t0 = Date.now();
for (let i = 0; i < TICKS; i++) {
  sim.step();
  if (i === 8000) sim.shock("drought");
  if (i === 16000) sim.shock("asteroid");
  if (i === 22000) sim.shock("predatorInvasion");
  if (i % 2000 === 0) {
    const s = sim.snapshot(true, 1).stats;
    const top = s.liveSpecies[0];
    console.log(
      `tick ${String(s.tick).padStart(6)} | gen ${String(s.generation).padStart(4)} | ` +
        `pop ${String(s.population).padStart(5)} | species ${String(s.speciesCount).padStart(3)} | ` +
        `temp ${s.baseTemp.toFixed(2)} food× ${s.globalFoodMul.toFixed(2)} | ` +
        `dominant clan #${top?.id ?? "—"} (${top?.population ?? 0})`,
    );
  }
}
const dt = Date.now() - t0;
const final = sim.snapshot(true, 1).stats;
console.log("\n--- summary ---");
console.log(`ran ${TICKS} ticks in ${dt}ms (${((TICKS / dt) * 1000) | 0} ticks/s)`);
console.log(`final population ${final.population}, species ${final.speciesCount}, generation ${final.generation}`);
console.log(`recorded ${sim.events.length} events; last few:`);
for (const e of sim.events.slice(-6)) console.log(`  [${e.kind}] ${e.text}`);
