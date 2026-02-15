// Serves on-demand full file content for expansion; flow is GET /api/file-contents(query) -> FileContentsResponse JSON.
import { Router } from "express";
import type {
  DiffScope,
  DiffSide,
  FileContentsQuery,
  FileContentsResponse,
} from "@diffx/contracts";
import { sendApiError } from "./http.js";

const router = Router();

function parseScope(scope: unknown): DiffScope | null {
  if (scope === "staged" || scope === "unstaged") return scope;
  return null;
}

function parseSide(side: unknown): DiffSide | null {
  if (side === "old" || side === "new") return side;
  return null;
}

router.get("/file-contents", (req, res) => {
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

  const query: FileContentsQuery = { path, scope, side };
  void query;

  const body: FileContentsResponse = {
    mode: "git",
    side,
    file: {
      name: path,
      contents:
        side === "old"
          ? "const value = 1;\nconsole.log(value);\n"
          : "const value = 2;\nconsole.log(value);\n",
    },
    isBinary: false,
    tooLarge: false,
    languageHint: "ts",
  };

  return res.json(body);
});

export default router;
