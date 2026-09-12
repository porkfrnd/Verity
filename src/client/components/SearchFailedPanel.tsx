import type { SearchReport } from "../../shared/types.js";

export function SearchFailedPanel({
  report,
  retrying,
  onRetry,
}: {
  report: SearchReport;
  retrying: boolean;
  onRetry?: () => void;
}) {
  return (
    <article className="panel verdict-block" aria-label="Search failed">
      <p className="verdict-kicker">Verdict</p>
      <p className="verdict-value verdict-unverified">SEARCH FAILED</p>
      <p className="verdict-summary">
        Evidence could not be collected because the available search providers failed. No verdict was reached and no
        AI analysis was run — there was nothing to analyze.
      </p>
      <div className="evidence-group">
        <h4>Provider status</h4>
        <ul>
          {report.providers.length === 0 && <li>No provider reports recorded.</li>}
          {report.providers.map((p) => (
            <li key={p.provider}>
              <span className="ev-mark" aria-hidden="true">
                {p.status === "success" ? "+" : "−"}
              </span>
              <span>
                <strong>{p.provider}</strong> — {p.status}
                {p.latencyMs !== undefined ? ` · ${(p.latencyMs / 1000).toFixed(1)}s` : ""}
                {p.retries > 0 ? ` · ${p.retries} retr${p.retries === 1 ? "y" : "ies"}` : ""}
                {typeof p.httpStatus === "number" ? ` · HTTP ${p.httpStatus}` : ""}
                {p.error ? ` · ${p.error}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </div>
      {report.budgetExhausted && (
        <p className="stale-note">The search budget was exhausted before providers finished.</p>
      )}
      <div style={{ marginTop: 10 }}>
        {onRetry && (
          <button type="button" className="btn btn-primary" disabled={retrying} onClick={onRetry}>
            {retrying ? "Retrying…" : "Retry search"}
          </button>
        )}
      </div>
    </article>
  );
}
