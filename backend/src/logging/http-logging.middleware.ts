import type { RequestHandler } from "express";
import { isBackendLogScopeEnabled, logBackendEvent } from "./logger.js";

export function toApiRequestLogLine(method: string, path: string, status: number): string {
  return `${method.toUpperCase()} ${path} ${status}`;
}

export function createHttpRequestLoggingMiddleware(): RequestHandler {
  return (req, res, next) => {
    if (!req.path.startsWith("/api") || !isBackendLogScopeEnabled("http")) {
      next();
      return;
    }

    const requestPath = req.path;
    let completed = false;

    const logRequest = () => {
      if (completed) {
        return;
      }

      completed = true;

      const status = res.statusCode;
      const level = status >= 500 ? "error" : status >= 400 ? "warn" : "info";

      logBackendEvent("http", level, toApiRequestLogLine(req.method, requestPath, status));
    };

    res.on("finish", logRequest);
    res.on("close", logRequest);

    next();
  };
}
