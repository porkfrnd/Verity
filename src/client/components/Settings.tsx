import { useEffect, useRef, useState } from "react";
import { fetchHealth, getStoredKey, getStoredModel, setStoredKey, setStoredModel, testConnection } from "../services/api.js";

export function Settings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [key, setKey] = useState("");
  const [model, setModel] = useState("openai/gpt-oss-120b");
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [health, setHealth] = useState<string>("Unknown");
  const [testing, setTesting] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<Element | null>(null);

  useEffect(() => {
    if (open) {
      setKey(getStoredKey());
      setModel(getStoredModel() || "openai/gpt-oss-120b");
      fetchHealth()
        .then((h) => setHealth(`${h.llm.provider} · ${h.llm.message}`))
        .catch((e: unknown) => setHealth(e instanceof Error ? e.message : "Health check failed"));
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      if (previousFocus.current instanceof HTMLElement) previousFocus.current.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="overlay-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="overlay-frame" role="dialog" aria-modal="true" aria-label="API settings">
        <div className="overlay-head">
          <div style={{ minWidth: 0 }}>
            <p className="section-label">Settings</p>
            <h2 style={{ fontSize: 15, margin: 0, fontWeight: 650 }}>API Settings / BYOK</h2>
          </div>
          <button ref={closeRef} type="button" className="overlay-close" onClick={onClose}>
            Close ✕
          </button>
        </div>
        <div className="overlay-body">
          <div className="settings-grid">
            <label>
              AI Provider
              <select aria-label="AI Provider" value="groq" onChange={() => {}}>
                <option value="groq">Groq (default — add providers in llmFactory.ts, one file each)</option>
              </select>
            </label>
            <label>
              API Key
              <input
                aria-label="API Key"
                type="password"
                autoComplete="off"
                placeholder="gsk_…"
                value={key}
                onChange={(e) => setKey(e.target.value)}
              />
            </label>
            <label>
              Model
              <select aria-label="Model" value={model} onChange={(e) => setModel(e.target.value)}>
                <option value="openai/gpt-oss-120b">GPT-OSS 120B</option>
                <option value="llama-3.1-70b-versatile">Llama 3.1 70B</option>
              </select>
            </label>
            <p style={{ fontSize: 13, color: "var(--ink-3)" }}>
              <span className={`status-dot ${status?.ok ? "status-ok" : "status-bad"}`} aria-hidden="true" />
              Status {status ? status.message : "● Not tested"} · Server: {health}
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn btn-small"
                disabled={testing}
                onClick={async () => {
                  setStoredKey(key);
                  setStoredModel(model);
                  setTesting(true);
                  try {
                    setStatus(await testConnection());
                  } finally {
                    setTesting(false);
                  }
                }}
              >
                {testing ? "Testing…" : "Test connection"}
              </button>
              <button
                type="button"
                className="btn btn-small"
                onClick={() => {
                  setKey("");
                  setStoredKey("");
                  setStatus({ ok: false, message: "Key removed (session only)." });
                }}
              >
                Remove key
              </button>
            </div>
            <p style={{ fontSize: 12, color: "var(--ink-4)" }}>
              Keys stay in session storage only and are never logged or echoed by the server.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
