import { useState } from "react";
import type { Investigation, SearchDepth, Source } from "../../shared/types.js";
import { useInvestigation } from "../hooks/useInvestigation.js";
import { fetchHistoryItem, recheckInvestigation } from "../services/api.js";
import { ClaimInput } from "../components/ClaimInput.js";
import { InvestigationProgress } from "../components/InvestigationProgress.js";
import { VerdictCard } from "../components/VerdictCard.js";
import { SearchFailedPanel } from "../components/SearchFailedPanel.js";
import { EvidenceList, SourceDetail } from "../components/EvidenceList.js";
import { ContradictionPanel } from "../components/ContradictionPanel.js";
import { CompareView } from "../components/CompareView.js";
import { Settings } from "../components/Settings.js";
import { History } from "../components/History.js";

const DEPTHS: Array<{ id: SearchDepth; label: string; hint: string }> = [
  { id: "flash", label: "Flash", hint: "Fast · ~5–15s" },
  { id: "deep", label: "Deep", hint: "Balanced · recommended" },
  { id: "extended", label: "Extended", hint: "Thorough · slower" },
];

export function Home() {
  const { stage, depth, setDepth, providers, counts, investigation, error, run } = useInvestigation();
  const [history, setHistory] = useState<Investigation[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selected, setSelected] = useState<Source | null>(null);
  const [compare, setCompare] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const pending = stage !== "idle" && stage !== "done" && stage !== "error";

  const current: Investigation | null =
    (selectedId ? history.find((h) => h.id === selectedId) : undefined) ?? investigation ?? history[history.length - 1] ?? null;

  async function handleSubmit(claim: string) {
    setSelected(null);
    setCompare(false);
    setSelectedId(null);
    await run(claim);
  }

  async function handleRetry(invId: string) {
    setRetrying(true);
    try {
      const fresh = await recheckInvestigation(invId);
      setHistory((h) => [...h, fresh]);
      setSelectedId(fresh.id);
      setSelected(null);
    } catch {
      // The error box below shows investigation errors; retry failures surface
      // as a history no-op rather than a crash.
    } finally {
      setRetrying(false);
    }
  }

  // Track history when a new investigation lands
  if (investigation && !history.some((h) => h.id === investigation.id)) {
    setHistory((h) => [...h, investigation]);
  }

  return (
    <div>
      <header className="app-header">
        <div className="app-header-inner">
          <div className="brand">
            Verity <small>search first · analyze second</small>
          </div>
          <div className="header-actions">
            <span className="api-tag">API</span>
            <button type="button" className="btn btn-small" onClick={() => setSettingsOpen(true)}>
              Settings
            </button>
          </div>
        </div>
      </header>
      <main className="main">
        <ClaimInput pending={pending} onSubmit={handleSubmit} />
        <div className="depth-selector" role="group" aria-label="Search depth">
          <span className="depth-kicker">Search depth</span>
          {DEPTHS.map((d) => (
            <button
              key={d.id}
              type="button"
              className={`depth-btn${depth === d.id ? " is-active" : ""}`}
              aria-pressed={depth === d.id}
              disabled={pending}
              onClick={() => setDepth(d.id)}
              title={d.hint}
            >
              {d.label}
            </button>
          ))}
          <span className="depth-hint">{DEPTHS.find((d) => d.id === depth)?.hint}</span>
        </div>
        <div style={{ marginTop: 12 }}>
          <InvestigationProgress
            stage={stage}
            providers={providers}
            totalFound={counts.totalFound}
            uniqueCount={counts.uniqueCount}
            budgetExhausted={counts.budgetExhausted}
            earlyStopped={counts.earlyStopped}
          />
        </div>
        {error && (
          <div className="error-box" role="alert" style={{ marginTop: 12 }}>
            <strong>Investigation failed:</strong> {error}
          </div>
        )}
        {current && stage !== "extracting" && stage !== "searching" && (
          <div style={{ marginTop: 14 }}>
            <section className="panel" aria-label="Claim">
              <p className="section-label">Original claim</p>
              <p className="claim-original">&ldquo;{current.originalClaim}&rdquo;</p>
              {current.extraction.claims.length > 1 && (
                <div>
                  <p className="section-label" style={{ marginTop: 12 }}>
                    Extracted claims
                  </p>
                  <ol className="claim-list">
                    {current.extraction.claims.map((c, i) => {
                      const verdict = current.results.find((r) => r.claim.id === c.id)?.analysis.verdict;
                      return (
                        <li key={c.id}>
                          <span className="claim-num">{String(i + 1).padStart(2, "0")}</span>
                          <span>{c.text}</span>
                          {verdict && <span className="claim-verdict">{verdict.replace(/_/g, " ")}</span>}
                        </li>
                      );
                    })}
                  </ol>
                </div>
              )}
              <p className="depth-record">
                Search depth: {current.depth.toUpperCase()}
                {current.cached ? " · cached result — re-check runs a fresh search" : ""}
              </p>
            </section>
            {current.results.map((r) => {
              const stances: Record<string, string> = {};
              for (const e of r.analysis.evidence) stances[e.sourceId] = e.stance;
              const factChecks = r.sources.filter((s) => s.isFactCheck);
              const webSources = r.sources.filter((s) => !s.isFactCheck);
              const selectedStance = selected ? stances[selected.id] : undefined;
              const showDiagnostics = r.searchReport.providers.length > 0;
              return (
                <div key={r.claim.id} style={{ marginTop: 14 }}>
                  {current.results.length > 1 && (
                    <p style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--muted)", margin: "0 0 6px" }}>
                      {r.claim.id} · {r.claim.text}
                    </p>
                  )}
                  <div className="workspace" style={{ marginTop: 0 }}>
                    <div>
                      <p className="section-label">
                        Evidence · {r.searchReport.uniqueCount} unique ({r.searchReport.totalFound} found)
                      </p>
                      {factChecks.length > 0 && (
                        <section aria-label="Prior fact-checks" style={{ marginBottom: 12 }}>
                          <p className="section-label">Prior fact-checks found</p>
                          <EvidenceList sources={factChecks} stances={stances} onSelect={setSelected} />
                        </section>
                      )}
                      <section aria-label="Search evidence">
                        {factChecks.length > 0 && <p className="section-label">Search evidence</p>}
                        <EvidenceList sources={webSources} stances={stances} onSelect={setSelected} />
                      </section>
                      {r.sources.length >= 2 && (
                        <button type="button" className="btn btn-small" style={{ marginTop: 8 }} onClick={() => setCompare((v) => !v)}>
                          {compare ? "Hide compare view" : "Compare evidence"}
                        </button>
                      )}
                      {compare && (
                        <div style={{ marginTop: 8 }}>
                          <CompareView sources={r.sources} />
                        </div>
                      )}
                      {showDiagnostics && (
                        <details className="diagnostics">
                          <summary>Search diagnostics ({r.searchReport.providers.length} providers)</summary>
                          <ul>
                            {r.searchReport.providers.map((p) => (
                              <li key={p.provider}>
                                <strong>{p.provider}</strong> · {p.status} · {(p.latencyMs / 1000).toFixed(1)}s ·{" "}
                                {p.sources} sources · {p.retries} retr{p.retries === 1 ? "y" : "ies"}
                                {typeof p.httpStatus === "number" ? ` · HTTP ${p.httpStatus}` : ""}
                                {p.error ? ` · ${p.error}` : ""}
                              </li>
                            ))}
                          </ul>
                          {r.searchReport.budgetExhausted && <p>Search budget exhausted — analyzed what was collected.</p>}
                        </details>
                      )}
                    </div>
                    <div>
                      <p className="section-label">Analysis</p>
                      {r.searchFailed ? (
                        <SearchFailedPanel report={r.searchReport} retrying={retrying} onRetry={() => handleRetry(current.id)} />
                      ) : (
                        <VerdictCard result={r} />
                      )}
                      {!r.searchFailed && (
                        <div className="panel" style={{ marginTop: 12 }}>
                          <p className="section-label">Contradictions</p>
                          <ContradictionPanel items={r.contradictions} />
                        </div>
                      )}
                    </div>
                  </div>
                  {selected && (
                    <div style={{ marginTop: 12 }}>
                      <SourceDetail source={selected} stance={selectedStance} onClose={() => setSelected(null)} />
                    </div>
                  )}
                </div>
              );
            })}
            <div className="panel" style={{ marginTop: 14 }}>
              <p className="section-label">Recent investigations</p>
              <History
                items={history}
                onSelect={async (id) => {
                  setSelectedId(id);
                  setSelected(null);
                  try {
                    const item = await fetchHistoryItem(id);
                    setHistory((h) => (h.some((x) => x.id === item.id) ? h : [...h, item]));
                  } catch {
                    // session-local history already shows the item
                  }
                }}
              />
            </div>
          </div>
        )}
        <div style={{ marginTop: 12 }}>
          <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        </div>
      </main>
    </div>
  );
}
