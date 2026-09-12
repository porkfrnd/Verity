import { useEffect, useRef } from "react";
import type { Investigation } from "../../shared/types.js";
import { VerdictCard } from "./VerdictCard.js";
import { SearchFailedPanel } from "./SearchFailedPanel.js";
import { EvidenceList } from "./EvidenceList.js";
import { ContradictionPanel } from "./ContradictionPanel.js";

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/**
 * Compact research record opened OVER the workspace. Reads the stored
 * investigation only — never re-verifies, never navigates. Escape closes,
 * background scroll locks, focus starts on Close and returns on unmount.
 */
export function ResearchOverlay({ investigation, onClose }: { investigation: Investigation; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<Element | null>(null);

  useEffect(() => {
    previousFocus.current = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      if (previousFocus.current instanceof HTMLElement) previousFocus.current.focus();
    };
  }, [onClose]);

  return (
    <div
      className="overlay-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="overlay-frame" role="dialog" aria-modal="true" aria-label={`Research record: ${investigation.originalClaim.slice(0, 80)}`}>
        <div className="overlay-head">
          <div style={{ minWidth: 0 }}>
            <p className="section-label">Research record</p>
            <p className="claim-original">&ldquo;{investigation.originalClaim}&rdquo;</p>
            <p className="overlay-meta">
              <span>depth: {investigation.depth.toUpperCase()}</span>
              <span>{formatTime(investigation.createdAt)}</span>
              {investigation.cached && <span>cached</span>}
            </p>
          </div>
          <button ref={closeRef} type="button" className="overlay-close" onClick={onClose}>
            Close ✕
          </button>
        </div>
        <div className="overlay-body">
          {investigation.results.map((r) => {
            const stances: Record<string, string> = {};
            for (const e of r.analysis.evidence) stances[e.sourceId] = e.stance;
            return (
              <div key={r.claim.id} style={{ marginBottom: 14 }}>
                {investigation.results.length > 1 && (
                  <p style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--muted)", margin: "0 0 6px" }}>
                    {r.claim.id} · {r.claim.text}
                  </p>
                )}
                {r.searchFailed ? (
                  <SearchFailedPanel report={r.searchReport} retrying={false} />
                ) : (
                  <VerdictCard result={r} />
                )}
                {r.analysis.reasoning_summary && (
                  <p style={{ fontSize: 13, color: "var(--ink-soft)", margin: "8px 0 0" }}>{r.analysis.reasoning_summary}</p>
                )}
                {!r.searchFailed && r.contradictions.length > 0 && (
                  <div className="panel" style={{ marginTop: 10 }}>
                    <p className="section-label">Contradictions</p>
                    <ContradictionPanel items={r.contradictions} />
                  </div>
                )}
                <p className="section-label" style={{ marginTop: 12 }}>
                  Sources · {r.sources.length}
                </p>
                <EvidenceList sources={r.sources} stances={stances} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
