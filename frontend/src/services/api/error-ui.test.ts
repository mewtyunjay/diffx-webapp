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

  it("falls back to generic error text for unknown values", () => {
    expect(toUiError(null)).toEqual({
      message: "Unexpected request failure",
      retryable: true,
    });
  });
});
