// Serves changed-file listing for sidebar; flow is GET /api/files -> ChangedFile[] JSON.
import { Router } from "express";
import type { ChangedFile } from "@diffx/contracts";

const router = Router();

router.get("/files", (_req, res) => {
  const body: ChangedFile[] = [];
  res.json(body);
});

export default router;
