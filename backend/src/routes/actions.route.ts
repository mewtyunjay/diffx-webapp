// Handles write actions; flow is POST /api/actions/* -> validate body -> typed ActionResponse or ApiError.
import { Router } from "express";
import type {
  ActionResponse,
  CommitRequest,
  StageFileRequest,
  UnstageFileRequest,
} from "@diffx/contracts";
import { sendApiError } from "./http.js";

const router = Router();

router.post("/actions/stage", (req, res) => {
  const body = req.body as Partial<StageFileRequest>;
  if (typeof body.path !== "string" || body.path.trim().length === 0) {
    return sendApiError(res, 400, "INVALID_PATH", "Body `path` is required.");
  }

  const response: ActionResponse = {
    ok: true,
    message: `Staged ${body.path}`,
  };
  return res.json(response);
});

router.post("/actions/unstage", (req, res) => {
  const body = req.body as Partial<UnstageFileRequest>;
  if (typeof body.path !== "string" || body.path.trim().length === 0) {
    return sendApiError(res, 400, "INVALID_PATH", "Body `path` is required.");
  }

  const response: ActionResponse = {
    ok: true,
    message: `Unstaged ${body.path}`,
  };
  return res.json(response);
});

router.post("/actions/commit", (req, res) => {
  const body = req.body as Partial<CommitRequest>;
  if (typeof body.message !== "string" || body.message.trim().length === 0) {
    return sendApiError(
      res,
      400,
      "INVALID_COMMIT_MESSAGE",
      "Body `message` is required.",
    );
  }

  const response: ActionResponse = {
    ok: true,
    message: `Commit queued: ${body.message}`,
  };
  return res.json(response);
});

export default router;
