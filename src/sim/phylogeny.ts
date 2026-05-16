/**
 * Shared phylogeny layout, used by both the React panel and the headless
 * inspection renderer so they always agree.
 *
 * The subtlety: we only want to *show* clans that mattered (peaked above a
 * threshold), but a notable clan's recorded parent may itself have been a
 * tiny/pruned intermediate. Naively filtering then linking by parentId yields
 * a flat forest. So instead we walk each kept clan's parent chain upward until
 * we hit another *kept* clan and attach there — reconstructing a real tree.
 * Rows are assigned by depth-first traversal so descendants sit beside their
 * ancestors.
 */
import type { Species } from "./types";

export interface PhyloNode {
  id: number;
  color: string;
  parentId: number | null; // nearest *kept* ancestor, or null (root)
  bornTick: number;
  endTick: number; // extinctTick, or `tick` if still alive
  alive: boolean;
  population: number;
  peakPopulation: number;
  row: number;
  depth: number;
}

export interface PhyloLayout {
  nodes: PhyloNode[];
  links: { parent: PhyloNode; child: PhyloNode }[];
  rows: number;
  t0: number;
}

export function computePhylogeny(
  speciesById: Record<number, Species>,
  tick: number,
  opts: { minPeak?: number; maxNodes?: number } = {},
): PhyloLayout {
  const minPeak = opts.minPeak ?? 12;
  const maxNodes = opts.maxNodes ?? 60;
  const all = speciesById;

  let kept = Object.values(all).filter((s) => s.peakPopulation >= minPeak);
  // If there are too many, keep the most significant lineages.
  if (kept.length > maxNodes) {
    kept = [...kept].sort((a, b) => b.peakPopulation - a.peakPopulation).slice(0, maxNodes);
  }
  const keptIds = new Set(kept.map((s) => s.id));

  // Resolve each kept clan to its nearest kept ancestor.
  const nearestKeptParent = (s: Species): number | null => {
    let pid = s.parentId;
    let guard = 0;
    while (pid != null && guard++ < 5000) {
      if (keptIds.has(pid)) return pid;
      const p: Species | undefined = all[pid];
      pid = p ? p.parentId : null;
    }
    return null;
  };

  const nodes = new Map<number, PhyloNode>();
  for (const s of kept) {
    nodes.set(s.id, {
      id: s.id,
      color: s.color,
      parentId: nearestKeptParent(s),
      bornTick: s.bornTick,
      endTick: s.extinctTick ?? tick,
      alive: s.extinctTick === undefined && s.population > 0,
      population: s.population,
      peakPopulation: s.peakPopulation,
      row: 0,
      depth: 0,
    });
  }

  const childrenOf = new Map<number, PhyloNode[]>();
  const roots: PhyloNode[] = [];
  for (const n of nodes.values()) {
    if (n.parentId != null && nodes.has(n.parentId)) {
      let arr = childrenOf.get(n.parentId);
      if (!arr) childrenOf.set(n.parentId, (arr = []));
      arr.push(n);
    } else {
      roots.push(n);
    }
  }

  let row = 0;
  const walk = (n: PhyloNode, depth: number) => {
    n.depth = depth;
    const kids = (childrenOf.get(n.id) ?? []).sort((a, b) => a.bornTick - b.bornTick);
    if (kids.length === 0) {
      n.row = row++;
      return;
    }
    // Place the parent's own lifeline first, then its descendants below it.
    n.row = row++;
    for (const k of kids) walk(k, depth + 1);
  };
  roots.sort((a, b) => a.bornTick - b.bornTick);
  for (const r of roots) walk(r, 0);

  const links: { parent: PhyloNode; child: PhyloNode }[] = [];
  for (const n of nodes.values()) {
    if (n.parentId != null && nodes.has(n.parentId)) {
      links.push({ parent: nodes.get(n.parentId)!, child: n });
    }
  }

  const t0 = Math.min(0, ...[...nodes.values()].map((n) => n.bornTick));
  return { nodes: [...nodes.values()], links, rows: Math.max(1, row), t0 };
}
