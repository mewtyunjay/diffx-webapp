import { describe, expect, it } from "vitest";
import { toApiRequestLogLine } from "./http-logging.middleware.js";

describe("toApiRequestLogLine", () => {
  it("formats method, path, and status", () => {
    expect(toApiRequestLogLine("get", "/api/repo", 200)).toBe("GET /api/repo 200");
    expect(toApiRequestLogLine("POST", "/api/settings", 400)).toBe("POST /api/settings 400");
  });
});
