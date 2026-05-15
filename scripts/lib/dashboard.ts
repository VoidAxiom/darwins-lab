/**
 * Composes a full product-experience mock (map + sidebar + timeline) into one
 * PNG, mirroring the React dashboard. Lets the agent visually review the whole
 * UX — information density, colour, narration — not just the raw world.
 */
import { cellColor, hslStringToRgb, type RGB } from "../../src/render/palette";
import { narrateHeuristic } from "../../src/narrator/heuristic";
import { GENE_INFO, type GeneKey } from "../../src/sim/genome";
import type { Simulation } from "../../src/sim/simulation";
import { drawText } from "./font";

const SIDEBAR = 330;
const TIMELINE_H = 96;
const PAD = 12;

export function renderDashboard(sim: Simulation) {
  const w = sim.world;
  const mapW = w.width;
  const mapH = w.height;
  const W = mapW + SIDEBAR;
  const H = mapH + TIMELINE_H;
  const buf = new Uint8Array(W * H * 4);

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
  const rect = (x: number, y: number, rw: number, rh: number, c: RGB) => {
    for (let yy = y; yy < y + rh; yy++) for (let xx = x; xx < x + rw; xx++) put(xx, yy, c);
  };

  const BG: RGB = [12, 15, 20];
  const PANEL: RGB = [27, 33, 45];
  const MUTED: RGB = [135, 148, 168];
  const TEXT: RGB = [215, 222, 232];
  const ACCENT: RGB = [92, 200, 255];
  rect(0, 0, W, H, BG);

  // --- map ---
  for (let cy = 0; cy < w.rows; cy++) {
    for (let cx = 0; cx < w.cols; cx++) {
      const ci = cy * w.cols + cx;
      const col = cellColor(w, ci);
      rect(cx * w.cellSize, cy * w.cellSize, w.cellSize, w.cellSize, col);
    }
  }
  const snap = sim.snapshot(true, 1);
  const colorOf = (id: number) =>
    hslStringToRgb(sim.species.asRecord()[id]?.color ?? "hsl(0 0% 80%)");
  for (const d of snap.dots) {
    const col: RGB = d.sick ? [232, 79, 207] : colorOf(d.speciesId);
    const r = Math.max(1, Math.round(1.4 + d.size * 2.4));
    for (let yy = -r; yy <= r; yy++)
      for (let xx = -r; xx <= r; xx++)
        if (xx * xx + yy * yy <= r * r) put(d.x + xx, d.y + yy, col, d.energy < 12 ? 130 : 255);
  }

  // --- sidebar ---
  const sx = mapW;
  rect(sx, 0, SIDEBAR, H, PANEL);
  let y = PAD;
  const st = snap.stats;
  drawText(put, "DARWINS LAB", sx + PAD, y, ACCENT, 2);
  y += 22;
  drawText(put, `GEN ${st.generation}  TICK ${st.tick}`, sx + PAD, y, MUTED, 1);
  y += 16;

  const line = (label: string, val: string) => {
    drawText(put, label, sx + PAD, y, MUTED, 1);
    drawText(put, val, sx + PAD + 120, y, TEXT, 1);
    y += 12;
  };
  drawText(put, "WORLD VITALS", sx + PAD, y, ACCENT, 1);
  y += 14;
  line("POPULATION", String(st.population));
  line("CLANS ALIVE", String(st.speciesCount));
  line("BIRTHS DEATHS", `${st.births} ${st.deaths}`);
  line("CLIMATE", st.baseTemp < 0.35 ? "COLD" : st.baseTemp > 0.65 ? "HOT" : "TEMPERATE");
  line("FOOD INDEX", `${Math.round(st.globalFoodMul * 100)}%`);
  if (st.activeShock) line("SHOCK", st.activeShock.toUpperCase());
  y += 8;

  drawText(put, "DOMINANT TRAITS", sx + PAD, y, ACCENT, 1);
  y += 14;
  for (const k of Object.keys(st.meanGenes) as GeneKey[]) {
    const v = st.meanGenes[k];
    drawText(put, GENE_INFO[k].label.slice(0, 9), sx + PAD, y, MUTED, 1);
    rect(sx + PAD + 96, y, 130, 7, [14, 18, 24]);
    rect(sx + PAD + 96, y, Math.round(130 * v), 7, [60, 150, 230]);
    drawText(put, v.toFixed(2), sx + PAD + 234, y, TEXT, 1);
    y += 11;
  }
  y += 8;

  drawText(put, "CLANS", sx + PAD, y, ACCENT, 1);
  y += 14;
  for (const s of st.liveSpecies.slice(0, 6)) {
    rect(sx + PAD, y, 9, 9, colorOf(s.id));
    drawText(put, `#${s.id}`, sx + PAD + 14, y + 1, TEXT, 1);
    drawText(put, `${s.population}`, sx + PAD + 70, y + 1, MUTED, 1);
    rect(sx + PAD + 110, y + 2, Math.min(180, s.population), 6, colorOf(s.id));
    y += 12;
  }
  y += 10;

  drawText(put, "NARRATOR", sx + PAD, y, ACCENT, 1);
  y += 14;
  const story = narrateHeuristic(st, sim.events);
  for (const ln of wrap(story, 46)) {
    drawText(put, ln, sx + PAD, y, [207, 230, 245], 1);
    y += 11;
  }
  y += 8;

  drawText(put, "EVENT LOG", sx + PAD, y, ACCENT, 1);
  y += 14;
  for (const e of sim.events.slice(-5).reverse()) {
    for (const ln of wrap(e.text, 50).slice(0, 2)) {
      drawText(put, ln, sx + PAD, y, MUTED, 1);
      y += 10;
    }
  }

  // --- timeline ---
  const ty = mapH;
  rect(0, ty, mapW, TIMELINE_H, [14, 18, 24]);
  const hist = snap.history;
  if (hist.length > 1) {
    const maxPop = Math.max(1, ...hist.map((f) => f.population));
    const maxSp = Math.max(1, ...hist.map((f) => f.speciesCount));
    for (let i = 0; i < hist.length; i++) {
      const x = Math.round((i / (hist.length - 1)) * (mapW - 1));
      const ph = Math.round((hist[i].population / maxPop) * (TIMELINE_H - 16));
      for (let yy = 0; yy < ph; yy++) put(x, ty + TIMELINE_H - 4 - yy, [40, 90, 130]);
      const sh = Math.round((hist[i].speciesCount / maxSp) * (TIMELINE_H - 16));
      put(x, ty + TIMELINE_H - 4 - sh, [105, 210, 138]);
      put(x, ty + TIMELINE_H - 5 - sh, [105, 210, 138]);
    }
  }
  drawText(put, "EVOLUTIONARY TIMELINE  POP-BLUE  CLANS-GREEN", 6, ty + 5, MUTED, 1);

  return { buf, width: W, height: H };
}

function wrap(s: string, n: number): string[] {
  const words = s.split(" ");
  const out: string[] = [];
  let cur = "";
  for (const word of words) {
    if ((cur + " " + word).trim().length > n) {
      out.push(cur.trim());
      cur = word;
    } else cur += " " + word;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
