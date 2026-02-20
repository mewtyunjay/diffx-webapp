import { Router } from "express";
import type { SetWorkspaceRequest } from "@diffx/contracts";
import { sendApiError, sendRouteError } from "./http.js";
import {
  getWorkspaceState,
  pickWorkspaceRoot,
  setWorkspaceRoot,
} from "../services/workspace.service.js";

const router = Router();

router.get("/workspace", (_req, res) => {
  res.json(getWorkspaceState());
});

router.put("/workspace", async (req, res) => {
  const body = req.body as Partial<SetWorkspaceRequest>;

  if (typeof body.repoRoot !== "string") {
    sendApiError(res, 400, "INVALID_PATH", "Repository folder path must be provided.");
    return;
  }

  try {
    const next = await setWorkspaceRoot(body.repoRoot);
    res.json(next);
  } catch (error) {
    sendRouteError(res, error);
  }
});

router.post("/workspace/pick", async (_req, res) => {
  try {
    const next = await pickWorkspaceRoot();
    res.json(next);
  } catch (error) {
    sendRouteError(res, error);
  }
});

export default router;
