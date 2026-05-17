import { create } from "zustand";
import type { SimConfig } from "./sim/config";
import type { AncestryNode, FromWorker, ToWorker } from "./sim/protocol";
import type { ShockKind, SimSnapshot } from "./sim/types";

interface InspectState {
  id: number;
  alive: boolean;
  chain: AncestryNode[];
  genome: Record<string, number> | null;
}

interface LabState {
  snapshot: SimSnapshot | null;
  running: boolean;
  speed: number;
  seed: number;
  selectedId: number | null;
  inspect: InspectState | null;
  /** When set, the canvas paints this history frame instead of live state. */
  scrubIndex: number | null;

  start: () => void;
  pause: () => void;
  setSpeed: (s: number) => void;
  shock: (k: ShockKind) => void;
  reset: (seed?: number, cfg?: Partial<SimConfig>) => void;
  select: (id: number | null) => void;
  setScrub: (i: number | null) => void;
}

let worker: Worker | null = null;

function ensureWorker(set: (p: Partial<LabState>) => void, get: () => LabState) {
  if (worker) return worker;
  worker = new Worker(new URL("./sim/worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (e: MessageEvent<FromWorker>) => {
    const msg = e.data;
    if (msg.type === "snapshot") {
      set({ snapshot: msg.payload, running: msg.payload.running, speed: msg.payload.speed });
    } else if (msg.type === "inspectResult") {
      set({
        inspect: {
          id: msg.id,
          alive: msg.alive,
          chain: msg.chain,
          genome: msg.genome,
        },
      });
    }
  };
  const send = (m: ToWorker) => worker!.postMessage(m);
  send({ type: "init", config: { seed: get().seed } });
  return worker;
}

export const useLab = create<LabState>((set, get) => {
  const send = (m: ToWorker) => {
    ensureWorker(set, get);
    worker!.postMessage(m);
  };

  return {
    snapshot: null,
    running: false,
    speed: 8,
    seed: 1337,
    selectedId: null,
    inspect: null,
    scrubIndex: null,

    start: () => {
      send({ type: "start" });
      set({ running: true, scrubIndex: null });
    },
    pause: () => {
      send({ type: "pause" });
      set({ running: false });
    },
    setSpeed: (s) => {
      send({ type: "setSpeed", speed: s });
      set({ speed: s });
    },
    shock: (k) => send({ type: "shock", kind: k }),
    reset: (seed, cfg) => {
      const s = seed ?? get().seed;
      send({ type: "reset", config: { seed: s, ...cfg } });
      set({
        seed: s,
        // Clear the stale snapshot so it is never paired with the new seed
        // (export reproducibility — VOI-31 / Codex P2). Buttons that gate on
        // `snapshot` disable until the fresh run posts its first snapshot.
        snapshot: null,
        running: false,
        selectedId: null,
        inspect: null,
        scrubIndex: null,
      });
    },
    select: (id) => {
      set({ selectedId: id });
      if (id != null) send({ type: "inspect", id });
      else set({ inspect: null });
    },
    setScrub: (i) => set({ scrubIndex: i }),
  };
});

/** Re-request ancestry for the selected creature (used on a poll while live). */
export function refreshInspect() {
  const { selectedId } = useLab.getState();
  if (selectedId != null && worker) worker.postMessage({ type: "inspect", id: selectedId });
}
