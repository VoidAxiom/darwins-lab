import type { RNG } from "./rng";
import type { Creature, ShockKind } from "./types";
import type { World } from "./world";

export interface ActiveShock {
  kind: ShockKind;
  ticksLeft: number;
  /** Per-tick effect handle re-applied while active (for climate shocks). */
  apply: (world: World) => void;
}

export const SHOCK_LABELS: Record<ShockKind, string> = {
  iceAge: "Ice Age",
  heatwave: "Heatwave",
  plague: "Plague",
  drought: "Drought",
  predatorInvasion: "Predator Invasion",
  asteroid: "Asteroid Impact",
};

/**
 * Apply a mass-extinction shock. Some shocks are instantaneous culls
 * (asteroid, plague seeding, predator invasion); climate shocks return an
 * `ActiveShock` whose `apply` is re-run each tick until it expires, so the
 * world stays altered for a while and selection can respond.
 */
export function triggerShock(
  kind: ShockKind,
  world: World,
  creatures: Creature[],
  rng: RNG,
): ActiveShock | null {
  switch (kind) {
    case "iceAge": {
      const duration = 1400;
      return {
        kind,
        ticksLeft: duration,
        apply: (w) => {
          // Drive the planet cold and starve regrowth.
          w.baseTemp = Math.max(0.08, w.baseTemp - 0.0009);
          w.globalFoodMul = Math.max(0.25, w.globalFoodMul - 0.002);
        },
      };
    }
    case "heatwave": {
      const duration = 1000;
      return {
        kind,
        ticksLeft: duration,
        apply: (w) => {
          w.baseTemp = Math.min(0.95, w.baseTemp + 0.0011);
          w.globalFoodMul = Math.max(0.35, w.globalFoodMul - 0.0016);
        },
      };
    }
    case "drought": {
      const duration = 900;
      // Slash standing food immediately, then suppress regrowth.
      for (let i = 0; i < world.food.length; i++) world.food[i] *= 0.35;
      return {
        kind,
        ticksLeft: duration,
        apply: (w) => {
          w.globalFoodMul = Math.max(0.2, w.globalFoodMul - 0.003);
        },
      };
    }
    case "plague": {
      // Infect a wide swath; mortality then plays out via the disease system.
      for (const c of creatures) {
        if (rng.chance(0.6)) c.sick = Math.max(c.sick, rng.int(220, 480));
      }
      return null;
    }
    case "predatorInvasion": {
      // Inject aggressive, fast carnivores as a brand-new genome cluster.
      const founders = Math.max(8, Math.floor(creatures.length * 0.04));
      for (let i = 0; i < founders; i++) {
        const host = creatures.length ? rng.pick(creatures) : null;
        creatures.push({
          id: -1, // assigned by the simulation when it adopts the creature
          parentId: null,
          speciesId: 0,
          generation: 0,
          bornTick: 0,
          x: host ? host.x : rng.range(0, world.width),
          y: host ? host.y : rng.range(0, world.height),
          heading: rng.range(0, Math.PI * 2),
          energy: 60,
          age: 0,
          genome: {
            speed: rng.range(0.75, 1),
            vision: rng.range(0.7, 1),
            aggression: rng.range(0.85, 1),
            camouflage: rng.range(0.3, 0.6),
            metabolism: rng.range(0.5, 0.8),
            reproduction: rng.range(0.45, 0.7),
            offspringInvestment: rng.range(0.4, 0.7),
            memory: rng.range(0.4, 0.8),
            cooperation: rng.range(0.2, 0.5),
            diet: rng.range(0.85, 1),
            size: rng.range(0.7, 1),
            tempPreference: rng.range(0.3, 0.7),
          },
          memX: 0,
          memY: 0,
          memStrength: 0,
          sick: 0,
        });
      }
      return null;
    }
    case "asteroid": {
      // Catastrophic global cull plus a long impact-winter climate shock.
      for (let i = creatures.length - 1; i >= 0; i--) {
        if (rng.chance(0.82)) creatures.splice(i, 1);
      }
      for (let i = 0; i < world.food.length; i++) world.food[i] *= 0.2;
      const duration = 1800;
      return {
        kind,
        ticksLeft: duration,
        apply: (w) => {
          w.baseTemp = Math.max(0.12, w.baseTemp - 0.0007);
          w.globalFoodMul = Math.max(0.18, w.globalFoodMul - 0.0022);
        },
      };
    }
  }
}
