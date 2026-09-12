import { useState } from "react";
import type { Investigation } from "../../shared/types.js";
import { VERDICT_LABELS } from "../../shared/types.js";

export function History({
  items,
  onSelect,
  onDelete,
  onClear,
}: {
  items: Investigation[];
  onSelect: (id: string) => void;
  onDelete?: (id: string) => void;
  onClear?: () => void;
}) {
  const [confirmingClear, setConfirmingClear] = useState(false);
  if (items.length === 0)
    return <p style={{ fontSize: 14, color: "var(--ink-3)" }}>No investigations yet this session.</p>;
  return (
    <div>
      <ul className="history-list" aria-label="Recent investigations">
        {items.map((inv) => {
          const first = inv.results[0];
          return (
            <li key={inv.id} className="history-item">
              <button type="button" className="history-open" onClick={() => onSelect(inv.id)}>
                <span className="hist-claim">{inv.originalClaim.slice(0, 80)}</span>
                <span className="hist-meta">
                  {first ? VERDICT_LABELS[first.analysis.verdict] : "—"} ·{" "}
                  {(inv.depth ?? "deep").toUpperCase()} ·{" "}
                  {new Date(inv.createdAt).toLocaleDateString()}
                  {inv.cached ? " · cached" : ""}
                </span>
              </button>
              {onDelete && (
                <button
                  type="button"
                  className="link-btn history-delete"
                  aria-label={`Delete investigation: ${inv.originalClaim.slice(0, 60)}`}
                  onClick={() => onDelete(inv.id)}
                >
                  Delete
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {onClear && items.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {confirmingClear ? (
            <span style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 13 }}>
              <span style={{ color: "var(--ink-3)" }}>Delete all {items.length} records?</span>
              <button
                type="button"
                className="btn btn-small"
                onClick={() => {
                  onClear();
                  setConfirmingClear(false);
                }}
              >
                Confirm clear
              </button>
              <button type="button" className="link-btn" onClick={() => setConfirmingClear(false)}>
                Keep
              </button>
            </span>
          ) : (
            <button type="button" className="link-btn" onClick={() => setConfirmingClear(true)}>
              Clear all history
            </button>
          )}
        </div>
      )}
    </div>
  );
}
