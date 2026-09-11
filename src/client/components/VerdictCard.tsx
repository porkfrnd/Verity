import { VERDICT_LABELS, type ClaimVerdict } from "../../shared/types.js";

export function VerdictCard({ result }: { result: ClaimVerdict }) {
  const { analysis, claim } = result;
  return (
    <article className="panel" aria-label={`Verdict for ${claim.text}`}>
      <h2>Verdict</h2>
      <p style={{ fontSize: 13, color: "#78716c" }}>{claim.text}</p>
      <p>
        <span className={`verdict-badge verdict-${analysis.verdict}`}>{VERDICT_LABELS[analysis.verdict]}</span>{" "}
        <span style={{ fontSize: 13, color: "#57534e" }}>· {analysis.confidence} confidence</span>
      </p>
      <p style={{ fontSize: 15 }}>{analysis.summary}</p>
      {result.staleNote && (
        <p style={{ fontSize: 12, color: "#b45309" }} role="note">
          {result.staleNote}
        </p>
      )}
      <h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", color: "#78716c" }}>Why?</h3>
      {analysis.evidence.length === 0 ? (
        <p style={{ fontSize: 14 }}>No direct evidence was available — hence {VERDICT_LABELS[analysis.verdict]}.</p>
      ) : (
        <ul className="why-list">
          {analysis.evidence.slice(0, 5).map((e) => (
            <li key={e.sourceId}>
              {e.stance === "contradicts" ? "✗" : e.stance === "supports" ? "✓" : "•"} [{e.strength}] {e.sourceId}: {e.reason}
            </li>
          ))}
        </ul>
      )}
      {analysis.missing_information.length > 0 && (
        <p style={{ fontSize: 13, color: "#57534e" }}>Missing: {analysis.missing_information.join("; ")}</p>
      )}
    </article>
  );
}
