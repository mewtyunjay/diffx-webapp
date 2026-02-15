// Serves repo summary for app bootstrap; flow is GET /api/repo -> RepoSummary snapshot JSON.
import { Router } from "express";
import { getRepoSummary } from "../services/git.service.js";
import { sendRouteError } from "./http.js";

const router = Router();

router.get("/repo", async (_req, res) => {
  try {
    const body = await getRepoSummary();
    res.json(body);
  } catch (error) {
    sendRouteError(res, error);
  }
});

export default router;
