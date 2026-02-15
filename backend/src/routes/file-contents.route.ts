// Serves on-demand full file content for expansion; flow is GET /api/file-contents(query) -> FileContentsResponse JSON.
import { Router } from "express";
import type {
  DiffScope,
  DiffSide,
} from "@diffx/contracts";
import { getLazyFileContents } from "../services/diff.service.js";
import { sendApiError, sendRouteError } from "./http.js";

const router = Router();

function parseScope(scope: unknown): DiffScope | null {
  if (scope === "staged" || scope === "unstaged") return scope;
  return null;
}

function parseSide(side: unknown): DiffSide | null {
  if (side === "old" || side === "new") return side;
  return null;
}

router.get("/file-contents", async (req, res) => {
  const path = req.query.path;
  const scope = parseScope(req.query.scope);
  const side = parseSide(req.query.side);

  if (typeof path !== "string" || path.trim().length === 0) {
    return sendApiError(res, 400, "INVALID_PATH", "Query param `path` is required.");
  }

  if (!scope) {
    return sendApiError(
      res,
      400,
      "INVALID_SCOPE",
      "Query param `scope` must be 'staged' or 'unstaged'.",
    );
  }

  if (!side) {
    return sendApiError(
      res,
      400,
      "INVALID_SIDE",
      "Query param `side` must be 'old' or 'new'.",
    );
  }

  try {
    const body = await getLazyFileContents(path, scope, side);
    res.json(body);
  } catch (error) {
    sendRouteError(res, error);
  }
});

export default router;
