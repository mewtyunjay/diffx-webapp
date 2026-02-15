// Handles write actions; flow is POST /api/actions/* -> validate body -> typed ActionResponse or ApiError.
import { Router } from "express";
import type {
  CommitRequest,
  StageFileRequest,
  UnstageFileRequest,
} from "@diffx/contracts";
import {
  commitChanges,
  stageFile,
  unstageFile,
} from "../services/git.service.js";
import { sendApiError, sendRouteError } from "./http.js";

const router = Router();

router.post("/actions/stage", async (req, res) => {
  const body = req.body as Partial<StageFileRequest>;
  if (typeof body.path !== "string" || body.path.trim().length === 0) {
    return sendApiError(res, 400, "INVALID_PATH", "Body `path` is required.");
  }

  try {
    const response = await stageFile(body.path);
    res.json(response);
  } catch (error) {
    sendRouteError(res, error);
  }
});

router.post("/actions/unstage", async (req, res) => {
  const body = req.body as Partial<UnstageFileRequest>;
  if (typeof body.path !== "string" || body.path.trim().length === 0) {
    return sendApiError(res, 400, "INVALID_PATH", "Body `path` is required.");
  }

  try {
    const response = await unstageFile(body.path);
    res.json(response);
  } catch (error) {
    sendRouteError(res, error);
  }
});

router.post("/actions/commit", async (req, res) => {
  const body = req.body as Partial<CommitRequest>;
  if (typeof body.message !== "string" || body.message.trim().length === 0) {
    return sendApiError(
      res,
      400,
      "INVALID_COMMIT_MESSAGE",
      "Body `message` is required.",
    );
  }

  try {
    const response = await commitChanges(body.message);
    res.json(response);
  } catch (error) {
    sendRouteError(res, error);
  }
});

export default router;
