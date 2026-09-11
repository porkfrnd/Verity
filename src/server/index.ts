import { createApp } from "./routes/app.js";
import { safeError, safeLog } from "./utils/redact.js";

const port = Number(process.env.PORT ?? 3000);
const app = createApp();

// Crash diagnostics: log the cause (redacted) instead of dying silently.
process.on("uncaughtException", (err) => {
  safeError("Uncaught exception", { message: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  safeError("Unhandled rejection", { message: reason instanceof Error ? reason.message : String(reason) });
  process.exit(1);
});

if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => {
    safeLog(`Verity server listening on :${port}`);
  });
}

export default app;
