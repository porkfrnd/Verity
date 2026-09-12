import { useEffect, useRef, useState } from "react";
import type { Source } from "../../shared/types.js";

function timeAgo(iso?: string): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const days = Math.floor((Date.now() - t) / 86_400_000);
  if (days < 0) return null;
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} mo ago`;
  return `${Math.floor(days / 365)} yr ago`;
}

export function SourceCard({ source, stance, onInspect }: { source: Source; stance?: string; onInspect?: () => void }) {
  const [open, setOpen] = useState(false);
  const ago = timeAgo(source.publishedAt);
  return (
    <article className="source-row">
      <div className="source-topline">
        <span className="source-domain">{source.domain}</span>
        <span className="source-quality">
          {stance && <span className={`stance stance-${stance}`}>{stance}</span>}
          {stance && " · "}
          {source.quality ?? source.sourceType}
        </span>
      </div>
      <h3 className="source-title">
        <a href={source.url} target="_blank" rel="noreferrer">
          {source.title}
        </a>
      </h3>
      <p className="source-excerpt">{source.snippet ?? source.content?.slice(0, 220) ?? "No preview available."}</p>
      <div className="source-meta">
        <span className="type-tag">{source.sourceType}</span>
        {ago && <span>{ago}</span>}
        {source.accessStatus && source.accessStatus !== "ok" && <span>via {source.accessStatus.replace(/_/g, " ")}</span>}
      </div>
      <div className="source-actions">
        <button type="button" className="link-btn" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? "Hide details" : "Details"}
        </button>
        <a className="link-btn" href={source.url} target="_blank" rel="noreferrer">
          Open source <span aria-hidden="true">↗</span>
        </a>
        {onInspect && (
          <button type="button" className="link-btn" onClick={onInspect}>
            Inspect <span aria-hidden="true">→</span>
          </button>
        )}
      </div>
      {open && source.content && (
        <div style={{ marginTop: 8, fontSize: 13 }}>
          <p style={{ whiteSpace: "pre-wrap" }}>{source.content.slice(0, 1200)}</p>
        </div>
      )}
    </article>
  );
}

// Backwards-compatible alias (older tests/e2e look for a "Details" toggle).
export function SourceRowWithDetails(props: { source: Source; stance?: string }) {
  return <SourceCard {...props} />;
}

export function SourceDetail({
  source,
  stance,
  onClose,
}: {
  source: Source;
  stance?: string;
  onClose: () => void;
}) {
  const ago = timeAgo(source.publishedAt);
  return (
    <div className="panel" role="dialog" aria-label={`Source detail: ${source.title}`}>
      <p className="section-label">Source</p>
      <h3 style={{ fontSize: 16, margin: "0 0 2px" }}>{source.title}</h3>
      <p style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--muted)", margin: "0 0 4px" }}>
        {source.domain}
      </p>
      <dl className="detail-grid">
        <dt>Publisher</dt>
        <dd>{source.author ?? source.domain}</dd>
        <dt>Published</dt>
        <dd>
          {source.publishedAt ?? "unknown"}
          {ago ? ` (${ago})` : ""}
        </dd>
        <dt>Type</dt>
        <dd>{source.sourceType}</dd>
        <dt>Quality</dt>
        <dd>{source.quality ?? "—"}</dd>
        <dt>Access</dt>
        <dd>{(source.accessStatus ?? "ok").replace(/_/g, " ")}</dd>
      </dl>
      <div className="detail-section">
        <h4>Relevant evidence</h4>
        <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{source.content ?? source.snippet ?? "No content extracted."}</p>
      </div>
      <div className="detail-section">
        <h4>Relation to claim</h4>
        <p style={{ margin: 0 }}>
          {stance ? <span className={`stance stance-${stance}`}>{stance}</span> : "Not cited in the verdict."}
        </p>
      </div>
      <div className="detail-section">
        <h4>Location</h4>
        <p style={{ margin: 0, fontFamily: "var(--mono)", fontSize: 12, overflowWrap: "anywhere" }}>{source.url}</p>
      </div>
      <div style={{ marginTop: 10, display: "flex", gap: 12 }}>
        <a className="link-btn" href={source.url} target="_blank" rel="noreferrer">
          Open source <span aria-hidden="true">↗</span>
        </a>
        <button type="button" className="link-btn" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

/**
 * Layered source stack: backend order IS strength order (strongest first),
 * so rank comes from position plus the backend's own quality/stance labels —
 * never invented. An IntersectionObserver tracks which card sits in the
 * focus band so it can rise while others settle; no scroll handlers, no
 * hijacking, keyboard/touch/wheel all behave natively.
 */
export function SourceStack({
  sources,
  stances,
  onSelect,
}: {
  sources: Source[];
  stances?: Record<string, string>;
  onSelect?: (s: Source) => void;
}) {
  const [active, setActive] = useState(0);
  const cards = useRef(new Map<number, HTMLDivElement>());

  useEffect(() => {
    setActive(0);
    if (typeof IntersectionObserver === "undefined") return;
    const seen = new Map<number, boolean>();
    const obs = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          const i = Number((en.target as HTMLElement).dataset.index);
          if (Number.isInteger(i)) seen.set(i, en.isIntersecting);
        }
        let top: number | null = null;
        for (const [i, visible] of seen) {
          if (visible && (top === null || i < top)) top = i;
        }
        if (top !== null) setActive(top);
      },
      { rootMargin: "-25% 0px -60% 0px", threshold: 0 }
    );
    cards.current.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [sources]);

  if (sources.length === 0) return <p style={{ fontSize: 14 }}>No sources — insufficient evidence to judge.</p>;
  return (
    <div className="source-stack" role="list" aria-label={`${sources.length} sources, strongest first`}>
      {sources.map((s, i) => (
        <div
          key={s.id}
          role="listitem"
          data-index={i}
          ref={(el) => {
            if (el) cards.current.set(i, el);
            else cards.current.delete(i);
          }}
          className={`stack-card${i === 0 ? " is-top" : " is-lower"}${i === active ? " is-active" : i < active ? " is-past" : ""}`}
        >
          <p className="stack-rank" aria-hidden="true">
            <span className="rank-num">#{i + 1}</span>
            {i === 0 ? (
              <span className="rank-note">strongest evidence</span>
            ) : (
              <span className="rank-note">
                {[stances?.[s.id], s.quality].filter(Boolean).join(" · ")}
              </span>
            )}
          </p>
          <SourceCard
            source={s}
            stance={stances?.[s.id]}
            onInspect={onSelect ? () => onSelect(s) : undefined}
          />
        </div>
      ))}
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
  return <SourceStack sources={sources} stances={stances} onSelect={onSelect} />;
}
