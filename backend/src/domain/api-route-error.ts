import type { ApiError, ApiErrorCode } from "@diffx/contracts";

export class ApiRouteError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details?: ApiError["details"];

  constructor(
    status: number,
    code: ApiErrorCode,
    message: string,
    details?: ApiError["details"],
  ) {
    super(message);
    this.name = "ApiRouteError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function isApiRouteError(error: unknown): error is ApiRouteError {
  return error instanceof ApiRouteError;
}
