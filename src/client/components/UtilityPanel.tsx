import type { Investigation } from "../../shared/types.js";
import { VERDICT_LABELS } from "../../shared/types.js";

function qualityCounts(inv: Investigation): Array<[string, number]> {
  const map = new Map<string, number>();
  for (const r of inv.results) {
    for (const s of r.sources) {
      const label = s.quality ?? s.sourceType;
      map.set(label, (map.get(label) ?? 0) + 1);
    }
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
}

/**
 * Right-side utility panel: live status and context for the current
 * investigation. Renders only real data — compact empty state when idle.
 */
export function UtilityPanel({ stage, investigation }: { stage: string; investigation: Investigation | null }) {
  const result = investigation?.results[0];
  const strongest = result?.sources[0];
  const qualities = investigation ? qualityCounts(investigation) : [];
  const confidence = result?.confidence?.percentage ?? null;

  return (
    <aside className="utility" aria-label="Investigation details">
      <p className="section-label">Details</p>
      {!investigation || !result ? (
        <p className="util-empty">Run an investigation to populate this panel.</p>
      ) : (
        <dl className="util-grid">
          <dt>Status</dt>
          <dd>{stage === "done" ? "complete" : stage === "error" ? "failed" : stage.replace(/_/g, " ")}</dd>
          <dt>Depth</dt>
          <dd>{(investigation.depth ?? "deep").toUpperCase()}</dd>
          <dt>Verdict</dt>
          <dd>{result.searchFailed ? "SEARCH FAILED" : VERDICT_LABELS[result.analysis.verdict]}</dd>
          {confidence !== null && (
            <>
              <dt>Confidence</dt>
              <dd>{confidence}%</dd>
            </>
          )}
          <dt>Sources</dt>
          <dd>
            {result.sources.length} shown · {result.searchReport.uniqueCount} unique
          </dd>
          {strongest && (
            <>
              <dt>Strongest</dt>
              <dd>
                <span className="util-strong">{strongest.domain}</span>
                <span className="util-sub">{strongest.title.slice(0, 90)}</span>
              </dd>
            </>
          )}
          {qualities.length > 0 && (
            <>
              <dt>Quality</dt>
              <dd>{qualities.map(([label, n]) => `${label} ×${n}`).join(" · ")}</dd>
            </>
          )}
          <dt>Verified</dt>
          <dd>{result.verifiedAt ? new Date(result.verifiedAt).toLocaleString() : "—"}</dd>
        </dl>
      )}
    </aside>
  );
}
