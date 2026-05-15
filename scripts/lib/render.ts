/**
 * Headless frame renderer: paints the live world + creatures into an RGBA
 * buffer, mirroring what the browser canvas will show. Used by the inspection
 * harness so the agent can literally look at the simulation and iterate.
 */
import { cellColor, hslStringToRgb, type RGB } from "../../src/render/palette";
import type { Simulation } from "../../src/sim/simulation";

export interface RenderOpts {
  scale?: number; // pixel multiplier
  legendH?: number; // bottom legend strip height in px
}

export function renderFrame(sim: Simulation, opts: RenderOpts = {}) {
  const scale = opts.scale ?? 1;
  const legendH = opts.legendH ?? 46;
  const w = sim.world;
  const W = Math.round(w.width * scale);
  const mapH = Math.round(w.height * scale);
  const H = mapH + legendH;
  const buf = new Uint8Array(W * H * 4);

  const put = (x: number, y: number, c: RGB, a = 255) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4;
    buf[i] = c[0];
    buf[i + 1] = c[1];
    buf[i + 2] = c[2];
    buf[i + 3] = a;
  };

  // --- terrain + food background ---
  for (let cy = 0; cy < w.rows; cy++) {
    for (let cx = 0; cx < w.cols; cx++) {
      const ci = cy * w.cols + cx;
      const col = cellColor(w, ci);
      const x0 = Math.round(cx * w.cellSize * scale);
      const y0 = Math.round(cy * w.cellSize * scale);
      const x1 = Math.round((cx + 1) * w.cellSize * scale);
      const y1 = Math.round((cy + 1) * w.cellSize * scale);
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) put(x, y, col);
    }
  }

  // --- creatures, coloured by clan ---
  const speciesColor = new Map<number, RGB>();
  for (const [id, sp] of Object.entries(sim.species.asRecord())) {
    speciesColor.set(Number(id), hslStringToRgb(sp.color));
  }
  const snap = sim.snapshot(true, 1);
  for (const d of snap.dots) {
    const col = speciesColor.get(d.speciesId) ?? ([220, 220, 220] as RGB);
    const cx = Math.round(d.x * scale);
    const cy = Math.round(d.y * scale);
    const r = Math.max(1, Math.round((1 + d.size * 2.4) * scale));
    const dim = d.energy < 12 ? 0.55 : 1;
    const body: RGB = d.sick
      ? [220, 80, 200]
      : [Math.round(col[0] * dim), Math.round(col[1] * dim), Math.round(col[2] * dim)];
    for (let yy = -r; yy <= r; yy++) {
      for (let xx = -r; xx <= r; xx++) {
        if (xx * xx + yy * yy <= r * r) put(cx + xx, cy + yy, body);
      }
    }
  }

  // --- bottom legend: species bars + climate/food gauges ---
  const live = snap.stats.liveSpecies.slice(0, 18);
  const totalPop = Math.max(1, live.reduce((s, x) => s + x.population, 0));
  let lx = 4;
  const barY0 = mapH + 6;
  const barY1 = mapH + legendH - 14;
  for (const sp of live) {
    const cw = Math.max(3, Math.round(((W - 8) * sp.population) / totalPop));
    const col = speciesColor.get(sp.id) ?? ([200, 200, 200] as RGB);
    for (let y = barY0; y < barY1; y++)
      for (let x = lx; x < lx + cw - 1 && x < W; x++) put(x, y, col);
    lx += cw;
  }
  // Climate gauge (blue→red) and food gauge (brown→green) along the very base.
  const gy = H - 8;
  for (let x = 0; x < W; x++) {
    const tnorm = x / W;
    if (tnorm < snap.stats.baseTemp) put(x, gy, [60 + tnorm * 195, 60, 200 - tnorm * 160]);
    else put(x, gy, [30, 30, 38]);
    const fy = H - 4;
    if (tnorm < snap.stats.globalFoodMul / 1.5)
      put(x, fy, [120 - tnorm * 60, 90 + tnorm * 120, 50]);
    else put(x, fy, [30, 30, 38]);
  }

  return { buf, width: W, height: H };
}
