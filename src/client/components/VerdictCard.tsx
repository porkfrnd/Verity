import { VERDICT_LABELS, type ClaimVerdict, type ConfidenceScore } from "../../shared/types.js";

const BREAKDOWN_LABELS: Record<string, string> = {
  evidence_strength: "Evidence strength",
  source_quality: "Source quality",
  source_independence: "Source independence",
  cross_source_agreement: "Cross-source agreement",
  directness_coverage: "Directness & coverage",
  primary_sources: "Primary sources",
  freshness: "Freshness",
  contradictions: "Contradictions",
  bounds_clamp: "Bounds",
};

function ConfidenceMeter({ score }: { score: ConfidenceScore }) {
  return (
    <div style={{ margin: "6px 0 8px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span
          style={{ fontSize: 32, fontWeight: 780, letterSpacing: "-0.025em", lineHeight: 1 }}
          aria-label={`${score.percentage}% confidence in the verdict`}
        >
          {score.percentage}%
        </span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--ink-4)" }}>
          confidence in this verdict
        </span>
      </div>
      <div className="conf-bar" role="img" aria-label={`Confidence meter: ${score.percentage} out of 100`}>
        <i style={{ width: `${score.percentage}%` }} />
      </div>
      <details className="conf-breakdown">
        <summary>Why {score.percentage}%? (deterministic breakdown)</summary>
        <ul>
          {Object.entries(score.breakdown).map(([k, v]) => (
            <li key={k}>
              <span>{BREAKDOWN_LABELS[k] ?? k}</span>
              <span className="conf-val">{v > 0 ? `+${v}` : v}</span>
            </li>
          ))}
        </ul>
        <p>
          Computed by Verity&apos;s scoring formula from the evidence above — never chosen by the AI. Same evidence
          always yields the same number.
        </p>
      </details>
    </div>
  );
}

export function VerdictCard({ result }: { result: ClaimVerdict }) {
  const { analysis, claim } = result;
  const supports = analysis.evidence.filter((e) => e.stance === "supports");
  const contradicts = analysis.evidence.filter((e) => e.stance === "contradicts");
  const context = analysis.evidence.filter((e) => e.stance !== "supports" && e.stance !== "contradicts");

  return (
    <article className="panel verdict-block" aria-label={`Verdict for ${claim.text}`}>
      <p className="verdict-kicker">Verdict</p>
      <p className={`verdict-value verdict-${analysis.verdict}`}>{VERDICT_LABELS[analysis.verdict]}</p>
      {analysis.verdict === "unverified" && (
        <p className="insufficient-note">
          <strong>Insufficient evidence</strong> — search completed, but the retrieved sources did not provide enough
          reliable evidence to reach a verdict. This is not confidence that the claim is false.
        </p>
      )}
      {result.confidence && <ConfidenceMeter score={result.confidence} />}
      <p className="verdict-summary">{analysis.summary}</p>
      {result.staleNote && <p className="stale-note">{result.staleNote}</p>}
      {analysis.evidence.length === 0 ? (
        <p style={{ fontSize: 14, color: "var(--ink-2)" }}>
          No direct evidence was available — hence {VERDICT_LABELS[analysis.verdict]}.
        </p>
      ) : (
        <div>
          {contradicts.length > 0 && (
            <div className="evidence-group ev-contradicts">
              <h4>Contradicting evidence</h4>
              <ul>
                {contradicts.map((e) => (
                  <li key={e.sourceId}>
                    <span className="ev-mark" aria-hidden="true">−</span>
                    <span>
                      <strong>{e.sourceId}</strong> [{e.strength}] — {e.reason}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {supports.length > 0 && (
            <div className="evidence-group ev-supports">
              <h4>Supporting evidence</h4>
              <ul>
                {supports.map((e) => (
                  <li key={e.sourceId}>
                    <span className="ev-mark" aria-hidden="true">+</span>
                    <span>
                      <strong>{e.sourceId}</strong> [{e.strength}] — {e.reason}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {context.length > 0 && (
            <div className="evidence-group">
              <h4>Context</h4>
              <ul>
                {context.map((e) => (
                  <li key={e.sourceId}>
                    <span className="ev-mark" aria-hidden="true">•</span>
                    <span>
                      <strong>{e.sourceId}</strong> [{e.strength}] — {e.reason}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {analysis.missing_information.length > 0 && (
        <p style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 8 }}>
          Missing: {analysis.missing_information.join("; ")}
        </p>
      )}
    </article>
  );
}
