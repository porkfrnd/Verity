# Verity

Evidence-based claim verification tool. **Search first, analyze second.** The LLM acts as an evidence analyst reasoning over supplied sources — never as a standalone oracle answering from its own training data.

## Quickstart

```bash
cp .env.example .env
npm install
npm run dev:server  # API on :3000
npm run dev         # UI on :5173 (proxies /api)
```

Open http://localhost:5173, enter a claim, press **Investigate**.

## Env vars

| Var | Required | Purpose |
|---|---|---|
| `PORT` | no (default 3000) | API port |
| `GROQ_API_KEY` | no (falls back to offline mock) | Default server LLM key (Groq, GPT-OSS 120B) |
| `GROQ_MODEL` | no (default `openai/gpt-oss-120b`) | Model id |
| `TAVILY_API_KEY` | no | Web search provider |
| `FACTCHECK_API_KEY` | no | Google Fact Check Tools API (prior fact-checks signal) |

Without keys the app runs on deterministic mock search + mock LLM so the full flow (input → verdict) works offline; CI runs this way.

## Running frontend / backend

- `npm run dev` — Vite client (:5173).
- `npm run dev:server` — Express API via tsx watch (:3000).
- `npm run build` + `npm start` — production (server serves `dist/client` if present; API always on `/api/*`).
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run e2e`.

## Configuring providers

- **LLM:** implement `LLMProvider` (`src/server/providers/llm/types.ts`) in one new file (see `groq.ts`, `mock.ts`), then select it in `src/server/services/llmFactory.ts`. The evidence analyzer only depends on the interface.
- **Search:** implement `SearchProvider` (`src/server/providers/search/types.ts`), register in `getSearchProviders()` (`src/server/services/search.ts`). Neutral/supporting/contradicting queries run concurrently per claim.

## BYOK usage

Open **Settings** → paste a Groq key → **Test connection** → run an investigation. The key lives in `sessionStorage` only, overrides the server key per request, and is never written to logs, echoed in responses, or persisted beyond the session. **Remove key** clears it.

## API

- `POST /api/investigate` `{ claim, apiKey?, model? }` → full investigation (multi-claim, per-claim verdicts).
- `POST /api/search` `{ query }` → normalized sources (internal/testing).
- `POST /api/analyze` `{ claim, sources, apiKey?, model? }` → validated analysis (internal/testing).
- `GET /api/investigations/:id`, `POST /api/investigations/:id/recheck`, `GET /api/investigations/:id/export?format=json|bibtex`.
- `GET /api/health` → `{ llm: { provider, ok, message }, searchProviders }`.
- `POST /api/test-connection` → `{ ok, message }` (key never logged/echoed).

## Deployment

Any Node 18+ host: set env vars, `npm ci && npm run build`, run `npm start` behind HTTPS. No database; history/cache are in-memory session scope. Never set real keys in the client bundle — backend-only.

## Verdicts

`TRUE · MOSTLY TRUE · MIXED · MOSTLY FALSE · FALSE · UNVERIFIED · NOT A FACTUAL CLAIM` with `high|medium|low` confidence labels (never percentages). `UNVERIFIED` on thin evidence is a correct answer, not a failure. Time-sensitive claims carry a `verified as of [date]` note.
