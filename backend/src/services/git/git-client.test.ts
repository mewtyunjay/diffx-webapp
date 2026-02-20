import { describe, expect, it } from "vitest";
import { summarizeGitCommandArgs } from "./git-client.js";

describe("summarizeGitCommandArgs", () => {
  it("summarizes commit command metadata without exposing message payloads", () => {
    const summary = summarizeGitCommandArgs([
      "-C",
      "/repo/path",
      "commit",
      "-m",
      "ship quiz provider settings",
    ]);

    expect(summary).toEqual({
      subcommand: "commit",
      flagCount: 1,
      positionalCount: 0,
      usesRepoOverride: true,
    });
  });

  it("summarizes push command metadata", () => {
    const summary = summarizeGitCommandArgs([
      "-C",
      "/repo/path",
      "push",
      "--set-upstream",
      "origin",
      "main",
    ]);

    expect(summary).toEqual({
      subcommand: "push",
      flagCount: 1,
      positionalCount: 2,
      usesRepoOverride: true,
    });
  });
});
