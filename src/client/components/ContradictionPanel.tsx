import type { Contradiction } from "../../shared/types.js";

export function ContradictionPanel({ items }: { items: Contradiction[] }) {
  if (items.length === 0) return <p style={{ fontSize: 14 }}>No direct contradictions detected.</p>;
  return (
    <div>
      {items.map((c, i) => (
        <div key={`${c.sourceA}-${c.sourceB}-${i}`} className="source-card">
          <h3>{c.topic}</h3>
          <p style={{ fontSize: 13 }}>
            <strong>{c.sourceA}</strong> vs <strong>{c.sourceB}</strong>
          </p>
          <p style={{ fontSize: 13 }}>{c.conflict}</p>
          {c.resolution && <p style={{ fontSize: 13, color: "#57534e" }}>Resolution: {c.resolution}</p>}
          <p>
            <span className="quality">{c.status.replace(/_/g, " ")}</span>
          </p>
        </div>
      ))}
    </div>
  );
}
