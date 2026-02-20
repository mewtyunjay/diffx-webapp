// Starts the HTTP server; runtime flow is process boot -> createApp() -> listen(port).
import { createApp } from "./app.js";
import {
  getBackendLoggingConfigSnapshot,
  logBackendEvent,
} from "./logging/logger.js";

const app = createApp();
const port = Number(process.env.PORT ?? 3001);

logBackendEvent("app", "info", "server:boot", {
  port,
  nodeEnv: process.env.NODE_ENV ?? "development",
  logging: getBackendLoggingConfigSnapshot(),
});

app.listen(port, () => {
  logBackendEvent("app", "info", "server:listening", {
    url: `http://localhost:${port}`,
  });
});
