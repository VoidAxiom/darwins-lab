/**
 * Optional LLM narrator client. Talks to a tiny local endpoint (see
 * scripts/narrator-server.ts) so the API key never reaches the browser.
 *
 * Cost is kept minimal by design: the caller only invokes this after a
 * *significant* event and never more than once per cooldown window, and the
 * server uses the cheapest model with a tight token budget. If the endpoint
 * is unavailable the UI silently falls back to the local heuristic narrator.
 */
import type { EventRecord, SimStats } from "../sim/types";

export interface NarrateRequest {
  generation: number;
  population: number;
  speciesCount: number;
  climate: number;
  foodIndex: number;
  dominantClan: number | null;
  topGenes: { gene: string; value: number }[];
  recentEvents: string[];
}

export function buildRequest(stats: SimStats, events: EventRecord[]): NarrateRequest {
  const topGenes = Object.entries(stats.meanGenes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([gene, value]) => ({ gene, value: +value.toFixed(2) }));
  return {
    generation: stats.generation,
    population: stats.population,
    speciesCount: stats.speciesCount,
    climate: +stats.baseTemp.toFixed(2),
    foodIndex: +stats.globalFoodMul.toFixed(2),
    dominantClan: stats.liveSpecies[0]?.id ?? null,
    topGenes,
    recentEvents: events.slice(-6).map((e) => e.text),
  };
}

export async function narrateLLM(req: NarrateRequest, signal?: AbortSignal): Promise<string> {
  const res = await fetch("/api/narrate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(req),
    signal,
  });
  if (!res.ok) throw new Error(`narrator endpoint ${res.status}`);
  const data = (await res.json()) as { text?: string };
  if (!data.text) throw new Error("empty narration");
  return data.text.trim();
}
