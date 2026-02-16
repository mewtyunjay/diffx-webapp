import type { ApiError } from "@diffx/contracts";

type ApiErrorCode = ApiError["code"];

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details?: ApiError["details"];

  constructor(status: number, code: ApiErrorCode, message: string, details?: ApiError["details"]) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function toApiRequestError(response: Response): Promise<ApiRequestError> {
  let body: ApiError | undefined;

  try {
    body = (await response.json()) as ApiError;
  } catch {
    body = undefined;
  }

  if (body?.code && body?.message) {
    return new ApiRequestError(response.status, body.code, body.message, body.details);
  }

  return new ApiRequestError(response.status, "INTERNAL_ERROR", `Request failed: ${response.status}`);
}

export async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);

  if (!response.ok) {
    throw await toApiRequestError(response);
  }

  return (await response.json()) as T;
}
