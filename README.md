# Verity

**Search first, analyze second.**

Evidence-based claim verification — a full-stack web app that verifies factual claims by grounding every verdict in evidence retrieved live from the web, then computes a deterministic, auditable confidence score.

---

## The Problem

Misinformation and unverified claims spread faster than they can be checked. The tools people currently reach for either ask a large language model to answer from its own training data — producing confident-sounding but sometimes hallucinated verdicts — or require a person to manually search, read, and cross-check multiple sources by hand, which is slow and inconsistent. There is no accessible tool that automates the full evidence-gathering process end-to-end while staying honest about what it does and doesn't know.

## The Solution

Verity is a full-stack web app that verifies factual claims by grounding every verdict in evidence retrieved live from the web — never from LLM training data. It returns "UNVERIFIED" rather than fabricating an answer when no evidence exists.

**Core differentiators:**

- **LLM as Analyst, Not Oracle** — the LLM only reasons over the actual retrieved source text handed to it, never its own training data
- **Deterministic Confidence** — a pure function computes the score; same evidence always produces the same number, fully auditable and reproducible
- **Honest About Failure** — no evidence found → "UNVERIFIED"; provider failures shown with real diagnostics, never hidden

---

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

---

## How It Works

```
Claim Input → Claim Extraction (LLM + heuristic fallback) → Wave-Based Search (multi-provider)
→ Source Normalization/Dedup/Rank → Content Enrichment (Readability) → Evidence Analysis (LLM)
→ Contradiction Detection → Deterministic Confidence Score → Verdict
```

### Multi-Provider Search

8 independent, mostly keyless providers searched concurrently with fault isolation — one failing never breaks the others:

| Provider | Type | Notes |
|---|---|---|
| DuckDuckGo | Web (scrape) | Default web search, no API key |
| DDG Instant Answer | Reference | Official Instant Answers API |
| Wikipedia | Reference | Multi-language support |
| OpenAlex | Scholarly | Academic papers and citations |
| GDELT | Global news | worldwide news monitoring |
| SearXNG | Meta-search | Self-hosted, recommended for production |
| Google Fact Check | Prior checks | Optional API key |
| Mock | Offline/demo | Tests and CI |

### Wave-Based Search with Early Stopping

- **Wave 1:** Neutral + first supporting query. If ≥3 distinct domains give unanimous strong evidence with no contradictions, the system stops early.
- **Wave 2:** Runs only if needed — remaining supporting/contradicting queries + EXTENDED mode variants.

Fast when the answer is obvious, thorough when it isn't.

### Deterministic Confidence Scoring

The confidence percentage is computed by a pure function from evidence stances, source quality, diversity, agreement, directness, primary-source presence, freshness, and contradictions — never chosen by the LLM.

| Factor | Max Contribution |
|---|---|
| Evidence Strength | ±30 |
| Source Quality | +20 |
| Source Independence | +15 |
| Cross-Source Agreement | +12 |
| Directness/Coverage | +10 |
| Primary Sources | +5 |
| Freshness | +3 |
| Contradictions | −12 |

Same evidence always yields the same number. The UI shows the full signed breakdown ("Why 87%?").

### Search Depth

Choose FLASH (fast, ~5–15s), DEEP (default, ~60s), or EXTENDED (~150s) next to the claim input.

| Mode | Queries | Sources | In-flight | Provider Budget | Global Deadline |
|---|---|---|---|---|---|
| FLASH | ≤3, 1 wave | ≤8 | 3 | 12s | 15s |
| DEEP | ≤7, 2 waves | ≤20 | 6 | 15s | 60s |
| EXTENDED | ≤12, 2 waves + variants | ≤40 | 8 | 25s | 150s |

---

## System Architecture

```
React Client → Express API → Investigate Service
                                ├── Search Service (8 providers)
                                ├── Source Normalization
                                ├── Fetch/Readability
                                ├── Contradiction Detection
                                └── Confidence Scoring
                                     └── Groq LLM (openai/gpt-oss-120b)
```

- **Frontend:** React 18, Vite, TypeScript
- **Backend:** Express, Node ≥20.3, Zod validation
- **AI:** Groq (`openai/gpt-oss-120b`) with mock fallback
- **Content Extraction:** @mozilla/readability, jsdom, cheerio
- **Testing:** Vitest, Playwright, Testing Library, Supertest

---

## Security

- **SSRF Protection:** every source URL DNS-resolved and checked against private/loopback/link-local/metadata IP ranges before fetching; DNS failures fail closed
- **Prompt Injection Stripping:** incoming claims sanitized before processing
- **BYOK Groq Key Support:** user API keys live only in browser `sessionStorage`, never logged, never persisted server-side
- **Structured Diagnostics:** `/api/health` and `/api/diagnose/search` provide real diagnostics, never silent failures

---

## Configuration

### Environment Variables

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

### BYOK Usage

Open **Settings** → paste a Groq key → **Test connection** → run an investigation. The key lives in `sessionStorage` only, overrides the server key per request, and is never written to logs, echoed in responses, or persisted beyond the session. **Remove key** clears it.

---

## API

| Endpoint | Method | Description |
|---|---|---|
| `/api/investigate` | POST | Full investigation (multi-claim, per-claim verdicts) |
| `/api/search` | POST | Normalized sources (internal/testing) |
| `/api/analyze` | POST | Validated analysis (internal/testing) |
| `/api/investigations/:id` | GET | Retrieve investigation by ID |
| `/api/investigations/:id/recheck` | POST | Re-check an investigation |
| `/api/investigations/:id/export` | GET | Export as JSON or BibTeX |
| `/api/health` | GET | LLM and search provider status |
| `/api/diagnose/search` | GET | Full search provider diagnostics |
| `/api/test-connection` | POST | Test API key validity |

---

## Deployment

Any Node 20.3+ host: set env vars, `npm ci && npm run build`, run `npm start` behind HTTPS. No database; history/cache are in-memory session scope. Never set real keys in the client bundle — backend-only. Do not set `NODE_ENV=development` in production (a dev React bundle would be shipped).

**Recommended production upgrade:** self-host [SearXNG](https://docs.searxng.org/) (open-source metasearch, JSON API, no per-query cost) and set `SEARXNG_URL` — the app swaps to it with no other changes.

---

## Known Limitations

- **In-memory store** — no persistence across restarts; single-session scope
- **DDG scraping is fragile** — DuckDuckGo can change markup without notice; SearXNG is the recommended production upgrade
- **No multi-user authentication** — single-user design for now

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Cannot reach the API server…` / vite `http proxy error … ECONNREFUSED /api/…` | The API server isn't running | Run `npm run dev:server` in a second terminal and retry |
| Verdict stuck at `UNVERIFIED` with `…search failed…` | No network or search providers blocked | Check connectivity; CI/tests use the offline mock (`NODE_ENV=test`) |
| `SEARCH FAILED` with per-provider timeouts | Retrieval infra down | Run `npm run diagnose:search` |
| `npm run build` ships a huge JS bundle | `NODE_ENV=development` leaked into the build env | Do not set `NODE_ENV` in `.env` |

---

## Team

- **Binayak Adhikari** — Team Leader
- **Amulya Pathak** — Member
