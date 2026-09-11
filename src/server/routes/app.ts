import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import rateLimit from "express-rate-limit";
import { investigateRequestSchema } from "../../shared/schemas.js";
import { evidenceAnalysisSchema } from "../../shared/schemas.js";
import { investigate } from "../services/evidence.js";
import { getLLMProvider } from "../services/llmFactory.js";
import { getInvestigation, saveInvestigation } from "../services/store.js";
import { getSearchProviders } from "../services/search.js";
import { normalizeResults } from "../services/sources.js";
import { safeError } from "../utils/redact.js";

dotenv.config();

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "256kb" }));

  const limiter = rateLimit({
    windowMs: 60_000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "rate_limited", message: "Too many requests. Please slow down." },
  });
  app.use("/api/", limiter);

  app.get("/api/health", async (_req, res) => {
    // Reflect real provider reachability, not just "process is up".
    const llm = getLLMProvider();
    let llmStatus: { ok: boolean; message: string };
    try {
      llmStatus = await llm.testConnection();
    } catch (e) {
      llmStatus = { ok: false, message: e instanceof Error ? e.message : "LLM check failed" };
    }
    const searchIds = getSearchProviders().map((p) => p.id);
    res.json({
      ok: true,
      llm: { provider: llm.id, ...llmStatus },
      searchProviders: searchIds,
      time: new Date().toISOString(),
    });
  });

  // Provider-health diagnostics (§2–§9): same-process DNS/TCP/HTTPS probes
  // plus one query per provider. Output contains hostnames and error causes
  // only — no queries, keys, or credentials. Slow by design (bounded probes).
  app.get("/api/diagnose/search", async (_req, res) => {
    try {
      const { diagnoseSearch } = await import("../services/diagnose.js");
      res.json(await diagnoseSearch());
    } catch (e) {
      safeError("Diagnose failed");
      res.status(502).json({ error: "diagnose_failed", message: e instanceof Error ? e.message : "Diagnostics failed." });
    }
  });

  app.post("/api/investigate", async (req, res) => {
    const parsed = investigateRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request", message: "Claim is required (3–5000 chars).", details: parsed.error.flatten() });
      return;
    }
    const { claim, apiKey, model, depth } = parsed.data;
    try {
      const inv = await investigate(claim, { apiKey, model, depth });
      saveInvestigation(inv);
      // Never echo the key back.
      res.json({ ...inv, apiKey: undefined });
    } catch (e) {
      const status = (e as { status?: number }).status ?? 500;
      safeError("Investigate failed", { message: e instanceof Error ? e.message : "unknown" });
      if (status === 400) {
        res.status(400).json({ error: "invalid_request", message: e instanceof Error ? e.message : "Bad request" });
        return;
      }
      res.status(502).json({
        error: "investigation_failed",
        message: "The investigation could not be completed. Try again or check provider configuration.",
      });
    }
  });

  // Streaming investigation: same pipeline, same outcomes — plus live
  // provider/dedup/analysis events. POST (not EventSource GET) so BYOK keys
  // stay in the request body, never in a URL.
  app.post("/api/investigate/stream", async (req, res) => {
    const parsed = investigateRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request", message: "Claim is required (3–5000 chars)." });
      return;
    }
    const { claim, apiKey, model, depth } = parsed.data;
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    const send = (type: string, data: unknown) => {
      res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    try {
      const inv = await investigate(claim, {
        apiKey,
        model,
        depth,
        events: (e) => {
          if (e.type === "provider") send("provider", { claimId: e.claimId, wave: e.wave, report: e.report });
          else if (e.type === "dedup") send("dedup", { claimId: e.claimId, totalFound: e.totalFound, uniqueCount: e.uniqueCount });
          else if (e.type === "early_stop") send("early_stop", { claimId: e.claimId, reason: e.reason });
          else if (e.type === "budget_exhausted") send("budget_exhausted", { claimId: e.claimId });
          else if (e.type === "analyzing") send("analyzing", { claimId: e.claimId });
          else if (e.type === "claim") send("claim", { claimId: e.claimId, verdict: e.verdict, searchFailed: e.searchFailed });
        },
      });
      saveInvestigation(inv);
      send("done", { ...inv, apiKey: undefined });
      res.end();
    } catch (e) {
      safeError("Streamed investigate failed", { message: e instanceof Error ? e.message : "unknown" });
      send("error", { message: "The investigation could not be completed. Try again or check provider configuration." });
      res.end();
    }
  });

  // Internal / testing helpers — thin wrappers over services.
  app.post("/api/search", async (req, res) => {
    const query = typeof req.body?.query === "string" ? req.body.query : "";
    if (!query.trim()) {
      res.status(400).json({ error: "invalid_request", message: "query is required" });
      return;
    }
    try {
      const providers = getSearchProviders();
      const all = [];
      for (const p of providers.slice(0, 2)) {
        try {
          all.push(...(await p.search(query, { count: 5 })));
        } catch {
          safeError("Search route provider failed", { provider: p.id });
        }
      }
      res.json({ query, sources: normalizeResults(all), providers: providers.map((p) => p.id) });
    } catch {
      res.status(502).json({ error: "search_failed", message: "Search providers are unavailable." });
    }
  });

  app.post("/api/analyze", async (req, res) => {
    const { claim, sources, apiKey, model } = req.body ?? {};
    if (!claim?.text || !Array.isArray(sources)) {
      res.status(400).json({ error: "invalid_request", message: "claim.text and sources[] are required" });
      return;
    }
    try {
      const llm = getLLMProvider({ apiKey, model });
      const analysis = evidenceAnalysisSchema.parse(await llm.analyzeEvidence({ claim, sources }));
      res.json(analysis);
    } catch {
      safeError("Analyze failed");
      res.status(502).json({ error: "analysis_failed", message: "Evidence analysis failed validation or the provider is unavailable." });
    }
  });

  app.get("/api/investigations/:id", (req, res) => {
    const inv = getInvestigation(req.params.id);
    if (!inv) {
      res.status(404).json({ error: "not_found", message: "Investigation not found (session-scoped store)." });
      return;
    }
    res.json(inv);
  });

  app.post("/api/investigations/:id/recheck", async (req, res) => {
    const inv = getInvestigation(req.params.id);
    if (!inv) {
      res.status(404).json({ error: "not_found", message: "Investigation not found." });
      return;
    }
    try {
      const fresh = await investigate(inv.originalClaim, { apiKey: req.body?.apiKey, model: req.body?.model, skipCache: true, depth: inv.depth });
      saveInvestigation(fresh);
      res.json(fresh);
    } catch {
      res.status(502).json({ error: "recheck_failed", message: "Re-check failed." });
    }
  });

  app.get("/api/investigations/:id/export", (req, res) => {
    const inv = getInvestigation(req.params.id);
    if (!inv) {
      res.status(404).json({ error: "not_found", message: "Investigation not found." });
      return;
    }
    const format = String(req.query.format ?? "json");
    if (format === "json") {
      res.setHeader("Content-Disposition", `attachment; filename="verity-${inv.id}.json"`);
      res.json(inv);
      return;
    }
    if (format === "bibtex") {
      const entries = inv.results.flatMap((r) =>
        r.sources.map((s, i) => `@misc{verity${i},\n  title={${s.title.replace(/[{}]/g, "")}},\n  howpublished={\\url{${s.url}}},\n  note={Accessed ${inv.createdAt}}\n}`)
      );
      res.type("text/plain").send(entries.join("\n\n") || "% No sources to export");
      return;
    }
    res.status(400).json({ error: "invalid_request", message: "Unsupported format. Use format=json|bibtex." });
  });

  // Test-connection without persisting or logging the key.
  app.post("/api/test-connection", async (req, res) => {
    const { apiKey, model, provider } = req.body ?? {};
    try {
      const llm = getLLMProvider({ apiKey, model });
      void provider;
      const result = await llm.testConnection();
      res.json(result);
    } catch {
      res.json({ ok: false, message: "Connection test failed." });
    }
  });

  // Serve built client in production
  app.get("/api/*", (_req, res) => {
    res.status(404).json({ error: "not_found", message: "Unknown API route." });
  });

  return app;
}
