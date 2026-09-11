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
    <section className="hero" aria-label="Verify a claim">
      <h1>Verify a claim</h1>
      <p>Enter a statement you want to investigate. Verity searches the web, then analyzes the evidence.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setTouched(true);
          if (!empty) onSubmit(value.trim());
        }}
      >
        <div className="claim-row">
          <label className="sr-only" htmlFor="claim-input">
            Claim to investigate
          </label>
          <textarea
            id="claim-input"
            placeholder='"The Great Wall of China is visible from space."'
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={pending}
          />
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Investigating…" : "Investigate"}
          </button>
        </div>
        {touched && empty && (
          <p role="alert" style={{ color: "#b91c1c", fontSize: 13 }}>
            Enter a claim of at least 3 characters.
          </p>
        )}
      </form>
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
