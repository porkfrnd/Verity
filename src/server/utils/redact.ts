// Never log or echo keys. Central redaction helper.
const KEY_PATTERN = /\b(sk-[A-Za-z0-9-_]{4,}|gsk_[A-Za-z0-9-_]{4,}|Bearer\s+[A-Za-z0-9-_.~+/=]{8,})\b/g;

export function redactSecrets(input: unknown): unknown {
  if (typeof input === "string") {
    return input
      .replace(KEY_PATTERN, "[REDACTED]")
      .replace(/("?(apiKey|api_key|apikey|authorization)"?\s*[:=]\s*"?)[^",}\s]+/gi, "$1[REDACTED]");
  }
  if (Array.isArray(input)) return input.map(redactSecrets);
  if (input && typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (/api.?key|token|secret|authorization/i.test(k)) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = redactSecrets(v);
      }
    }
    return out;
  }
  return input;
}

export function safeLog(...args: unknown[]): void {
  console.log(...(redactSecrets(args) as unknown[]));
}

export function safeError(...args: unknown[]): void {
  console.error(...(redactSecrets(args) as unknown[]));
}
