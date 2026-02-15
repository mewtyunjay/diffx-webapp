// Normalizes error output; flow is route validation/exception -> sendApiError -> typed ApiError JSON.
import type { ApiError, ApiErrorCode } from "@diffx/contracts";
import type { Response } from "express";

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
