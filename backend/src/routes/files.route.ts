// Serves changed-file listing for sidebar; flow is GET /api/files -> ChangedFile[] JSON.
import { Router } from "express";
import { getChangedFiles } from "../services/git.service.js";
import { sendRouteError } from "./http.js";

const router = Router();

router.get("/files", async (_req, res) => {
  try {
    const body = await getChangedFiles();
    res.json(body);
  } catch (error) {
    sendRouteError(res, error);
  }
});

export default router;
