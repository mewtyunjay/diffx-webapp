// Serves branch list metadata; flow is GET /api/branches -> BranchesResponse JSON.
import { Router } from "express";
import type { BranchesResponse } from "@diffx/contracts";

const router = Router();

router.get("/branches", (_req, res) => {
  const body: BranchesResponse = {
    mode: "git",
    branches: [
      { name: "main", current: true },
      { name: "feature/diff-hybrid", current: false },
    ],
  };

  res.json(body);
});

export default router;
