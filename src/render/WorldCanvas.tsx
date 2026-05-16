import { useEffect, useRef } from "react";
import { useLab } from "../store";
import { cellColor, SICK_CSS } from "./palette";
import type { World } from "../sim/world";

/**
 * The living map. Terrain + food is rasterised at world-cell resolution into
 * a tiny ImageData and scaled up (cheap, pixelated, no per-cell fillRect),
 * then creatures are drawn as clan-coloured dots on top. Clicking selects the
 * nearest creature for the inspector.
 */
export function WorldCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgRef = useRef<HTMLCanvasElement | null>(null);
  const snapshot = useLab((s) => s.snapshot);
  const selectedId = useLab((s) => s.selectedId);
  const select = useLab((s) => s.select);

  // Reconstruct a minimal World-shaped object for the colour helper from the
  // worker payload. (The worker ships terrain/food in the snapshot meta.)
  useEffect(() => {
    if (!snapshot) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const wmeta = snapshot.worldMeta;
    const { cols, rows, cellSize } = wmeta;
    const worldW = cols * cellSize;
    const worldH = rows * cellSize;

    if (canvas.width !== worldW || canvas.height !== worldH) {
      canvas.width = worldW;
      canvas.height = worldH;
    }

    // --- background: terrain + food ---
    let bg = bgRef.current;
    if (!bg) {
      bg = document.createElement("canvas");
      bgRef.current = bg;
    }
    bg.width = cols;
    bg.height = rows;
    const bgCtx = bg.getContext("2d")!;
    const img = bgCtx.createImageData(cols, rows);
    const fakeWorld = {
      terrain: wmeta.terrain,
      foodCap: wmeta.foodCap,
      food: wmeta.food,
    } as unknown as World;
    for (let i = 0; i < cols * rows; i++) {
      const [r, g, b] = cellColor(fakeWorld, i);
      img.data[i * 4] = r;
      img.data[i * 4 + 1] = g;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = 255;
    }
    bgCtx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bg, 0, 0, worldW, worldH);

    // --- creatures ---
    const colorOf = (sid: number) => snapshot.speciesById[sid]?.color ?? "#ddd";
    for (const d of snapshot.dots) {
      ctx.beginPath();
      const r = 1.4 + d.size * 2.6;
      ctx.fillStyle = d.sick ? SICK_CSS : colorOf(d.speciesId);
      ctx.globalAlpha = d.energy < 12 ? 0.5 : 1;
      ctx.arc(d.x, d.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // --- selection ring ---
    if (selectedId != null) {
      const sel = snapshot.dots.find((d) => d.id === selectedId);
      if (sel) {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(sel.x, sel.y, 7 + sel.size * 3, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }, [snapshot, selectedId]);

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const snap = useLab.getState().snapshot;
    const canvas = canvasRef.current;
    if (!snap || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    let best: number | null = null;
    let bestD = 18 * 18;
    for (const d of snap.dots) {
      const dd = (d.x - x) ** 2 + (d.y - y) ** 2;
      if (dd < bestD) {
        bestD = dd;
        best = d.id;
      }
    }
    select(best);
  };

  return (
    <div className="stage">
      <canvas ref={canvasRef} onClick={onClick} />
      <div
        className="legend"
        style={{
          position: "absolute",
          left: 10,
          bottom: 10,
          background: "rgba(8,10,14,0.7)",
          padding: "5px 9px",
          borderRadius: 6,
        }}
      >
        <span>dots = creatures, coloured by clan</span>
        <span>
          <span className="swatch" style={{ background: SICK_CSS }} />
          diseased
        </span>
        <span>greener terrain = more food · tan = grazed bare</span>
        <span className="muted">click a creature to inspect</span>
      </div>
    </div>
  );
}
