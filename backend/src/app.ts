// create/configure Express app
import express from "express";
import cors from "cors";
import healthRoute from "./routes/health.route";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.use("/api", healthRoute);

  return app;
}
