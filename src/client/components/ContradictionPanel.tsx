import type { Contradiction } from "../../shared/types.js";

export function ContradictionPanel({ items }: { items: Contradiction[] }) {
  if (items.length === 0) return <p style={{ fontSize: 14 }}>No direct contradictions detected.</p>;
  return (
    <div>
      {items.map((c, i) => (
        <div key={`${c.sourceA}-${c.sourceB}-${i}`} style={{ padding: "8px 0", borderTop: i === 0 ? "0" : "1px solid var(--line)" }}>
          <p style={{ margin: "0 0 3px", fontSize: 13.5, fontWeight: 600 }}>
            <span className="ev-mark" aria-hidden="true" style={{ color: "var(--ink-soft)", marginRight: 6 }}>≠</span>
            {c.topic}
          </p>
          <p style={{ margin: "0 0 3px", color: "var(--ink-soft)", fontFamily: "var(--mono)", fontSize: 12 }}>{c.sourceA} × {c.sourceB}</p>
          <p style={{ margin: "0 0 3px", fontSize: 13 }}>{c.conflict}</p>
          {c.resolution && <p style={{ margin: 0, fontSize: 13, color: "var(--ink-soft)" }}>{c.resolution}</p>}
          <p style={{ margin: "4px 0 0", fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>
            {c.status.replace(/_/g, " ")}
          </p>
        </div>
      ))}
    </div>
  );
}
