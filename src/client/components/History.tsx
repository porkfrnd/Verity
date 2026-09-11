import type { Investigation } from "../../shared/types.js";
import { VERDICT_LABELS } from "../../shared/types.js";

export function History({
  items,
  onSelect,
}: {
  items: Investigation[];
  onSelect: (id: string) => void;
}) {
  if (items.length === 0) return <p style={{ fontSize: 14 }}>No investigations yet this session.</p>;
  return (
    <ul className="history-list" aria-label="Recent investigations">
      {items.slice(-8).reverse().map((inv) => {
        const first = inv.results[0];
        return (
          <li key={inv.id}>
            <button type="button" onClick={() => onSelect(inv.id)}>
              <span className="hist-claim">{inv.originalClaim.slice(0, 80)}</span>
              <span className="hist-meta">
                {first ? VERDICT_LABELS[first.analysis.verdict] : "—"} · {new Date(inv.createdAt).toLocaleDateString()}
                {inv.cached ? " · cached" : ""}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
