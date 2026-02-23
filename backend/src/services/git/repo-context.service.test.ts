import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./git-client.js", () => ({
  execGit: vi.fn(),
  toGitApiError: vi.fn((_: unknown, message: string) => new Error(message)),
  GitCommandError: class GitCommandError extends Error {
    stderr: string;
    stdout: string;

    constructor(stderr = "", stdout = "") {
      super("git command failed");
      this.name = "GitCommandError";
      this.stderr = stderr;
      this.stdout = stdout;
    }
  },
}));

vi.mock("../workspace.service.js", () => ({
  getWorkspaceState: vi.fn(),
}));

import { execGit } from "./git-client.js";
import { getWorkspaceState } from "../workspace.service.js";
import {
  getRepoContext,
  invalidateRepoContextCache,
} from "./repo-context.service.js";

function buildGitExecResult(stdout: string, exitCode = 0) {
  return {
    stdout,
    stderr: "",
    stdoutBuffer: Buffer.from(stdout, "utf8"),
    stderrBuffer: Buffer.alloc(0),
    exitCode,
  };
}

describe("getRepoContext cache", () => {
  const execGitMock = vi.mocked(execGit);
  const getWorkspaceStateMock = vi.mocked(getWorkspaceState);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-21T00:00:00.000Z"));
    vi.resetAllMocks();
    invalidateRepoContextCache();

    getWorkspaceStateMock.mockReturnValue({ repoRoot: "/repo" });
    execGitMock.mockImplementation(async (args) => {
      if (args.includes("rev-parse")) {
        return buildGitExecResult("/repo\n");
      }

      return buildGitExecResult("main\n");
    });
  });

  afterEach(() => {
    invalidateRepoContextCache();
    vi.useRealTimers();
  });

  it("reuses cached context within ttl window", async () => {
    const first = await getRepoContext();
    const second = await getRepoContext();

    expect(first).toEqual(second);
    expect(execGitMock).toHaveBeenCalledTimes(2);
  });

  it("refreshes context after ttl expires", async () => {
    await getRepoContext();

    vi.advanceTimersByTime(151);

    await getRepoContext();

    expect(execGitMock).toHaveBeenCalledTimes(4);
  });

  it("reloads after explicit invalidation", async () => {
    await getRepoContext();
    invalidateRepoContextCache();

    await getRepoContext();

    expect(execGitMock).toHaveBeenCalledTimes(4);
  });
});
