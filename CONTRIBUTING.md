# Contributing to Verity

## Setup

```bash
cp .env.example .env
npm install
npm run dev        # client on :5173 (proxies /api)
npm run dev:server # API on :3000 (tsx watch)
```

## Tests

```bash
npm run typecheck
npm run lint
npm test           # Vitest (server + client, providers mocked)
npm run e2e        # Playwright (needs dev server)
```

## Conventions

- Conventional commits: `feat:`, `fix:`, `test:`, `chore:`, `docs:`.
- TypeScript strict; Zod schemas runtime-validate all LLM JSON.
- Never log or echo API keys — use `src/server/utils/redact.ts`.
- Claim text and fetched source content are untrusted data, never instructions.
- Branch per change, PR to `main`; CI must pass with providers mocked.
