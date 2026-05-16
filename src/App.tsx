import { useEffect } from "react";
import { WorldCanvas } from "./render/WorldCanvas";
import { useLab } from "./store";
import { Controls } from "./ui/Controls";
import { CreatureInspector } from "./ui/CreatureInspector";
import { EventsLog } from "./ui/EventsLog";
import { NarratorPanel } from "./ui/NarratorPanel";
import { Phylogeny } from "./ui/Phylogeny";
import { ShockPanel } from "./ui/ShockPanel";
import { StatsPanel } from "./ui/StatsPanel";
import { Timeline } from "./ui/Timeline";

export function App() {
  const start = useLab((s) => s.start);
  const snapshot = useLab((s) => s.snapshot);

  // Auto-run on first load so the world is alive the moment you arrive.
  useEffect(() => {
    const t = setTimeout(start, 300);
    return () => clearTimeout(t);
  }, [start]);

  return (
    <div className="app">
      <header className="topbar">
        <h1>🧬 Darwin's Lab</h1>
        <span className="tag">
          a long-running genetic-algorithm civilization — watch lineages mutate, split,
          dominate, collapse, and adapt
        </span>
        <span style={{ flex: 1 }} />
        {snapshot && (
          <span className="tag">
            gen <strong>{snapshot.stats.generation.toLocaleString()}</strong> · pop{" "}
            <strong>{snapshot.stats.population.toLocaleString()}</strong> ·{" "}
            <strong>{snapshot.stats.speciesCount}</strong> clans
          </span>
        )}
      </header>

      <WorldCanvas />

      <aside className="side">
        <NarratorPanel />
        <StatsPanel />
        <ShockPanel />
        <Phylogeny />
        <CreatureInspector />
        <EventsLog />
      </aside>

      <footer className="bottombar">
        <Timeline />
        <div style={{ height: 8 }} />
        <Controls />
      </footer>
    </div>
  );
}
