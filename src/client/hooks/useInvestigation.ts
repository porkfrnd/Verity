import { useCallback, useRef, useState } from "react";
import type { Investigation } from "../../shared/types.js";
import { investigateClaim } from "../services/api.js";

export type Stage = "idle" | "extracting" | "searching" | "evaluating" | "contradictions" | "verdict" | "done" | "error";

const STAGE_ORDER: Stage[] = ["extracting", "searching", "evaluating", "contradictions", "verdict"];

export function useInvestigation() {
  const [stage, setStage] = useState<Stage>("idle");
  const [investigation, setInvestigation] = useState<Investigation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  const run = useCallback(async (claim: string) => {
    setError(null);
    setInvestigation(null);
    // Simulated streaming progress: advance stages on a timer until the real response lands.
    let i = 0;
    setStage(STAGE_ORDER[0]);
    timer.current = window.setInterval(() => {
      i = Math.min(i + 1, STAGE_ORDER.length - 1);
      setStage(STAGE_ORDER[i]);
    }, 900);
    try {
      const inv = await investigateClaim(claim);
      if (timer.current) window.clearInterval(timer.current);
      setInvestigation(inv);
      setStage("done");
    } catch (e) {
      if (timer.current) window.clearInterval(timer.current);
      setError(e instanceof Error ? e.message : "Investigation failed.");
      setStage("error");
    }
  }, []);

  return { stage, investigation, error, run };
}
