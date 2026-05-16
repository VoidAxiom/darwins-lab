import { DEFAULT_CONFIG, type SimConfig } from "./config";
import { type ActiveShock, SHOCK_LABELS, triggerShock } from "./events";
import { type Genome, mutate, randomGenome, recombine } from "./genome";
import { HistoryBuffer } from "./history";
import { RNG } from "./rng";
import { SpatialGrid } from "./spatial";
import { SpeciesManager } from "./speciation";
import { computeStats } from "./stats";
import type {
  CreatureDot,
  EventRecord,
  HistoryFrame,
  ShockKind,
  SimSnapshot,
  SimStats,
} from "./types";
import type { Creature } from "./types";
import { generateWorld, regrowFood, type World } from "./world";

/** Compact birth record retained for ancestry/genealogy inspection. */
interface AncestryRecord {
  id: number;
  parentId: number | null;
  speciesId: number;
  generation: number;
  bornTick: number;
  diedTick?: number;
  genome: Genome;
}

const ANCESTRY_LIMIT = 24000;

export class Simulation {
  config: SimConfig;
  world: World;
  rng: RNG;
  creatures: Creature[] = [];
  species: SpeciesManager;
  history: HistoryBuffer;
  events: EventRecord[] = [];

  tick = 0;
  /** Deepest lineage depth reached — the meaningful "generation" counter. */
  generation = 0;

  private nextId = 1;
  private births = 0;
  private deaths = 0;
  private grid: SpatialGrid;
  /** Reused neighbour-query buffer to keep the per-tick loop allocation-free. */
  private scratch: Creature[] = [];
  private activeShock: ActiveShock | null = null;
  private ancestry = new Map<number, AncestryRecord>();
  private lastPopForBottleneck = 0;

  constructor(config: Partial<SimConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.rng = new RNG(this.config.seed);
    this.world = generateWorld(this.rng, this.config.cols, this.config.rows, this.config.cellSize);
    this.species = new SpeciesManager(this.config.speciationThreshold, 9);
    this.history = new HistoryBuffer();
    this.grid = new SpatialGrid(this.world.width, this.world.height, 56);
    this.spawnFounders();
  }

  // --- setup -------------------------------------------------------------

  private spawnFounders() {
    for (let i = 0; i < this.config.founders; i++) {
      const x = this.rng.range(0, this.world.width);
      const y = this.rng.range(0, this.world.height);
      // Drop founders on land only — water has no forage.
      if (this.world.terrainAt(x, y) === "water") {
        i--;
        continue;
      }
      const genome = randomGenome(this.rng);
      this.creatures.push(this.makeCreature(genome, x, y, null, 0));
    }
    const id = this.species.seed(this.creatures, 0);
    this.log("dynasty", `Generation 0: life takes hold — ${this.creatures.length} founders of clan #${id}.`);
    this.lastPopForBottleneck = this.creatures.length;
  }

  private makeCreature(
    genome: Genome,
    x: number,
    y: number,
    parentId: number | null,
    generation: number,
  ): Creature {
    const id = this.nextId++;
    const c: Creature = {
      id,
      parentId,
      speciesId: 0,
      generation,
      bornTick: this.tick,
      x,
      y,
      heading: this.rng.range(0, Math.PI * 2),
      energy: 40 + genome.offspringInvestment * 40,
      age: 0,
      genome,
      memX: 0,
      memY: 0,
      memStrength: 0,
      sick: 0,
    };
    this.recordAncestry(c);
    if (generation > this.generation) this.generation = generation;
    return c;
  }

  private recordAncestry(c: Creature) {
    this.ancestry.set(c.id, {
      id: c.id,
      parentId: c.parentId,
      speciesId: c.speciesId,
      generation: c.generation,
      bornTick: c.bornTick,
      genome: { ...c.genome },
    });
    if (this.ancestry.size > ANCESTRY_LIMIT) this.pruneAncestry();
  }

  /** Drop the oldest dead records once the genealogy grows too large. */
  private pruneAncestry() {
    const alive = new Set(this.creatures.map((c) => c.id));
    const dead = [...this.ancestry.values()]
      .filter((r) => !alive.has(r.id))
      .sort((a, b) => a.bornTick - b.bornTick);
    let toRemove = this.ancestry.size - Math.floor(ANCESTRY_LIMIT * 0.75);
    for (const r of dead) {
      if (toRemove-- <= 0) break;
      this.ancestry.delete(r.id);
    }
  }

  // --- main loop ---------------------------------------------------------

  step() {
    this.tick++;
    const w = this.world;

    this.applySeasons();
    if (this.activeShock) {
      this.activeShock.apply(w);
      if (--this.activeShock.ticksLeft <= 0) {
        this.log("shock", `Tick ${this.tick}: the ${SHOCK_LABELS[this.activeShock.kind]} subsides.`);
        this.activeShock = null;
      }
    }

    // Rebuild the neighbour index for this tick.
    this.grid.clear();
    for (const c of this.creatures) this.grid.insert(c);

    const newborns: Creature[] = [];
    for (let i = this.creatures.length - 1; i >= 0; i--) {
      const c = this.creatures[i];
      const survived = this.updateCreature(c, newborns);
      if (!survived) {
        const rec = this.ancestry.get(c.id);
        if (rec) rec.diedTick = this.tick;
        this.creatures.splice(i, 1);
        this.deaths++;
      }
    }
    for (const c of newborns) {
      c.id = this.nextId++;
      this.recordAncestry(c);
      this.creatures.push(c);
    }

    // Capacity culling involves an O(n log n) sort; only the rare overshoot
    // matters, so amortise it over a few ticks instead of every tick.
    if (this.tick % 3 === 0) this.enforceCapacity();

    if (this.tick % this.config.regrowEvery === 0) {
      regrowFood(w, 0.078 * this.config.regrowEvery);
    }
    if (this.tick % this.config.reclusterEvery === 0) {
      const created = this.species.recluster(this.creatures, this.tick, this.rng);
      this.detectMacroEvents(created);
    }
    if (this.tick % this.config.historyEvery === 0) {
      this.pushHistory();
    }
  }

  /** Returns false if the creature died this tick. */
  private updateCreature(c: Creature, newborns: Creature[]): boolean {
    const w = this.world;
    const g = c.genome;
    c.age++;

    const visionR = 8 + g.vision * 46;
    const speed = 0.4 + g.speed * 2.6;
    const isCarn = g.diet > 0.55;

    // --- sense surroundings ---
    let targetX = c.x + Math.cos(c.heading);
    let targetY = c.y + Math.sin(c.heading);
    let threatDist = Infinity;
    let preyDist = Infinity;
    let mate: Creature | null = null;
    let preyRef: Creature | null = null;

    let crowding = 0;
    // Allocation-free neighbour scan (hot path: once per creature per tick).
    const m = this.grid.query(c.x, c.y, visionR, this.scratch);
    const visR2 = visionR * visionR;
    for (let qi = 0; qi < m; qi++) {
      const o = this.scratch[qi];
      if (o === c) continue;
      const dx = o.x - c.x;
      const dy = o.y - c.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > visR2) continue;
      const d = Math.sqrt(d2) || 1;
      if (d < 18) crowding++;
      const oCarn = o.genome.diet > 0.55;

      if (oCarn && o.genome.size >= g.size * 0.85 && d < threatDist) {
        // A predator big enough to matter. Most prey flee — but a big,
        // aggressive creature may instead stand its ground and fight back,
        // which is what makes aggression a real (costly) strategy under
        // predation rather than neutral drift.
        threatDist = d;
        const stand = g.aggression * g.size;
        if (stand < 0.32 || this.rng.next() > stand) {
          targetX = c.x - dx;
          targetY = c.y - dy;
        }
      }
      if (isCarn && o.genome.diet < 0.5 && d < preyDist) {
        preyDist = d;
        preyRef = o;
      }
      if (
        !mate &&
        o.speciesId === c.speciesId &&
        o.energy > o.genome.reproduction * 85 &&
        c.energy > g.reproduction * 85
      ) {
        mate = o;
      }
    }

    if (isCarn && preyRef && threatDist === Infinity) {
      targetX = (preyRef as Creature).x;
      targetY = (preyRef as Creature).y;
    } else if (threatDist === Infinity && c.memStrength > 0) {
      // No food/threat in sight — head for remembered forage.
      targetX = c.memX;
      targetY = c.memY;
    } else if (threatDist === Infinity && !isCarn) {
      // Climb the local food gradient toward the richest nearby cell. If the
      // neighbourhood is uniformly grazed/lush there is no gradient, so pick
      // a medium-range wander goal and commit to it (cheap + disperses the
      // population instead of pinning it against the map edges).
      const best = this.bestFoodDir(c, visionR);
      if (best) {
        targetX = best.x;
        targetY = best.y;
      } else {
        const a = this.rng.range(0, Math.PI * 2);
        const r = this.rng.range(40, 120);
        c.memX = Math.min(w.width - 1, Math.max(0, c.x + Math.cos(a) * r));
        c.memY = Math.min(w.height - 1, Math.max(0, c.y + Math.sin(a) * r));
        c.memStrength = 60;
        targetX = c.memX;
        targetY = c.memY;
      }
    }

    // --- move (with momentum so paths look organic) ---
    const desired = Math.atan2(targetY - c.y, targetX - c.x);
    let dh = desired - c.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    c.heading += dh * 0.35 + this.rng.gaussian(0, 0.08);
    let nx = c.x + Math.cos(c.heading) * speed;
    let ny = c.y + Math.sin(c.heading) * speed;
    // Turn away from world edges and open water with a randomized heading so
    // creatures don't get trapped sliding along a coastline forever.
    if (nx < 0 || nx >= w.width || w.terrainAt(nx, c.y) === "water") {
      c.heading = Math.PI - c.heading + this.rng.gaussian(0, 0.6);
      c.memStrength = 0; // abandon any goal that led into the wall
      nx = c.x;
    }
    if (ny < 0 || ny >= w.height || w.terrainAt(nx, ny) === "water") {
      c.heading = -c.heading + this.rng.gaussian(0, 0.6);
      c.memStrength = 0;
      ny = c.y;
    }
    c.x = Math.min(w.width - 0.01, Math.max(0, nx));
    c.y = Math.min(w.height - 0.01, Math.max(0, ny));

    // --- energetics ---
    const climateMiss = Math.abs(w.tempAt(c.x, c.y) - g.tempPreference);
    const burn =
      0.05 +
      g.metabolism * 0.16 +
      g.speed * 0.05 +
      g.size * 0.06 +
      g.aggression * 0.035 + // aggression is metabolically expensive to keep
      climateMiss * 0.14 +
      (c.sick > 0 ? 0.12 : 0);
    c.energy -= burn;

    // --- feeding ---
    if (!isCarn) {
      const fi = w.idxAt(c.x, c.y);
      const avail = w.food[fi];
      if (avail > 0.05) {
        // In a crowded patch the more aggressive creature wins the scrum and
        // takes a bigger bite — aggression's payoff when food is contested.
        const contest = crowding > 2 ? 0.55 + g.aggression * 0.6 : 1;
        const bite = Math.min(avail, (0.6 + g.size * 0.5) * contest);
        w.food[fi] -= bite;
        c.energy += bite * (1 - g.diet) * 1.75;
        c.memX = c.x;
        c.memY = c.y;
        c.memStrength = 40 + g.memory * 220;
      }
    }
    if (c.memStrength > 0) c.memStrength -= 1;

    // --- predation ---
    if (isCarn && preyRef && preyDist < 6) {
      const prey = preyRef as Creature;
      const atk = g.aggression * 0.6 + g.size * 0.4 + g.speed * 0.2;
      const def =
        prey.genome.camouflage * 0.7 +
        prey.genome.speed * 0.3 +
        prey.genome.size * 0.2 +
        prey.genome.aggression * prey.genome.size * 0.5; // fights back
      if (this.rng.next() < atk / (atk + def + 0.15)) {
        c.energy += 22 + prey.genome.size * 26 + prey.energy * 0.3;
        prey.energy = -1; // marked dead; removed when its turn comes
      } else {
        // A failed strike on a big, aggressive defender wounds the predator.
        c.energy -= 6 + prey.genome.aggression * prey.genome.size * 22;
      }
    }

    // --- disease ---
    // sick > 0 : infected (counts down).  sick < 0 : recovered & immune
    // (counts back up toward 0, i.e. immunity wanes). Immunity is what lets a
    // plague burn through, cull the weak, then actually subside.
    if (c.sick > 0) {
      c.sick--;
      if (c.sick === 0) c.sick = -this.rng.int(700, 1400); // recover → immune
      else if (this.rng.chance(0.012)) c.sick = -900; // early recovery
      else if (this.rng.chance(0.0016)) return false; // died of the disease
      if (c.sick > 0 && this.rng.chance(0.025)) {
        this.grid.forNeighbors(c.x, c.y, 13, (o) => {
          if (o.sick === 0 && this.rng.chance(0.05 * (1 - o.genome.metabolism * 0.55))) {
            o.sick = this.rng.int(120, 240);
          }
        });
      }
    } else if (c.sick < 0) {
      c.sick++; // immunity slowly wanes back to susceptible
    }

    // --- reproduction ---
    const reproCost = 22 + g.offspringInvestment * 34;
    // Density-dependent breeding: crowding suppresses reproduction, which
    // gives the world a real ecological carrying capacity well below the hard
    // cap, so population breathes (booms, busts, recoveries) instead of
    // flat-lining at the ceiling.
    const reproChance = 0.05 * (1 - Math.min(1, crowding / 12)) ** 1.5;
    if (
      c.energy > g.reproduction * 80 + reproCost &&
      c.age > 40 &&
      c.sick <= 0 &&
      this.rng.chance(reproChance) &&
      this.creatures.length + newborns.length < this.config.capacity
    ) {
      c.energy -= reproCost;
      let childGenome: Genome;
      if (mate && g.cooperation > 0.45) {
        childGenome = recombine(
          g,
          (mate as Creature).genome,
          this.rng,
          this.config.mutationRate,
          this.config.mutationMagnitude,
        );
      } else {
        childGenome = mutate(g, this.rng, this.config.mutationRate, this.config.mutationMagnitude);
      }
      const child = this.makeCreature(
        childGenome,
        c.x + this.rng.gaussian(0, 4),
        c.y + this.rng.gaussian(0, 4),
        c.id,
        c.generation + 1,
      );
      child.speciesId = c.speciesId;
      child.energy = reproCost + childGenome.offspringInvestment * 20;
      newborns.push(child);
      this.births++;
    }

    // --- mortality ---
    // Shorter lifespans → faster generational turnover → more visible
    // evolution per tick (thousands of generations in a sitting).
    const maxAge = 480 + (1 - g.metabolism) * 950;
    if (c.energy <= 0) return false;
    if (c.age > maxAge) return false;
    if (c.age > maxAge * 0.55 && this.rng.chance(0.0022)) return false;
    return true;
  }

  /** Direction of the richest food cell within vision (herbivore foraging). */
  private bestFoodDir(c: Creature, visionR: number): { x: number; y: number } | null {
    const w = this.world;
    const step = w.cellSize;
    let bestVal = w.food[w.idxAt(c.x, c.y)];
    let bx = 0;
    let by = 0;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 3) {
      for (let r = step; r <= visionR; r += step * 2.5) {
        const sx = c.x + Math.cos(a) * r;
        const sy = c.y + Math.sin(a) * r;
        if (sx < 0 || sy < 0 || sx >= w.width || sy >= w.height) continue;
        const v = w.food[w.idxAt(sx, sy)];
        if (v > bestVal) {
          bestVal = v;
          bx = sx;
          by = sy;
        }
      }
    }
    return bestVal > 0.1 && (bx || by) ? { x: bx, y: by } : null;
  }

  /** Scarcity: beyond capacity, the lowest-energy creatures starve out. */
  private enforceCapacity() {
    const over = this.creatures.length - this.config.capacity;
    if (over <= 0) return;
    this.creatures.sort((a, b) => a.energy - b.energy);
    for (let i = 0; i < over; i++) {
      const rec = this.ancestry.get(this.creatures[i].id);
      if (rec) rec.diedTick = this.tick;
      this.deaths++;
    }
    this.creatures.splice(0, over);
  }

  /** Gentle seasonal temperature cycle + relaxation back to baseline. */
  private applySeasons() {
    if (this.activeShock) return;
    const phase = (this.tick % this.config.seasonLength) / this.config.seasonLength;
    const seasonal = 0.5 + Math.sin(phase * Math.PI * 2) * 0.12;
    this.world.baseTemp += (seasonal - this.world.baseTemp) * 0.01;
    this.world.globalFoodMul += (1 - this.world.globalFoodMul) * 0.01;
  }

  // --- events ------------------------------------------------------------

  private detectMacroEvents(createdSpecies: number[]) {
    for (const id of createdSpecies) {
      const sp = this.species.species.get(id);
      if (!sp) continue;
      this.log(
        "speciation",
        `Generation ${this.generation}: a new clan #${id} splits off from #${sp.parentId ?? "—"} (${sp.population} individuals).`,
        { speciesId: id },
      );
    }

    const pop = this.creatures.length;
    if (
      this.lastPopForBottleneck > 120 &&
      pop < this.lastPopForBottleneck * 0.45
    ) {
      this.log(
        "bottleneck",
        `Generation ${this.generation}: population crashes from ${this.lastPopForBottleneck} to ${pop} — a severe bottleneck.`,
      );
    }
    this.lastPopForBottleneck = pop;

    // Newly extinct species since last check.
    for (const sp of this.species.species.values()) {
      if (sp.extinctTick === this.tick && sp.peakPopulation > 6) {
        this.log(
          "extinction",
          `Generation ${this.generation}: clan #${sp.id} goes extinct after peaking at ${sp.peakPopulation}.`,
          { speciesId: sp.id },
        );
      }
    }

    if (pop === 0) {
      this.log("collapse", `Generation ${this.generation}: total collapse — the world is barren.`);
    }
  }

  private log(kind: EventRecord["kind"], text: string, extra: Partial<EventRecord> = {}) {
    this.events.push({
      tick: this.tick,
      generation: this.generation,
      kind,
      text,
      ...extra,
    });
    if (this.events.length > 600) this.events.splice(0, this.events.length - 600);
  }

  private pushHistory() {
    const stats = this.snapshotStats();
    const speciesPop: Record<number, number> = {};
    for (const s of this.species.liveSpecies()) speciesPop[s.id] = s.population;
    const frame: HistoryFrame = {
      tick: this.tick,
      generation: this.generation,
      population: stats.population,
      speciesCount: stats.speciesCount,
      speciesPop,
      meanGenes: stats.meanGenes,
      baseTemp: this.world.baseTemp,
      globalFoodMul: this.world.globalFoodMul,
    };
    this.history.push(frame);
  }

  // --- external API ------------------------------------------------------

  /** Fire a mass-extinction shock; adopts any creatures the shock injects. */
  shock(kind: ShockKind) {
    const before = this.creatures.length;
    const result = triggerShock(kind, this.world, this.creatures, this.rng);
    for (const c of this.creatures) {
      if (c.id === -1) {
        c.id = this.nextId++;
        c.bornTick = this.tick;
        this.recordAncestry(c);
      }
    }
    if (result) this.activeShock = result;
    this.log(
      "shock",
      `Generation ${this.generation}: ${SHOCK_LABELS[kind]} strikes (population ${before} → ${this.creatures.length}).`,
      { shock: kind },
    );
  }

  private snapshotStats(): SimStats {
    return computeStats(
      this.creatures,
      this.species,
      this.world,
      this.tick,
      this.generation,
      this.births,
      this.deaths,
      this.activeShock?.kind ?? null,
    );
  }

  /** Build the wire payload for the UI. Dots are downsampled if very dense. */
  snapshot(running: boolean, speed: number): SimSnapshot {
    const cap = 2200;
    const stride = this.creatures.length > cap ? Math.ceil(this.creatures.length / cap) : 1;
    const dots: CreatureDot[] = [];
    for (let i = 0; i < this.creatures.length; i += stride) {
      const c = this.creatures[i];
      dots.push({
        id: c.id,
        x: c.x,
        y: c.y,
        speciesId: c.speciesId,
        energy: c.energy,
        size: c.genome.size,
        sick: c.sick > 0,
      });
    }
    return {
      stats: this.snapshotStats(),
      dots,
      events: this.events.slice(-120),
      history: this.history.all(),
      speciesById: this.species.asRecord(),
      worldMeta: {
        cols: this.world.cols,
        rows: this.world.rows,
        cellSize: this.world.cellSize,
        terrain: this.world.terrain,
        foodCap: this.world.foodCap,
        food: this.world.food,
      },
      running,
      speed,
    };
  }

  /** Walk the parent chain for the genealogy view (bounded by pruning). */
  getAncestry(id: number): AncestryRecord[] {
    const chain: AncestryRecord[] = [];
    let cur: number | null = id;
    let guard = 0;
    while (cur != null && guard++ < 200) {
      const rec = this.ancestry.get(cur);
      if (!rec) break;
      chain.push(rec);
      cur = rec.parentId;
    }
    return chain;
  }

  getCreature(id: number): Creature | undefined {
    return this.creatures.find((c) => c.id === id);
  }

  resetCounters() {
    this.births = 0;
    this.deaths = 0;
  }
}
