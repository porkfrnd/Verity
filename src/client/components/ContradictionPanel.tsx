import type { Contradiction } from "../../shared/types.js";

export function ContradictionPanel({ items }: { items: Contradiction[] }) {
  if (items.length === 0)
    return <p style={{ fontSize: 14, color: "var(--ink-3)" }}>No direct contradictions detected.</p>;
  return (
    <div>
      {items.map((c, i) => (
        <div
          key={`${c.sourceA}-${c.sourceB}-${i}`}
          style={{ padding: "8px 0", borderTop: i === 0 ? "0" : "1px solid var(--border)" }}
        >
          <p style={{ margin: "0 0 3px", fontSize: 13.5, fontWeight: 600 }}>
            <span className="ev-mark" aria-hidden="true" style={{ color: "var(--ink-3)", marginRight: 6 }}>
              ≠
            </span>
            {c.topic}
          </p>
          <p style={{ margin: "0 0 3px", color: "var(--ink-3)", fontFamily: "var(--mono)", fontSize: 12 }}>
            {c.sourceA} × {c.sourceB}
          </p>
          <p style={{ margin: "0 0 3px", fontSize: 13, color: "var(--ink-2)" }}>{c.conflict}</p>
          {c.resolution && (
            <p style={{ margin: 0, fontSize: 13, color: "var(--ink-3)" }}>{c.resolution}</p>
          )}
          <p style={{ margin: "4px 0 0", fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-4)" }}>
            {c.status.replace(/_/g, " ")}
          </p>
        </div>
      ))}
    </div>
  );
}
