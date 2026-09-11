import { VERDICT_LABELS, type ClaimVerdict, type Confidence } from "../../shared/types.js";

function confidenceLevel(c: Confidence): number {
  return c === "high" ? 3 : c === "medium" ? 2 : 1;
}

export function VerdictCard({ result }: { result: ClaimVerdict }) {
  const { analysis, claim } = result;
  const supports = analysis.evidence.filter((e) => e.stance === "supports");
  const contradicts = analysis.evidence.filter((e) => e.stance === "contradicts");
  const context = analysis.evidence.filter((e) => e.stance !== "supports" && e.stance !== "contradicts");
  const level = confidenceLevel(analysis.confidence);

  return (
    <article className="panel verdict-block" aria-label={`Verdict for ${claim.text}`}>
      <p className="verdict-kicker">Verdict</p>
      <p className={`verdict-value verdict-${analysis.verdict}`}>{VERDICT_LABELS[analysis.verdict]}</p>
      <div className="confidence-row" aria-label={`Confidence: ${analysis.confidence}`}>
        <span>confidence</span>
        <span className="conf-segments" aria-hidden="true">
          {[1, 2, 3].map((i) => (
            <i key={i} className={i <= level ? "on" : ""} />
          ))}
        </span>
        <span>{analysis.confidence}</span>
      </div>
      <p className="verdict-summary">{analysis.summary}</p>
      {result.staleNote && <p className="stale-note">{result.staleNote}</p>}
      {analysis.evidence.length === 0 ? (
        <p style={{ fontSize: 14 }}>No direct evidence was available — hence {VERDICT_LABELS[analysis.verdict]}.</p>
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
        <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>Missing: {analysis.missing_information.join("; ")}</p>
      )}
    </article>
  );
}
