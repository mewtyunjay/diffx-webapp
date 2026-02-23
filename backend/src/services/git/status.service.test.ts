import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./git-client.js", () => ({
  execGit: vi.fn(),
  toGitApiError: vi.fn((_: unknown, message: string) => new Error(message)),
}));

import { execGit } from "./git-client.js";
import {
  getStatusEntries,
  invalidateStatusEntriesCache,
} from "./status.service.js";

function buildGitExecResult(stdout: string, exitCode = 0) {
  return {
    stdout,
    stderr: "",
    stdoutBuffer: Buffer.from(stdout, "utf8"),
    stderrBuffer: Buffer.alloc(0),
    exitCode,
  };
}

describe("getStatusEntries cache", () => {
  const execGitMock = vi.mocked(execGit);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-21T00:00:00.000Z"));
    vi.resetAllMocks();
    invalidateStatusEntriesCache();

    execGitMock.mockResolvedValue(
      buildGitExecResult(" M src/app.ts\nA  src/new-file.ts\n?? src/untracked.ts\n"),
    );
  });

  afterEach(() => {
    invalidateStatusEntriesCache();
    vi.useRealTimers();
  });

  it("reuses cached status entries within ttl window", async () => {
    const first = await getStatusEntries("/repo");
    const second = await getStatusEntries("/repo");

    expect(first).toEqual(second);
    expect(execGitMock).toHaveBeenCalledTimes(1);
  });

  it("refreshes status entries after ttl expires", async () => {
    await getStatusEntries("/repo");

    vi.advanceTimersByTime(151);

    await getStatusEntries("/repo");

    expect(execGitMock).toHaveBeenCalledTimes(2);
  });

  it("reloads after explicit invalidation", async () => {
    await getStatusEntries("/repo");
    invalidateStatusEntriesCache("/repo");

    await getStatusEntries("/repo");

    expect(execGitMock).toHaveBeenCalledTimes(2);
  });
});
