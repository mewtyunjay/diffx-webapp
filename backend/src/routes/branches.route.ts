// Serves branch list metadata; flow is GET /api/branches -> BranchesResponse JSON.
import { Router } from "express";
import { getBranches } from "../services/git.service.js";
import { sendRouteError } from "./http.js";

const router = Router();

router.get("/branches", async (_req, res) => {
  try {
    const body = await getBranches();
    res.json(body);
  } catch (error) {
    sendRouteError(res, error);
  }
});

export default router;
