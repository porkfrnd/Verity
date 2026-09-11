import type { Source } from "../../shared/types.js";

export function CompareView({ sources }: { sources: Source[] }) {
  if (sources.length < 2) return <p style={{ fontSize: 14 }}>Need at least two sources to compare.</p>;
  const [a, b] = sources;
  return (
    <div className="compare-grid" aria-label="Compare evidence">
      {[a, b].map((s) => (
        <div key={s.id} className="source-card">
          <h3>{s.title}</h3>
          <div className="source-meta">
            <span>{s.domain}</span>
            <span>{s.sourceType}</span>
          </div>
          <p style={{ fontSize: 13 }}>{(s.content ?? s.snippet ?? "").slice(0, 600)}</p>
          <a href={s.url} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>
            {s.url}
          </a>
        </div>
      ))}
    </div>
  );
}
