import { describe, expect, it } from "vitest";
import { ApiRequestError } from "./client";
import { toUiError } from "./error-ui";

describe("toUiError", () => {
  it("maps known api error codes to user-friendly copy", () => {
    const error = new ApiRequestError(413, "FILE_TOO_LARGE", "too big");

    expect(toUiError(error)).toEqual({
      message: "File is too large to render safely.",
      retryable: false,
    });
  });

  it("marks retryable api failures", () => {
    const error = new ApiRequestError(500, "INTERNAL_ERROR", "internal");

    expect(toUiError(error)).toEqual({
      message: "Internal server error. Try again in a moment.",
      retryable: true,
    });
  });

  it("maps commit message generation failures with retry hint", () => {
    const error = new ApiRequestError(
      502,
      "COMMIT_MESSAGE_GENERATION_FAILED",
      "Stage at least one file before generating a commit message.",
    );

    expect(toUiError(error)).toEqual({
      message: "Stage at least one file before generating a commit message.",
      retryable: true,
    });
  });

  it("maps workspace picker unsupported errors to manual fallback guidance", () => {
    const error = new ApiRequestError(501, "WORKSPACE_PICK_UNSUPPORTED", "unsupported");

    expect(toUiError(error)).toEqual({
      message: "Native folder picker is unavailable on this platform. Enter a path manually.",
      retryable: false,
    });
  });

  it("falls back to generic error text for unknown values", () => {
    expect(toUiError(null)).toEqual({
      message: "Unexpected request failure",
      retryable: true,
    });
  });
});
