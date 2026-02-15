// Normalizes error output; flow is route validation/exception -> sendApiError -> typed ApiError JSON.
import type { ApiError, ApiErrorCode } from "@diffx/contracts";
import type { Response } from "express";
import { isApiRouteError } from "../domain/api-route-error.js";

export function sendApiError(
  res: Response,
  status: number,
  code: ApiErrorCode,
  message: string,
  details?: ApiError["details"],
) {
  const body: ApiError = { code, message, details };
  res.status(status).json(body);
}

export function sendRouteError(res: Response, error: unknown) {
  if (isApiRouteError(error)) {
    sendApiError(res, error.status, error.code, error.message, error.details);
    return;
  }

  sendApiError(res, 500, "INTERNAL_ERROR", "Unexpected server error.");
}
