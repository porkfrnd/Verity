import { GroqProvider } from "../providers/llm/groq.js";
import { MockLLMProvider } from "../providers/llm/mock.js";
import type { LLMProvider } from "../providers/llm/types.js";

// Central selection: server key by default, per-request BYOK override when present.
// Adding a new provider (e.g. Anthropic) = add one file implementing LLMProvider
// + one branch here. Evidence analyzer logic never changes.
export function getLLMProvider(opts?: { apiKey?: string; model?: string }): LLMProvider {
  const byok = opts?.apiKey?.trim();
  if (byok) return new GroqProvider({ apiKey: byok, model: opts?.model });
  const serverKey = process.env.GROQ_API_KEY?.trim();
  if (serverKey) return new GroqProvider({ apiKey: serverKey, model: process.env.GROQ_MODEL });
  return new MockLLMProvider();
}
