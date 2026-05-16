/**
 * Standalone phylogeny renderer for the inspection harness — mirrors the
 * React Clan Phylogeny panel (shared layout in src/sim/phylogeny) so the
 * lineage tree can be visually verified headlessly.
 */
import { hslStringToRgb, type RGB } from "../../src/render/palette";
import { computePhylogeny } from "../../src/sim/phylogeny";
import type { Simulation } from "../../src/sim/simulation";
import { drawText } from "./font";

export function renderPhylogeny(sim: Simulation) {
  const { nodes, links, rows, t0 } = computePhylogeny(sim.species.asRecord(), sim.tick, {
    minPeak: 12,
    maxNodes: 48,
  });
  const tick = sim.tick;
  const span = Math.max(1, tick - t0);
  const W = 900;
  const rowH = 16;
  const H = Math.max(120, rows * rowH + 40);
  const buf = new Uint8Array(W * H * 4);
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = 14;
    buf[i + 1] = 18;
    buf[i + 2] = 24;
    buf[i + 3] = 255;
  }
  const put = (x: number, y: number, c: RGB, a = 255) => {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4;
    buf[i] = c[0];
    buf[i + 1] = c[1];
    buf[i + 2] = c[2];
    buf[i + 3] = a;
  };
  const X = (t: number) => 26 + ((t - t0) / span) * (W - 60);
  const Y = (r: number) => 28 + r * rowH;
  const hline = (x1: number, x2: number, y: number, c: RGB, thick: number) => {
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++)
      for (let t = 0; t < thick; t++) put(x, y + t, c);
  };
  const vline = (x: number, y1: number, y2: number, c: RGB) => {
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) put(x, y, c);
  };

  drawText(
    put,
    `CLAN PHYLOGENY  ${nodes.length} LINEAGES  TICK ${tick}  BRIGHT-ALIVE`,
    8,
    8,
    [135, 148, 168],
    1,
  );

  // Parent → child branches (drawn first, dim).
  for (const { parent, child } of links) {
    const c = hslStringToRgb(child.color);
    const dim: RGB = [c[0] * 0.5 + 20, c[1] * 0.5 + 20, c[2] * 0.5 + 20];
    const bx = X(child.bornTick);
    vline(bx, Y(parent.row), Y(child.row), dim);
    hline(bx, X(child.bornTick), Y(child.row), dim, 1);
  }

  // Clan lifelines.
  for (const n of nodes) {
    const c = hslStringToRgb(n.color);
    const x1 = X(n.bornTick);
    const x2 = X(n.endTick);
    const yy = Y(n.row);
    hline(x1, x2, yy, n.alive ? c : [c[0] * 0.4, c[1] * 0.4, c[2] * 0.4], n.alive ? 3 : 1);
    if (n.alive) {
      const r = Math.min(6, 2 + n.population / 120);
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++)
          if (dx * dx + dy * dy <= r * r) put(x2 + dx, yy + 1 + dy, c);
      drawText(put, `#${n.id}`, x2 + 9, yy - 2, c, 1);
    }
  }
  return { buf, width: W, height: H };
}
