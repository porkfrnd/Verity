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

> Both servers must run: `npm run dev:server` (API on :3000) **and**
> `npm run dev` (UI on :5173) in two terminals. The UI calls the API
> through `/api/*`; nothing is fetched from the browser bundle.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Cannot reach the API server…` / vite `http proxy error … ECONNREFUSED /api/…` | The API server isn't running | Run `npm run dev:server` in a second terminal and retry |
| Verdict stuck at `UNVERIFIED` with `…search failed…` | No network or search providers blocked | Check connectivity; CI/tests use the offline mock (`NODE_ENV=test`) |
| `SEARCH FAILED` with per-provider timeouts | Retrieval infra down (see below) | Run `npm run diagnose:search` |
| `npm run build` ships a huge JS bundle | `NODE_ENV=development` leaked into the build env | Do not set `NODE_ENV` in `.env` (see note below) |

## Diagnosing search failures

When providers fail, server logs now include the structured cause (`code`, `syscall`, `hostname` — never URLs or keys). For a full workup from the same Node process:

```bash
npm run diagnose:search
```

It reports DNS (A/AAAA + latency), IPv4 vs IPv6 TCP connects, HTTPS status/latency per provider host, proxy-env presence (values never printed), then exactly **one query per provider** with connection/HTTP/parser status and per-attempt causes. Exit code is non-zero when no provider returned sources. The same report is available at `GET /api/diagnose/search`.

To separate machine failure from Node-specific failure, compare with curl from the same machine:

```bash
curl -I https://en.wikipedia.org/      # baseline HTTPS
curl -4 -I https://api.openalex.org/   # force IPv4
curl -6 -I https://api.openalex.org/   # force IPv6
```

If curl succeeds where Node fails, the difference is in Node's stack (DNS selection, Happy Eyeballs, TLS); if both fail identically, it's the machine/network. Failure taxonomy used in reports: `network` (DNS/TCP/TLS/timeout) · `http` (provider error status) · `blocked` (challenge/deny page) · `parse` (response uninterpretable) · `empty` (worked, zero hits) · `ok`.

## Env vars

| Var | Required | Purpose |
|---|---|---|
| `PORT` | no (default 3000) | API port |
| `GROQ_API_KEY` | no (falls back to offline mock) | Default server LLM key (Groq, GPT-OSS 120B) |
| `GROQ_MODEL` | no (default `openai/gpt-oss-120b`) | Model id |
| `SEARCH_PROVIDER` | no (default web search) | Set to `mock` to force the offline mock provider |
| `SEARXNG_URL` | no | Self-hosted SearXNG base URL — replaces the DuckDuckGo scraper |
| `WIKIPEDIA_LANG` | no (default `en`) | Wikipedia edition for reference search |
| `FACTCHECK_API_KEY` | no | Google Fact Check Tools API (prior fact-checks signal) |
| `DDG_REQUEST_GAP_MS` | no (default 1200) | Politeness gap between DuckDuckGo scrape requests |
| `SOURCE_FETCH_TIMEOUT_MS` | no (default 20000) | Total deadline per source page-fetch (headers + body) |

Without keys the app runs web search (DuckDuckGo) + Wikipedia + mock LLM; with `NODE_ENV=test` (and CI) all search uses the deterministic mock so the suite never needs network or keys.

## Running frontend / backend

- `npm run dev` — Vite client (:5173).
- `npm run dev:server` — Express API via tsx watch (:3000).
- `npm run build` + `npm start` — production (server serves `dist/client` if present; API always on `/api/*`).
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run e2e`.

## Configuring providers

- **LLM:** implement `LLMProvider` (`src/server/providers/llm/types.ts`) in one new file (see `groq.ts`, `mock.ts`), then select it in `src/server/services/llmFactory.ts`. The evidence analyzer only depends on the interface.
- **Search:** implement `SearchProvider` (`src/server/providers/search/types.ts`), register in `getSearchProviders()` (`src/server/services/search.ts`). Neutral/supporting/contradicting queries run concurrently per claim. Current providers: `duckduckgo` (default web), `ddg-instant` (official Instant Answers), `wikipedia` (reference), `openalex` (scholarly), `gdelt` (news), `searxng` (self-hosted), `factcheck` (prior fact-checks, optional key), `mock` (tests/CI). Providers fail independently with per-provider reports; one retry with backoff on timeout/5xx/network errors.

## Search depth

Choose FLASH (fast, ~5–15s budget), DEEP (default, ~60s), or EXTENDED (~150s) next to the claim input. Depth controls the retrieval engine — query waves, provider coverage, source caps, expansion and page-fetch budgets, per-request provider budgets, max in-flight requests, and a global hard deadline — never just the prompt. Current budgets (derived from measured baselines: cold ~6–7s, warm ~1s, ≤5 concurrent stable): Current budgets (derived from measured baselines: cold ~6–7s, warm ~1s, ≤5 concurrent stable):

| Mode | Queries | Sources | In-flight | Provider budget | Global deadline |
|---|---|---|---|---|---|
| FLASH | ≤3, 1 wave | ≤8 | 3 | 12s | 15s |
| DEEP | ≤7, 2 waves | ≤20 | 6 | 15s | 60s |
| EXTENDED | ≤12, 2 waves + variants | ≤40 | 8 | 25s | 150s |

Strong unanimous early evidence can stop the search before the budget is spent; exhausted budgets are flagged on the result, which also records the depth and searched/unique source counts.

## Confidence percentage

The verdict shows a deterministic confidence percentage computed by `src/server/services/confidence.ts` from evidence stances, source quality/diversity, agreement, and contradictions — never chosen by the LLM (its output schema has no percentage surface; only stance/strength feed the formula). Same evidence always yields the same number; the UI shows the signed breakdown. The percentage is confidence *in the verdict*, not probability the claim is true. Search failure shows no percentage at all (`SEARCH FAILED` + provider statuses + retry); thin evidence shows `UNVERIFIED` worded as insufficient evidence.

## Search trade-offs (read this before deploying)

- The default web search scrapes DuckDuckGo's HTML results endpoint with `cheerio` — there is no official free DDG web-search API, so this is a scrape, not a documented endpoint. It needs zero keys, but it is inherently fragile (DDG can change its markup without notice; parse failures surface as typed provider errors, never crashes) and automated querying is against DDG's terms for production-scale use. Mitigations built in: real `User-Agent`, ≥1.2s spacing between requests, 10-minute identical-query cache. DDG's official Instant Answer API is intentionally *not* used as a provider — it returns infobox answers only, not web results.
- **Recommended upgrade path:** self-host [SearXNG](https://docs.searxng.org/) (open-source metasearch, JSON API, no per-query cost) and set `SEARXNG_URL` — the app swaps to it with no other changes.
- Source pages are fetched with plain HTTP + `@mozilla/readability`/`jsdom` (free, self-hosted); no headless browser, no paid scraping APIs. Every fetch carries a real `User-Agent`, a 20s total deadline, and a 2MB cap, and every URL (including each redirect hop) passes an SSRF guard that blocks private/loopback/link-local/metadata ranges and fails closed on DNS errors. Paywalled/unreachable sources fall back to archive.org and are labeled `archived_fallback`. The app respects HTTP status codes and rate pacing; it does not bypass CAPTCHAs, paywalls, robots handling, or bot protections.

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

Any Node 20.3+ host: set env vars, `npm ci && npm run build`, run `npm start` behind HTTPS. No database; history/cache are in-memory session scope. Never set real keys in the client bundle — backend-only. Do not set `NODE_ENV=development` in production (a dev React bundle would be shipped).

## Verdicts

`TRUE · MOSTLY TRUE · MIXED · MOSTLY FALSE · FALSE · UNVERIFIED · NOT A FACTUAL CLAIM` with `high|medium|low` confidence labels (never percentages). `UNVERIFIED` on thin evidence is a correct answer, not a failure. Time-sensitive claims carry a `verified as of [date]` note.
