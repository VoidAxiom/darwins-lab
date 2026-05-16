/**
 * Pure colour helpers shared by the browser canvas and the headless PNG
 * inspector, so both renderers depict the world identically.
 */
import { TERRAIN_ORDER, type World } from "../sim/world";

export type RGB = [number, number, number];

/** Parse the `hsl(H S% L%)` strings produced by the species palette. */
export function hslStringToRgb(s: string): RGB {
  const m = s.match(/hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/);
  if (!m) return [200, 200, 200];
  return hslToRgb(Number(m[1]), Number(m[2]) / 100, Number(m[3]) / 100);
}

export function hslToRgb(h: number, s: number, l: number): RGB {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

/** Base RGB for each terrain kind (matches sim/world TERRAIN_COLORS). */
const TERRAIN_RGB: RGB[] = [
  [28, 58, 94], // water
  [201, 168, 107], // desert
  [70, 92, 48], // plains
  [37, 70, 37], // forest
  [107, 107, 115], // mountain
];

/**
 * Colour of a world cell, taking food density into account: lush cells glow
 * greener, depleted ones fade toward bare ground. This is the "living map"
 * texture the whole UI sits on.
 */
export function cellColor(world: World, cellIndex: number): RGB {
  const terr = world.terrain[cellIndex];
  const base = TERRAIN_RGB[terr] ?? [0, 0, 0];
  const cap = world.foodCap[cellIndex];
  if (cap <= 0) return base;
  const f = world.food[cellIndex] / cap; // 0..1
  // Blend toward a vivid forage-green as food density rises.
  const lush: RGB = [60, 150, 55];
  const t = 0.15 + f * 0.7;
  return [
    Math.round(base[0] + (lush[0] - base[0]) * t * 0.6),
    Math.round(base[1] + (lush[1] - base[1]) * t * 0.85),
    Math.round(base[2] + (lush[2] - base[2]) * t * 0.4),
  ];
}

export const TERRAIN_COUNT = TERRAIN_ORDER.length;

/**
 * Diseased creatures render in a fixed sickly grey-violet — deliberately
 * outside the vivid golden-angle clan palette so "ill" never reads as a clan.
 */
export const SICK_RGB: RGB = [150, 120, 165];
export const SICK_CSS = "rgb(150 120 165)";
