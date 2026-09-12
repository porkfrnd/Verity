import type { Stage } from "../hooks/useInvestigation.js";
import type { ProviderState } from "../hooks/useInvestigation.js";

const STEPS: Array<{ id: string; label: string }> = [
  { id: "extracting", label: "Claim extracted" },
  { id: "searching", label: "Searching sources" },
  { id: "evaluating", label: "Evaluating evidence" },
  { id: "contradictions", label: "Checking contradictions" },
  { id: "verdict", label: "Preparing verdict" },
];

function formatLatency(ms?: number): string {
  if (ms === undefined) return "";
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export function InvestigationProgress({
  stage,
  providers,
  totalFound,
  uniqueCount,
  budgetExhausted,
  earlyStopped,
}: {
  stage: Stage;
  providers?: ProviderState[];
  totalFound?: number;
  uniqueCount?: number;
  budgetExhausted?: boolean;
  earlyStopped?: string | null;
}) {
  if (stage === "idle") return null;
  const order = STEPS.map((s) => s.id);
  const activeIdx = order.indexOf(stage === "done" || stage === "error" ? "verdict" : stage);
  const showProviders = (providers ?? []).length > 0;
  return (
    <section className="panel" aria-label="Investigation progress">
      <p className="section-label">Investigation</p>
      <ol className="progress-steps">
        {STEPS.map((s, i) => {
          const done = stage === "done" || i < activeIdx;
          const active = i === activeIdx && stage !== "done" && stage !== "error";
          return (
            <li
              key={s.id}
              aria-current={active ? "step" : undefined}
              className={done ? "is-done" : active ? "is-active" : ""}
            >
              <span className="step-mark" aria-hidden="true">
                {done ? "✓" : active ? "●" : "○"}
              </span>
              <span>{s.label}</span>
            </li>
          );
        })}
      </ol>
      {showProviders && (
        <div style={{ marginTop: 10 }}>
          <p className="section-label">Providers</p>
          <ul className="provider-rows" aria-label="Search provider status">
            {providers!.map((p) => (
              <li key={p.provider} className={`provider-row is-${p.status}`}>
                <span className="step-mark" aria-hidden="true">
                  {p.status === "success" ? "✓" : p.status === "pending" ? "●" : "⚠"}
                </span>
                <span className="provider-name">{p.provider}</span>
                <span className="provider-stat">
                  {p.status === "success"
                    ? `${formatLatency(p.latencyMs)} — ${p.sources ?? 0} sources`
                    : p.status === "pending"
                      ? "searching…"
                      : `${p.status}${p.latencyMs !== undefined ? ` — ${formatLatency(p.latencyMs)}` : ""}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {(totalFound !== undefined && totalFound > 0) || budgetExhausted || earlyStopped ? (
        <p className="search-totals" aria-live="polite">
          {totalFound !== undefined && totalFound > 0 && (
            <span>
              {totalFound} sources found · {uniqueCount ?? 0} unique after dedup
            </span>
          )}
          {earlyStopped && <span> · stopped early: {earlyStopped}</span>}
          {budgetExhausted && <span> · search budget exhausted — analyzed what was collected</span>}
        </p>
      ) : null}
    </section>
  );
}
