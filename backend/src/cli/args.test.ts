import { describe, expect, it } from "vitest";
import { DiffxCliArgsError, parseDiffxCliArgs } from "./args.js";

describe("parseDiffxCliArgs", () => {
  it("returns defaults when no args are provided", () => {
    const parsed = parseDiffxCliArgs([], "/workspace/repo");

    expect(parsed).toEqual({
      kind: "run",
      options: {
        repoRoot: "/workspace/repo",
        port: 3210,
        host: "127.0.0.1",
        openBrowser: true,
      },
    });
  });

  it("parses path and flags", () => {
    const parsed = parseDiffxCliArgs(
      ["./target", "--port", "4000", "--host", "0.0.0.0", "--no-open"],
      "/workspace/repo",
    );

    expect(parsed).toEqual({
      kind: "run",
      options: {
        repoRoot: "/workspace/repo/target",
        port: 4000,
        host: "0.0.0.0",
        openBrowser: false,
      },
    });
  });

  it("returns help payload", () => {
    const parsed = parseDiffxCliArgs(["--help"], "/workspace/repo");

    expect(parsed.kind).toBe("help");
    expect(parsed.message).toContain("Usage:");
  });

  it("throws on unknown flags", () => {
    expect(() => parseDiffxCliArgs(["--wat"], "/workspace/repo")).toThrow(DiffxCliArgsError);
  });

  it("throws on invalid port", () => {
    expect(() => parseDiffxCliArgs(["--port", "abc"], "/workspace/repo")).toThrow(
      DiffxCliArgsError,
    );
  });

  it("throws when positional path is repeated", () => {
    expect(() => parseDiffxCliArgs(["./a", "./b"], "/workspace/repo")).toThrow(
      DiffxCliArgsError,
    );
  });
});
