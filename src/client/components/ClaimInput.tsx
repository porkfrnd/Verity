import { useState } from "react";

export const EXAMPLE_CLAIMS = [
  "The Great Wall of China is visible from space.",
  "Water boils at 100°C at sea level.",
  "Vitamin C prevents colds and taking large doses makes you healthier.",
  "This coffee shop has the best latte in town.",
];

export function ClaimInput({
  pending,
  onSubmit,
  initial,
}: {
  pending: boolean;
  onSubmit: (claim: string) => void;
  initial?: string;
}) {
  const [value, setValue] = useState(initial ?? "");
  const [touched, setTouched] = useState(false);
  const empty = value.trim().length < 3;

  return (
    <section aria-label="Verify a claim">
      <h1 style={{ fontSize: 17, margin: "0 0 8px", letterSpacing: "-0.01em" }}>Verify a claim</h1>
      <div className="search-block">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setTouched(true);
            if (!empty) onSubmit(value.trim());
          }}
        >
          <div className="search-bar">
            <label className="sr-only" htmlFor="claim-input">
              Claim to investigate
            </label>
            <textarea
              id="claim-input"
              placeholder="Search or paste a claim…"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={pending}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  setTouched(true);
                  if (!empty && !pending) onSubmit(value.trim());
                }
              }}
            />
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Investigating…" : "Investigate"}
            </button>
          </div>
        </form>
        <div className="search-hint" aria-hidden="true">
          <span>searches the web →</span>
          <span>evaluates sources →</span>
          <span>checks contradictions</span>
        </div>
      </div>
      {touched && empty && (
        <p role="alert" style={{ color: "#9c2b2b", fontSize: 13, fontFamily: "var(--mono)" }}>
          Enter a claim of at least 3 characters.
        </p>
      )}
      <div className="chips" aria-label="Example claims">
        {EXAMPLE_CLAIMS.map((c) => (
          <button key={c} type="button" className="chip" disabled={pending} onClick={() => { setValue(c); onSubmit(c); }}>
            {c}
          </button>
        ))}
      </div>
    </section>
  );
}
