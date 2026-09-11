import { createApp } from "./routes/app.js";
import { safeLog } from "./utils/redact.js";

const port = Number(process.env.PORT ?? 3000);
const app = createApp();

if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => {
    safeLog(`Verity server listening on :${port}`);
  });
}

export default app;
