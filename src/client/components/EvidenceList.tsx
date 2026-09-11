import { useState } from "react";
import type { Source } from "../../shared/types.js";

export function SourceCard({ source, stance }: { source: Source; stance?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="source-card">
      <h3>{source.title}</h3>
      <div className="source-meta">
        <span>{source.domain}</span>
        <span>{source.sourceType}</span>
        {source.quality && <span className="quality">{source.quality}</span>}
        {stance && <span className={`stance stance-${stance}`}>{stance}</span>}
      </div>
      <p style={{ fontSize: 13, color: "#44403c" }}>{source.snippet ?? source.content?.slice(0, 220) ?? "No preview available."}</p>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="btn btn-small" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? "Hide details" : "Details"}
        </button>
        <a className="btn btn-small" href={source.url} target="_blank" rel="noreferrer">
          Open source
        </a>
      </div>
      {open && (
        <div style={{ marginTop: 8, fontSize: 13 }}>
          <p>
            <strong>URL:</strong> {source.url}
          </p>
          {source.author && (
            <p>
              <strong>Author:</strong> {source.author}
            </p>
          )}
          {source.publishedAt && (
            <p>
              <strong>Published:</strong> {source.publishedAt}
            </p>
          )}
          {source.accessStatus && (
            <p>
              <strong>Access:</strong> {source.accessStatus}
            </p>
          )}
          {source.content && <p>{source.content.slice(0, 1200)}</p>}
        </div>
      )}
    </div>
  );
}

export function SourceDetail({ source, onClose }: { source: Source; onClose: () => void }) {
  return (
    <div className="panel" role="dialog" aria-label={`Source detail: ${source.title}`}>
      <h2>Source detail</h2>
      <h3 style={{ fontSize: 15 }}>{source.title}</h3>
      <p style={{ fontSize: 13, color: "#78716c" }}>
        {source.domain} · {source.sourceType} · {source.accessStatus ?? "ok"}
      </p>
      <p style={{ fontSize: 14 }}>{source.content ?? source.snippet ?? "No content extracted."}</p>
      <button type="button" className="btn btn-small" onClick={onClose}>
        Close
      </button>
    </div>
  );
}

export function EvidenceList({
  sources,
  stances,
  onSelect,
}: {
  sources: Source[];
  stances?: Record<string, string>;
  onSelect?: (s: Source) => void;
}) {
  if (sources.length === 0) return <p style={{ fontSize: 14 }}>No sources — insufficient evidence to judge.</p>;
  return (
    <div>
      {sources.map((s) => (
        <div key={s.id}>
          <SourceCard source={s} stance={stances?.[s.id]} />
          {onSelect && (
            <button type="button" className="btn btn-small" style={{ margin: "-4px 0 8px" }} onClick={() => onSelect(s)}>
              Inspect {s.id}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
