import type { Creature } from "./types";

/**
 * Uniform spatial hash rebuilt each tick. Neighbour queries (vision, mating,
 * predation) are the hot path; bucketing creatures into coarse cells keeps the
 * tick roughly O(n) instead of O(n²) even with ~1.5k creatures.
 */
export class SpatialGrid {
  private cellSize: number;
  private cols: number;
  private buckets: Creature[][];

  constructor(width: number, height: number, cellSize: number) {
    this.cellSize = cellSize;
    this.cols = Math.max(1, Math.ceil(width / cellSize));
    const rows = Math.max(1, Math.ceil(height / cellSize));
    this.buckets = Array.from({ length: this.cols * rows }, () => []);
  }

  clear() {
    for (const b of this.buckets) b.length = 0;
  }

  private key(x: number, y: number): number {
    const cx = Math.min(this.cols - 1, Math.max(0, (x / this.cellSize) | 0));
    const cy = Math.max(0, (y / this.cellSize) | 0);
    const idx = cy * this.cols + cx;
    return idx < 0 ? 0 : idx >= this.buckets.length ? this.buckets.length - 1 : idx;
  }

  insert(c: Creature) {
    this.buckets[this.key(c.x, c.y)].push(c);
  }

  /** Invoke `fn` for every creature within `radius` of (x, y). */
  forNeighbors(x: number, y: number, radius: number, fn: (c: Creature) => void) {
    const r = Math.ceil(radius / this.cellSize);
    const cx = (x / this.cellSize) | 0;
    const cy = (y / this.cellSize) | 0;
    const rows = this.buckets.length / this.cols;
    for (let gy = cy - r; gy <= cy + r; gy++) {
      if (gy < 0 || gy >= rows) continue;
      for (let gx = cx - r; gx <= cx + r; gx++) {
        if (gx < 0 || gx >= this.cols) continue;
        const bucket = this.buckets[gy * this.cols + gx];
        for (let i = 0; i < bucket.length; i++) fn(bucket[i]);
      }
    }
  }
}
