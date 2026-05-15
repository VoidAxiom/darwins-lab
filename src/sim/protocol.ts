/** Message protocol between the UI thread and the simulation Web Worker. */
import type { SimConfig } from "./config";
import type { ShockKind, SimSnapshot } from "./types";
import type { Genome } from "./genome";

export type ToWorker =
  | { type: "init"; config: Partial<SimConfig> }
  | { type: "start" }
  | { type: "pause" }
  | { type: "setSpeed"; speed: number }
  | { type: "shock"; kind: ShockKind }
  | { type: "reset"; config: Partial<SimConfig> }
  | { type: "inspect"; id: number };

export interface AncestryNode {
  id: number;
  parentId: number | null;
  speciesId: number;
  generation: number;
  bornTick: number;
  diedTick?: number;
  genome: Genome;
}

export type FromWorker =
  | { type: "snapshot"; payload: SimSnapshot }
  | {
      type: "inspectResult";
      id: number;
      alive: boolean;
      chain: AncestryNode[];
      genome: Genome | null;
    };
