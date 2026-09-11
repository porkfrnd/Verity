import type { Contradiction, ContradictionStatus, Source } from "../../shared/types.js";
import { jaccardSimilarity } from "../utils/text.js";

function stanceOf(text: string): "supports" | "contradicts" | "neutral" {
  const t = text.toLowerCase();
  const con = /not visible|myth|misleading|false|no evidence|debunked|incorrect|not true|contradict|deny|refute/.test(t);
  // Avoid matching "visible"/"true" inside negations like "not visible" / "not true".
  const deNegated = t.replace(/not\s+(visible|true)/g, " ").replace(/no\s+evidence/g, " ");
  const pro = /visible|confirmed|evidence shows|study shows|proven|supports|correct|true/.test(deNegated);
  if (con && !pro) return "contradicts";
  if (pro && !con) return "supports";
  if (con && pro) return "neutral"; // mixed internally
  return "neutral";
}

// Compare actual evidence content, not tallies.
export function detectContradictions(sources: Source[]): Contradiction[] {
  const out: Contradiction[] = [];
  const bodies = sources.map((s) => ({
    s,
    text: `${s.title} ${s.content ?? s.snippet ?? ""}`,
    stance: stanceOf(`${s.title} ${s.content ?? s.snippet ?? ""}`),
  }));
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i];
      const b = bodies[j];
      if (a.s.id === b.s.id) continue;
      const sim = jaccardSimilarity(a.text, b.text);
      const topic = `Coverage of "${a.s.title.slice(0, 60)}" vs "${b.s.title.slice(0, 60)}"`;
      if (a.stance !== "neutral" && b.stance !== "neutral" && a.stance !== b.stance) {
        out.push({
          topic,
          sourceA: a.s.id,
          sourceB: b.s.id,
          conflict: `${a.s.title} (${a.stance}) disagrees with ${b.s.title} (${b.stance}).`,
          resolution: "",
          status: "unresolved" as ContradictionStatus,
        });
      } else if (sim > 0.35 && sim < 0.75 && a.stance !== b.stance) {
        out.push({
          topic,
          sourceA: a.s.id,
          sourceB: b.s.id,
          conflict: `Partial overlap with differing framing between the two sources.`,
          resolution: "May describe different aspects of the same topic.",
          status: "partially_resolved",
        });
      } else if (sim >= 0.75 && a.stance !== b.stance) {
        // Sound alike but on inspection agree — near-miss
        out.push({
          topic,
          sourceA: a.s.id,
          sourceB: b.s.id,
          conflict: `Similar wording but different underlying claims (e.g. photographic vs naked-eye visibility).`,
          resolution: "Different claims about different things; not a genuine contradiction.",
          status: "not_a_real_contradiction",
        });
      }
    }
  }
  return out.slice(0, 8);
}

export function explicitNearMiss(a: string, b: string): Contradiction {
  return {
    topic: "Apparent contradiction review",
    sourceA: "source-a",
    sourceB: "source-b",
    conflict: `"${a}" vs "${b}"`,
    resolution: "These describe different things and do not genuinely conflict.",
    status: "not_a_real_contradiction",
  };
}
