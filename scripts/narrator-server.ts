/**
 * Optional local narrator endpoint. Keeps the API key server-side (never in
 * the browser bundle) and uses the cheapest model with a tiny token budget,
 * so an entire long session costs a few tenths of a cent at most.
 *
 *   npm run narrator        # then toggle "AI" in the UI
 *
 * Reads ANTHROPIC_API_KEY (preferred) or OPENAI_API_KEY from .env. If neither
 * is set, or the call fails, the UI silently keeps using the free heuristic.
 */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function loadEnv(): Record<string, string> {
  try {
    const raw = readFileSync(join(process.cwd(), ".env"), "utf8");
    const out: Record<string, string> = {};
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
    return out;
  } catch {
    return {};
  }
}

const env = { ...loadEnv(), ...process.env };
const ANTHROPIC = env.ANTHROPIC_API_KEY;
const OPENAI = env.OPENAI_API_KEY;
const PORT = Number(env.NARRATOR_PORT ?? 8787);

interface Req {
  generation: number;
  population: number;
  speciesCount: number;
  climate: number;
  foodIndex: number;
  dominantClan: number | null;
  topGenes: { gene: string; value: number }[];
  recentEvents: string[];
}

function prompt(r: Req): string {
  return [
    "You are a terse nature-documentary narrator for an evolution simulation.",
    "Write ONE vivid sentence (max 32 words) about this moment. No preamble.",
    `Generation ${r.generation}, population ${r.population}, ${r.speciesCount} clans.`,
    `Climate ${r.climate} (0 cold,1 hot), food index ${r.foodIndex}.`,
    `Dominant clan #${r.dominantClan}. Notable genes: ${r.topGenes
      .map((g) => `${g.gene} ${g.value}`)
      .join(", ")}.`,
    `Recent events: ${r.recentEvents.join(" | ") || "none"}.`,
  ].join("\n");
}

async function viaAnthropic(r: Req): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ANTHROPIC!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 90,
      messages: [{ role: "user", content: prompt(r) }],
    }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { content: { text: string }[] };
  return data.content.map((c) => c.text).join("").trim();
}

async function viaOpenAI(r: Req): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${OPENAI}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      max_tokens: 90,
      messages: [{ role: "user", content: prompt(r) }],
    }),
  });
  if (!res.ok) throw new Error(`openai ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  return data.choices[0].message.content.trim();
}

const server = createServer((req, res) => {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-headers", "content-type");
  if (req.method === "OPTIONS") return res.writeHead(204).end();
  if (req.method !== "POST" || !req.url?.startsWith("/api/narrate")) {
    return res.writeHead(404).end();
  }
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", async () => {
    try {
      const r = JSON.parse(body) as Req;
      const text = ANTHROPIC ? await viaAnthropic(r) : OPENAI ? await viaOpenAI(r) : null;
      if (!text) throw new Error("no API key configured");
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ text }));
    } catch (e) {
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: String(e) }));
    }
  });
});

server.listen(PORT, () => {
  const who = ANTHROPIC ? "Anthropic (claude-haiku)" : OPENAI ? "OpenAI (gpt-4o-mini)" : "NO KEY";
  console.log(`narrator endpoint on http://localhost:${PORT}/api/narrate  ·  provider: ${who}`);
});
