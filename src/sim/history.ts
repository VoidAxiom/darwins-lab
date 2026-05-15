import type { HistoryFrame } from "./types";

/**
 * Fixed-capacity ring buffer of downsampled frames. Storing a light frame
 * (counts + gene means, not every creature) every N ticks lets the timeline
 * scrub across tens of thousands of generations using bounded memory — the
 * key trick that keeps a "long-running" sim cheap to observe.
 */
export class HistoryBuffer {
  private frames: HistoryFrame[] = [];
  private readonly capacity: number;

  constructor(capacity = 2000) {
    this.capacity = capacity;
  }

  push(frame: HistoryFrame) {
    this.frames.push(frame);
    if (this.frames.length > this.capacity) {
      // Decimate the oldest half rather than dropping one frame at a time, so
      // very old history coarsens gracefully instead of vanishing.
      const kept: HistoryFrame[] = [];
      for (let i = 0; i < this.frames.length; i++) {
        if (i >= this.frames.length / 2 || i % 2 === 0) kept.push(this.frames[i]);
      }
      this.frames = kept;
    }
  }

  all(): HistoryFrame[] {
    return this.frames;
  }

  latest(): HistoryFrame | undefined {
    return this.frames[this.frames.length - 1];
  }

  clear() {
    this.frames = [];
  }
}
