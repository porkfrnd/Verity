import { useEffect, useRef, useState } from "react";
import type { Investigation, SearchDepth, Source } from "../../shared/types.js";
import { useInvestigation } from "../hooks/useInvestigation.js";
import { useTheme } from "../hooks/useTheme.js";
import { recheckInvestigation } from "../services/api.js";
import { ClaimInput } from "../components/ClaimInput.js";
import { InvestigationProgress } from "../components/InvestigationProgress.js";
import { VerdictCard } from "../components/VerdictCard.js";
import { SearchFailedPanel } from "../components/SearchFailedPanel.js";
import { EvidenceList, SourceDetail } from "../components/EvidenceList.js";
import { ContradictionPanel } from "../components/ContradictionPanel.js";
import { CompareView } from "../components/CompareView.js";
import { Settings } from "../components/Settings.js";
import { History } from "../components/History.js";
import { ResearchOverlay } from "../components/ResearchOverlay.js";
import { SidebarNav, type NavSection } from "../components/Sidebar.js";
import { UtilityPanel } from "../components/UtilityPanel.js";
import { addToHistory, clearHistory, loadHistory, removeFromHistory } from "../services/historyStore.js";

const DEPTHS: Array<{ id: SearchDepth; label: string; hint: string }> = [
  { id: "flash", label: "FLASH", hint: "~5–15s · shallow" },
  { id: "deep", label: "DEEP", hint: "~30–60s · balanced" },
  { id: "extended", label: "EXTENDED", hint: "~90–150s · thorough" },
];

const SECTION_IDS: Record<NavSection, string> = {
  investigate: "sec-investigate",
  evidence: "sec-evidence",
  history: "sec-history",
};

export function Home() {
  const { stage, depth, setDepth, providers, counts, investigation, error, run } = useInvestigation();
  const { theme, toggle } = useTheme();
  const [history, setHistory] = useState<Investigation[]>(() => loadHistory());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selected, setSelected] = useState<Source | null>(null);
  const [compare, setCompare] = useState(false);
  const [overlay, setOverlay] = useState<Investigation | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [section, setSection] = useState<NavSection>("investigate");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);
  const pending = stage !== "idle" && stage !== "done" && stage !== "error";

  const current: Investigation | null = investigation ?? history[0] ?? null;

  async function handleSubmit(claim: string) {
    setSelected(null);
    setCompare(false);
    await run(claim);
  }

  async function handleRetry(invId: string) {
    setRetrying(true);
    try {
      const fresh = await recheckInvestigation(invId);
      setHistory((h) => addToHistory(h, fresh));
      setSelected(null);
    } catch {
      // Retry failures surface as a history no-op rather than a crash.
    } finally {
      setRetrying(false);
    }
  }

  // Track history when a new investigation lands (persisted to this browser only)
  if (investigation && !history.some((h) => h.id === investigation.id)) {
    setHistory((h) => addToHistory(h, investigation));
  }

  // Scroll-spy: highlight the nav section currently in view.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (en.isIntersecting) {
            const id = (en.target as HTMLElement).id;
            if (id === SECTION_IDS.investigate) setSection("investigate");
            else if (id === SECTION_IDS.evidence) setSection("evidence");
            else if (id === SECTION_IDS.history) setSection("history");
          }
        }
      },
      { rootMargin: "-20% 0px -65% 0px", threshold: 0 }
    );
    for (const id of Object.values(SECTION_IDS)) {
      const el = document.getElementById(id);
      if (el) obs.observe(el);
    }
    return () => obs.disconnect();
  }, [current?.id]);

  // Mobile drawer: Escape closes, background scroll locks, focus starts inside.
  useEffect(() => {
    if (!drawerOpen) return;
    drawerCloseRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [drawerOpen ]);

  function navigate(to: NavSection) {
    setSection(to);
    setDrawerOpen(false);
    document.getElementById(SECTION_IDS[to])?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const nav = (
    <SidebarNav
      active={section}
      onNavigate={navigate}
      onOpenSettings={() => {
        setDrawerOpen(false);
        setSettingsOpen(true);
      }}
      theme={theme}
      onToggleTheme={toggle}
      pending={pending}
    />
  );

  return (
    <div className="shell">
      <a className="skip-link" href="#sec-investigate">
        Skip to investigation
      </a>
      <aside className="sidebar" aria-label="Application">
        {nav}
      </aside>
      <div className="mobilebar">
        <button
          type="button"
          className="btn btn-small"
          aria-expanded={drawerOpen}
          aria-controls="mobile-nav"
          onClick={() => setDrawerOpen((v) => !v)}
        >
          ☰ Menu
        </button>
        <span className="brand">
          Verity <small>research workspace</small>
        </span>
      </div>
      {drawerOpen && (
        <div className="drawer-backdrop" onMouseDown={(e) => {
          if (e.target === e.currentTarget) setDrawerOpen(false);
        }}>
          <div id="mobile-nav" className="drawer" role="dialog" aria-modal="true" aria-label="Application navigation">
            <button ref={drawerCloseRef} type="button" className="overlay-close" onClick={() => setDrawerOpen(false)}>
              Close ✕
            </button>
            {nav}
          </div>
        </div>
      )}
      <main className="main">
        <section id="sec-investigate" aria-label="Investigation entry">
          <ClaimInput pending={pending} onSubmit={handleSubmit} />
          <div className="depth-selector" role="group" aria-label="Search depth">
            <span className="depth-kicker" aria-hidden="true">Depth</span>
            {DEPTHS.map((d) => (
              <button
                key={d.id}
                type="button"
                className={`depth-btn${depth === d.id ? " is-active" : ""}`}
                aria-pressed={depth === d.id}
                disabled={pending}
                onClick={() => setDepth(d.id)}
              >
                <strong>{d.label}</strong>
                <small>{d.hint}</small>
              </button>
            ))}
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
        </section>
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
                Search depth: {(current.depth ?? "deep").toUpperCase()}
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
                  <section aria-label="Verdict and analysis">
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
                  </section>
                  <section id="sec-evidence" aria-label="Evidence" style={{ marginTop: 14 }}>
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
                  </section>
                  {selected && (
                    <div style={{ marginTop: 12 }}>
                      <SourceDetail source={selected} stance={selectedStance} onClose={() => setSelected(null)} />
                    </div>
                  )}
                </div>
              );
            })}
            <section id="sec-history" aria-label="History" className="panel" style={{ marginTop: 14 }}>
              <p className="section-label">Recent investigations</p>
              <History
                items={history}
                onSelect={(id) => setOverlay(history.find((h) => h.id === id) ?? null)}
                onDelete={(id) => {
                  if (overlay?.id === id) setOverlay(null);
                  setHistory((h) => removeFromHistory(h, id));
                }}
                onClear={() => {
                  setOverlay(null);
                  setHistory(clearHistory());
                }}
              />
            </section>
          </div>
        )}
        <div style={{ marginTop: 12 }}>
          <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        </div>
      </main>
      <UtilityPanel stage={stage} investigation={current} />
      {overlay && <ResearchOverlay investigation={overlay} onClose={() => setOverlay(null)} />}
    </div>
  );
}
