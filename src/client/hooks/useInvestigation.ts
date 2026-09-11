import { useCallback, useRef, useState } from "react";
import type { Investigation, ProviderReport, SearchDepth } from "../../shared/types.js";
import { investigateClaim, investigateClaimStream } from "../services/api.js";

export type Stage = "idle" | "extracting" | "searching" | "evaluating" | "contradictions" | "verdict" | "done" | "error";

export interface ProviderState {
  provider: string;
  status: "pending" | "success" | "timeout" | "error";
  latencyMs?: number;
  sources?: number;
  error?: string | null;
}

export interface SearchCounts {
  totalFound: number;
  uniqueCount: number;
  budgetExhausted: boolean;
  earlyStopped: string | null;
}

const STAGE_ORDER: Stage[] = ["extracting", "searching", "evaluating", "contradictions", "verdict"];

export function useInvestigation() {
  const [stage, setStage] = useState<Stage>("idle");
  const [depth, setDepth] = useState<SearchDepth>("deep");
  const [providers, setProviders] = useState<ProviderState[]>([]);
  const [counts, setCounts] = useState<SearchCounts>({ totalFound: 0, uniqueCount: 0, budgetExhausted: false, earlyStopped: null });
  const [investigating, setInvestigating] = useState(false);
  const [investigation, setInvestigation] = useState<Investigation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  const stopTimer = () => {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
  };

  const run = useCallback(async (claim: string, runDepth?: SearchDepth) => {
    const d = runDepth ?? depth;
    setError(null);
    setInvestigation(null);
    setProviders([]);
    setCounts({ totalFound: 0, uniqueCount: 0, budgetExhausted: false, earlyStopped: null });
    setInvestigating(true);
    // Fallback stage ticker: advances only until real events arrive; any real
    // event stops it so progress always reflects the pipeline, not a timer.
    let i = 0;
    let live = false;
    setStage(STAGE_ORDER[0]);
    timer.current = window.setInterval(() => {
      if (live) return;
      i = Math.min(i + 1, STAGE_ORDER.length - 1);
      setStage(STAGE_ORDER[i]);
    }, 1200);
    const markLive = () => {
      live = true;
      stopTimer();
    };
    try {
      const inv = await investigateClaimStream(claim, d, (e) => {
        markLive();
        if (e.type === "provider") {
          setStage("searching");
          setProviders((prev) => {
            const next = prev.filter((p) => p.provider !== e.report.provider);
            return [...next, { provider: e.report.provider, status: e.report.status, latencyMs: e.report.latencyMs, sources: e.report.sources, error: e.report.error }].sort((a, b) =>
              a.provider.localeCompare(b.provider)
            );
          });
        } else if (e.type === "dedup") {
          setStage("evaluating");
          setCounts((c) => ({ ...c, totalFound: e.totalFound, uniqueCount: e.uniqueCount }));
        } else if (e.type === "early_stop") {
          setCounts((c) => ({ ...c, earlyStopped: e.reason }));
        } else if (e.type === "budget_exhausted") {
          setCounts((c) => ({ ...c, budgetExhausted: true }));
        } else if (e.type === "analyzing") {
          setStage("contradictions");
        } else if (e.type === "claim") {
          setStage("verdict");
        }
      }).catch(async (streamErr: unknown) => {
        // Stream unavailable or incomplete (e.g. old server, proxy buffering):
        // fall back to the plain endpoint rather than failing the run.
        if (streamErr instanceof Error && streamErr.message !== "STREAM_INCOMPLETE" && streamErr.message.includes("Cannot reach the API")) {
          throw streamErr;
        }
        markLive();
        setStage("evaluating");
        return investigateClaim(claim, d);
      });
      stopTimer();
      setInvestigation(inv);
      setProviders((prev) =>
        prev.length > 0
          ? prev
          : (inv.results[0]?.searchReport.providers ?? []).map((r: ProviderReport) => ({
              provider: r.provider,
              status: r.status,
              latencyMs: r.latencyMs,
              sources: r.sources,
              error: r.error,
            }))
      );
      setStage("done");
    } catch (e) {
      stopTimer();
      setError(e instanceof Error ? e.message : "Investigation failed.");
      setStage("error");
    } finally {
      setInvestigating(false);
    }
  }, [depth]);

  return { stage, depth, setDepth, providers, counts, investigating, investigation, error, run };
}
