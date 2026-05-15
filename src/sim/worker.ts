/// <reference lib="webworker" />
/**
 * Simulation Web Worker. Owns the `Simulation` instance and advances it on a
 * fixed cadence, decoupled from rendering. `speed` controls how many ticks are
 * batched per ~33ms frame, so the world can run from a gentle crawl to many
 * thousands of generations per minute without blocking the UI.
 */
import { Simulation } from "./simulation";
import type { FromWorker, ToWorker } from "./protocol";

let sim = new Simulation();
let running = false;
let speed = 8; // ticks per frame
let timer: ReturnType<typeof setTimeout> | null = null;
const FRAME_MS = 33;

function post(msg: FromWorker) {
  (self as unknown as Worker).postMessage(msg);
}

function emitSnapshot() {
  post({ type: "snapshot", payload: sim.snapshot(running, speed) });
  sim.resetCounters();
}

function loop() {
  if (!running) return;
  const start = performance.now();
  let steps = 0;
  // Run the batch, but never hog the worker for more than ~22ms so snapshots
  // stay smooth even at very high speeds on a slow machine.
  while (steps < speed && performance.now() - start < 22) {
    sim.step();
    steps++;
    if (sim.creatures.length === 0) {
      running = false;
      break;
    }
  }
  emitSnapshot();
  timer = setTimeout(loop, FRAME_MS);
}

function startLoop() {
  if (timer) return;
  running = true;
  loop();
}

function stopLoop() {
  running = false;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  switch (msg.type) {
    case "init":
      sim = new Simulation(msg.config);
      emitSnapshot();
      break;
    case "reset":
      stopLoop();
      sim = new Simulation(msg.config);
      emitSnapshot();
      break;
    case "start":
      startLoop();
      break;
    case "pause":
      stopLoop();
      emitSnapshot();
      break;
    case "setSpeed":
      speed = Math.max(1, Math.min(400, msg.speed));
      break;
    case "shock":
      sim.shock(msg.kind);
      emitSnapshot();
      break;
    case "inspect": {
      const chain = sim.getAncestry(msg.id);
      const live = sim.getCreature(msg.id);
      post({
        type: "inspectResult",
        id: msg.id,
        alive: !!live,
        chain,
        genome: live ? live.genome : (chain[0]?.genome ?? null),
      });
      break;
    }
  }
};

emitSnapshot();
