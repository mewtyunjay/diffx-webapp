import { describe, expect, it } from "vitest";
import { queryKeys } from "./query-keys";

describe("queryKeys.diffDetail", () => {
  it("includes scope in cache key", () => {
    expect(queryKeys.diffDetail("src/app.ts", "staged", 3, "hash-1")).toEqual([
      "diffDetail",
      "src/app.ts",
      "staged",
      3,
      "hash-1",
    ]);
  });

  it("separates staged and unstaged cache entries", () => {
    const staged = queryKeys.diffDetail("src/app.ts", "staged", 3, "hash-1");
    const unstaged = queryKeys.diffDetail("src/app.ts", "unstaged", 3, "hash-1");

    expect(staged).not.toEqual(unstaged);
  });
});
