import { useState } from "react";
import type { Investigation, Source } from "../../shared/types.js";
import { useInvestigation } from "../hooks/useInvestigation.js";
import { fetchHistoryItem } from "../services/api.js";
import { ClaimInput } from "../components/ClaimInput.js";
import { InvestigationProgress } from "../components/InvestigationProgress.js";
import { VerdictCard } from "../components/VerdictCard.js";
import { EvidenceList, SourceDetail } from "../components/EvidenceList.js";
import { ContradictionPanel } from "../components/ContradictionPanel.js";
import { CompareView } from "../components/CompareView.js";
import { Settings } from "../components/Settings.js";
import { History } from "../components/History.js";

export function Home() {
  const { stage, investigation, error, run } = useInvestigation();
  const [history, setHistory] = useState<Investigation[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selected, setSelected] = useState<Source | null>(null);
  const [compare, setCompare] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const pending = stage !== "idle" && stage !== "done" && stage !== "error";

  const current: Investigation | null =
    (selectedId ? history.find((h) => h.id === selectedId) : undefined) ?? investigation ?? history[history.length - 1] ?? null;

  async function handleSubmit(claim: string) {
    setSelected(null);
    setCompare(false);
    setSelectedId(null);
    await run(claim);
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
            Verity <small>Search first, analyze second.</small>
          </div>
          <div className="header-actions">
            <span style={{ fontSize: 12, color: "#78716c" }}>API</span>
            <button type="button" className="btn btn-small" onClick={() => setSettingsOpen(true)}>
              Settings
            </button>
          </div>
        </div>
      </header>
      <main className="main">
        <ClaimInput pending={pending} onSubmit={handleSubmit} />
        <div style={{ marginTop: 12 }}>
          <InvestigationProgress stage={stage} />
        </div>
        {error && (
          <div className="error-box" role="alert" style={{ marginTop: 12 }}>
            <strong>Investigation failed:</strong> {error}
          </div>
        )}
        {current && stage !== "extracting" && stage !== "searching" && (
          <div style={{ marginTop: 12 }}>
            <section className="panel" aria-label="Claim">
              <h2>Claim</h2>
              <p style={{ fontSize: 15 }}>&ldquo;{current.originalClaim}&rdquo;</p>
              {current.cached && <p style={{ fontSize: 12, color: "#78716c" }}>Served from cache — checked again on request via re-check.</p>}
            </section>
            {current.results.map((r) => {
              const stances: Record<string, string> = {};
              for (const e of r.analysis.evidence) stances[e.sourceId] = e.stance;
              return (
                <div key={r.claim.id} style={{ marginTop: 12 }}>
                  <div className="workspace">
                    <div>
                      <h2 style={{ fontSize: 15, color: "#57534e" }}>Evidence</h2>
                      <EvidenceList sources={r.sources} stances={stances} onSelect={setSelected} />
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
                    </div>
                    <div>
                      <h2 style={{ fontSize: 15, color: "#57534e" }}>Analysis</h2>
                      <VerdictCard result={r} />
                      <div className="panel" style={{ marginTop: 12 }}>
                        <h2>Contradictions</h2>
                        <ContradictionPanel items={r.contradictions} />
                      </div>
                    </div>
                  </div>
                  {selected && (
                    <div style={{ marginTop: 12 }}>
                      <SourceDetail source={selected} onClose={() => setSelected(null)} />
                    </div>
                  )}
                </div>
              );
            })}
            <div className="panel" style={{ marginTop: 12 }}>
              <h2>Recent investigations</h2>
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
