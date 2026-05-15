import { useEffect, useRef, useState } from "react";
import { narrateHeuristic } from "../narrator/heuristic";
import { buildRequest, narrateLLM } from "../narrator/llm";
import { useLab } from "../store";

const COOLDOWN_MS = 25_000; // hard floor between LLM calls — keeps spend tiny
const MAJOR = new Set(["shock", "extinction", "speciation", "collapse"]);

/**
 * The "nature documentary" voice. Heuristic narration is free and always on.
 * The optional AI narrator only fires after a *major* event and never more
 * than once per cooldown, so a long session costs at most a handful of cheap
 * Haiku calls. Falls back to heuristic if the endpoint is down.
 */
export function NarratorPanel() {
  const stats = useLab((s) => s.snapshot?.stats);
  const events = useLab((s) => s.snapshot?.events ?? []);
  const [useAI, setUseAI] = useState(false);
  const [aiText, setAiText] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const lastCallRef = useRef(0);
  const lastEventTickRef = useRef(-1);

  const heuristic = stats ? narrateHeuristic(stats, events) : "Awaiting the first lifeforms…";

  useEffect(() => {
    if (!useAI || !stats) return;
    const major = [...events].reverse().find((e) => MAJOR.has(e.kind));
    if (!major || major.tick === lastEventTickRef.current) return;
    if (Date.now() - lastCallRef.current < COOLDOWN_MS) return;

    lastEventTickRef.current = major.tick;
    lastCallRef.current = Date.now();
    const ctrl = new AbortController();
    setAiBusy(true);
    narrateLLM(buildRequest(stats, events), ctrl.signal)
      .then((t) => setAiText(t))
      .catch(() => setAiText(null)) // silent fall back to heuristic
      .finally(() => setAiBusy(false));
    return () => ctrl.abort();
  }, [useAI, stats, events]);

  return (
    <div className="card">
      <h3>
        Narrator
        <label className="tiny" style={{ float: "right", fontWeight: 400 }}>
          <input
            type="checkbox"
            checked={useAI}
            onChange={(e) => setUseAI(e.target.checked)}
            style={{ verticalAlign: "middle" }}
          />{" "}
          AI {aiBusy ? "…" : ""}
        </label>
      </h3>
      <p className="narrator">“{useAI && aiText ? aiText : heuristic}”</p>
      {useAI && (
        <p className="tiny muted" style={{ margin: 0 }}>
          {aiText
            ? "AI narration · batched after major events only"
            : "AI on — narrates the next major event (heuristic until then)"}
        </p>
      )}
    </div>
  );
}
