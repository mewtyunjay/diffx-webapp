// Handles write actions; flow is POST /api/actions/* -> validate body -> typed ActionResponse or ApiError.
import { Router } from "express";
import type {
  CommitRequest,
  PushRequest,
  StageManyRequest,
  StageFileRequest,
  UnstageFileRequest,
} from "@diffx/contracts";
import {
  commitChanges,
  pushChanges,
  stageFile,
  stageManyFiles,
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

router.post("/actions/stage-many", async (req, res) => {
  const body = req.body as Partial<StageManyRequest>;

  if (
    !Array.isArray(body.paths) ||
    body.paths.length === 0 ||
    body.paths.some((path) => typeof path !== "string" || path.trim().length === 0)
  ) {
    return sendApiError(
      res,
      400,
      "INVALID_PATH",
      "Body `paths` must be a non-empty string array.",
    );
  }

  try {
    const response = await stageManyFiles(body.paths);
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

router.post("/actions/push", async (req, res) => {
  const body = (req.body ?? {}) as Partial<PushRequest>;

  if (body.createUpstream !== undefined && typeof body.createUpstream !== "boolean") {
    return sendApiError(
      res,
      400,
      "INVALID_PUSH_REQUEST",
      "Body `createUpstream` must be boolean when provided.",
    );
  }

  try {
    const response = await pushChanges({ createUpstream: body.createUpstream === true });
    res.json(response);
  } catch (error) {
    sendRouteError(res, error);
  }
});

export default router;
