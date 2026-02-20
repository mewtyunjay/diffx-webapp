// Wires API route modules into the Express app; request flow is client -> /api/* route handlers.
// create/configure Express app
import express from "express";
import cors from "cors";
import healthRoute from "./routes/health.route.js";
import repoRoute from "./routes/repo.route.js";
import filesRoute from "./routes/files.route.js";
import diffRoute from "./routes/diff.route.js";
import diffDetailRoute from "./routes/diff-detail.route.js";
import actionsRoute from "./routes/actions.route.js";
import branchesRoute from "./routes/branches.route.js";
import settingsRoute from "./routes/settings.route.js";
import quizRoute from "./routes/quiz.route.js";
import workspaceRoute from "./routes/workspace.route.js";
import { createHttpRequestLoggingMiddleware } from "./logging/http-logging.middleware.js";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(createHttpRequestLoggingMiddleware());

  app.use("/api", healthRoute);
  app.use("/api", repoRoute);
  app.use("/api", filesRoute);
  app.use("/api", diffRoute);
  app.use("/api", diffDetailRoute);
  app.use("/api", actionsRoute);
  app.use("/api", branchesRoute);
  app.use("/api", settingsRoute);
  app.use("/api", quizRoute);
  app.use("/api", workspaceRoute);

  return app;
}
