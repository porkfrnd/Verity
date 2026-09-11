import type { Stage } from "../hooks/useInvestigation.js";

const STEPS: Array<{ id: string; label: string }> = [
  { id: "extracting", label: "Claim extracted" },
  { id: "searching", label: "Searching sources" },
  { id: "evaluating", label: "Evaluating evidence" },
  { id: "contradictions", label: "Checking contradictions" },
  { id: "verdict", label: "Preparing verdict" },
];

export function InvestigationProgress({ stage }: { stage: Stage }) {
  if (stage === "idle") return null;
  const order = STEPS.map((s) => s.id);
  const activeIdx = order.indexOf(stage === "done" || stage === "error" ? "verdict" : stage);
  return (
    <section className="panel" aria-label="Investigation progress">
      <p className="section-label">Investigation</p>
      <ol className="progress-steps">
        {STEPS.map((s, i) => {
          const done = stage === "done" || i < activeIdx;
          const active = i === activeIdx && stage !== "done" && stage !== "error";
          return (
            <li key={s.id} aria-current={active ? "step" : undefined} className={done ? "is-done" : active ? "is-active" : ""}>
              <span className="step-mark" aria-hidden="true">
                {done ? "✓" : active ? "●" : "○"}
              </span>
              <span>{s.label}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
