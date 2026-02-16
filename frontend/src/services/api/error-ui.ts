import type { ApiErrorCode } from "@diffx/contracts";
import { ApiRequestError } from "./client";

type UiError = {
  message: string;
  retryable: boolean;
};

const RETRYABLE_CODES = new Set<ApiErrorCode>(["GIT_COMMAND_FAILED", "INTERNAL_ERROR"]);

const COPY_BY_CODE: Record<ApiErrorCode, string> = {
  NOT_GIT_REPO: "Current folder is not a Git repository.",
  FILE_NOT_FOUND: "Selected file is no longer available.",
  BINARY_FILE: "Binary files cannot be shown in the diff viewer.",
  FILE_TOO_LARGE: "File is too large to render safely.",
  INVALID_SCOPE: "Invalid diff scope was requested.",
  INVALID_SIDE: "Invalid diff side was requested.",
  INVALID_PATH: "Invalid file path was requested.",
  INVALID_COMMIT_MESSAGE: "Commit message is invalid. Please provide a clear message.",
  INVALID_PUSH_REQUEST: "Push request is invalid.",
  NO_UPSTREAM: "No upstream branch is configured for this branch.",
  GIT_COMMAND_FAILED: "Git command failed. Refresh and try again.",
  INTERNAL_ERROR: "Internal server error. Try again in a moment.",
};

export function toUiError(error: unknown, fallback = "Unexpected request failure"): UiError {
  if (error instanceof ApiRequestError) {
    if (error.code === "NO_UPSTREAM") {
      return {
        message: error.message,
        retryable: false,
      };
    }

    return {
      message: COPY_BY_CODE[error.code] ?? error.message,
      retryable: RETRYABLE_CODES.has(error.code),
    };
  }

  if (error instanceof Error && error.message) {
    return {
      message: error.message,
      retryable: true,
    };
  }

  return {
    message: fallback,
    retryable: true,
  };
}
