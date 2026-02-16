import { Router } from "express";
import type { DiffScope } from "@diffx/contracts";
import { getDiffDetail } from "../services/diff.service.js";
import { sendApiError, sendRouteError } from "./http.js";

const router = Router();

function parseScope(scope: unknown): DiffScope | null {
  if (scope === "staged" || scope === "unstaged") return scope;
  return null;
}

router.get("/diff-detail", async (req, res) => {
  const path = req.query.path;
  const scope = parseScope(req.query.scope);
  const contextLines = req.query.contextLines;

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

  const parsedContextLines =
    typeof contextLines === "string" && contextLines.length > 0
      ? Number(contextLines)
      : undefined;

  if (
    parsedContextLines !== undefined &&
    (!Number.isFinite(parsedContextLines) || parsedContextLines < 0)
  ) {
    return sendApiError(
      res,
      400,
      "INVALID_PATH",
      "Query param `contextLines` must be a non-negative number when provided.",
    );
  }

  try {
    const body = await getDiffDetail(path, scope, parsedContextLines);
    res.json(body);
  } catch (error) {
    sendRouteError(res, error);
  }
});

export default router;
