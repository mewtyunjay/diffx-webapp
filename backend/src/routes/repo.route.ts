// Serves repo summary for app bootstrap; flow is GET /api/repo -> RepoSummary snapshot JSON.
import { Router } from "express";
import type { RepoSummary } from "@diffx/contracts";

const router = Router();

router.get("/repo", (_req, res) => {
  const body: RepoSummary = {
    mode: "git",
    repoName: "diffx-webapp",
    branch: "main",
    stagedCount: 0,
    unstagedCount: 0,
    untrackedCount: 0,
  };

  res.json(body);
});

export default router;
