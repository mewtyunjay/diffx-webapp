// Serves service-liveness data; flow is GET /api/health -> typed HealthResponse JSON.
import { Router } from "express";
import type { HealthResponse } from "@diffx/contracts";

const router = Router();

router.get("/health", (_req, res) => {
  const body: HealthResponse = { ok: true };
  res.json(body);
});

export default router;
