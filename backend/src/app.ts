// Wires API route modules into the Express app; request flow is client -> /api/* route handlers.
// create/configure Express app
import express from "express";
import cors from "cors";
import healthRoute from "./routes/health.route.js";
import repoRoute from "./routes/repo.route.js";
import filesRoute from "./routes/files.route.js";
import diffRoute from "./routes/diff.route.js";
import fileContentsRoute from "./routes/file-contents.route.js";
import actionsRoute from "./routes/actions.route.js";
import branchesRoute from "./routes/branches.route.js";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.use("/api", healthRoute);
  app.use("/api", repoRoute);
  app.use("/api", filesRoute);
  app.use("/api", diffRoute);
  app.use("/api", fileContentsRoute);
  app.use("/api", actionsRoute);
  app.use("/api", branchesRoute);

  return app;
}
