import { useEffect, useState } from "react";
import { fetchHealth, getStoredKey, getStoredModel, setStoredKey, setStoredModel, testConnection } from "../services/api.js";

export function Settings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [key, setKey] = useState("");
  const [model, setModel] = useState("openai/gpt-oss-120b");
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [health, setHealth] = useState<string>("Unknown");
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (open) {
      setKey(getStoredKey());
      setModel(getStoredModel() || "openai/gpt-oss-120b");
      fetchHealth()
        .then((h) => setHealth(`${h.llm.provider} · ${h.llm.message}`))
        .catch(() => setHealth("Health check failed"));
    }
  }, [open ]);

  if (!open) return null;

  return (
    <div className="panel" role="dialog" aria-label="API settings">
      <h2>API Settings / BYOK</h2>
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
        <p style={{ fontSize: 13 }}>
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
          <button type="button" className="btn btn-small" onClick={onClose}>
            Close
          </button>
        </div>
        <p style={{ fontSize: 12, color: "#78716c" }}>
          Keys stay in session storage only and are never logged or echoed by the server.
        </p>
      </div>
    </div>
  );
}
