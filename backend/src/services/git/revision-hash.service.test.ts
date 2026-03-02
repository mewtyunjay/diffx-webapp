import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./git-client.js", () => ({
  execGit: vi.fn(),
  toGitApiError: vi.fn((_: unknown, message: string) => new Error(message)),
}));

import { execGit } from "./git-client.js";
import { getRemoteHash, invalidateRemoteHashCache } from "./revision-hash.service.js";

function buildGitExecResult(stdout: string, exitCode = 0) {
  return {
    stdout,
    stderr: "",
    stdoutBuffer: Buffer.from(stdout, "utf8"),
    stderrBuffer: Buffer.alloc(0),
    exitCode,
  };
}

function isCommand(args: string[], token: string): boolean {
  return args.includes(token);
}

describe("getRemoteHash cache", () => {
  const execGitMock = vi.mocked(execGit);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-24T00:00:00.000Z"));
    vi.resetAllMocks();
    invalidateRemoteHashCache();

    execGitMock.mockImplementation(async (args) => {
      if (isCommand(args, "HEAD")) {
        return buildGitExecResult("head-oid\n");
      }

      if (isCommand(args, "@{upstream}")) {
        return buildGitExecResult("origin/main\n");
      }

      if (isCommand(args, "origin/main")) {
        return buildGitExecResult("upstream-oid\n");
      }

      if (isCommand(args, "--left-right")) {
        return buildGitExecResult("0\t1\n");
      }

      return buildGitExecResult("");
    });
  });

  afterEach(() => {
    invalidateRemoteHashCache();
    vi.useRealTimers();
  });

  it("reuses cached remote hash within ttl window", async () => {
    const first = await getRemoteHash("/repo", "main");
    const second = await getRemoteHash("/repo", "main");

    expect(second).toBe(first);
    expect(execGitMock).toHaveBeenCalledTimes(4);
  });

  it("refreshes remote hash after cache invalidation", async () => {
    await getRemoteHash("/repo", "main");
    invalidateRemoteHashCache("/repo");

    await getRemoteHash("/repo", "main");

    expect(execGitMock).toHaveBeenCalledTimes(8);
  });

  it("coalesces concurrent remote hash requests for the same branch", async () => {
    let releaseHeadRequest: (() => void) | null = null;

    execGitMock.mockImplementation((args) => {
      if (isCommand(args, "HEAD")) {
        return new Promise((resolve) => {
          releaseHeadRequest = () => {
            resolve(buildGitExecResult("head-oid\n"));
          };
        });
      }

      if (isCommand(args, "@{upstream}")) {
        return Promise.resolve(buildGitExecResult("origin/main\n"));
      }

      if (isCommand(args, "origin/main")) {
        return Promise.resolve(buildGitExecResult("upstream-oid\n"));
      }

      return Promise.resolve(buildGitExecResult("0\t1\n"));
    });

    const first = getRemoteHash("/repo", "main");
    const second = getRemoteHash("/repo", "main");

    expect(execGitMock).toHaveBeenCalledTimes(1);
    releaseHeadRequest?.();

    await Promise.all([first, second]);
    expect(execGitMock).toHaveBeenCalledTimes(4);
  });
});
