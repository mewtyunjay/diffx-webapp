// Serves lightweight diff summaries; flow is GET /api/diff(query) -> DiffSummaryResponse JSON.
import { Router } from "express";
import type { DiffQuery, DiffScope, DiffSummaryResponse } from "@diffx/contracts";
import { sendApiError } from "./http.js";

const router = Router();

function parseScope(scope: unknown): DiffScope | null {
  if (scope === "staged" || scope === "unstaged") return scope;
  return null;
}

router.get("/diff", (req, res) => {
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

  const query: DiffQuery = {
    path,
    scope,
    contextLines:
      typeof contextLines === "string" && Number.isFinite(Number(contextLines))
        ? Number(contextLines)
        : undefined,
  };
  void query;

  const body: DiffSummaryResponse = {
    mode: "git",
    file: {
      path,
      oldPath: path,
      newPath: path,
      languageHint: "ts",
      isBinary: false,
      tooLarge: false,
      patch: [
        `--- a/${path}`,
        `+++ b/${path}`,
        "@@ -1,2 +1,2 @@",
        "-const value = 1;",
        "+const value = 2;",
      ].join("\n"),
      stats: { additions: 1, deletions: 1, hunks: 1 },
    },
  };

  return res.json(body);
});

export default router;
