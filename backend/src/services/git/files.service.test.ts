import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
  stat: vi.fn(),
  readFile: vi.fn(),
}));

vi.mock("./repo-context.service.js", () => ({
  getRepoContext: vi.fn(),
}));

vi.mock("./status.service.js", () => ({
  getStatusEntries: vi.fn(),
  toChangedFiles: vi.fn(),
}));

vi.mock("./git-client.js", () => ({
  execGit: vi.fn(),
  toGitApiError: vi.fn((error: unknown, message: string) => new Error(message)),
}));

import { readFile, stat } from "node:fs/promises";
import { execGit } from "./git-client.js";
import { getRepoContext } from "./repo-context.service.js";
import { getStatusEntries, toChangedFiles } from "./status.service.js";
import { getChangedFiles } from "./files.service.js";

describe("getChangedFiles", () => {
  const getRepoContextMock = vi.mocked(getRepoContext);
  const getStatusEntriesMock = vi.mocked(getStatusEntries);
  const toChangedFilesMock = vi.mocked(toChangedFiles);
  const execGitMock = vi.mocked(execGit);
  const statMock = vi.mocked(stat);
  const readFileMock = vi.mocked(readFile);

  const emptyGitResult = {
    stdout: "",
    stderr: "",
    stdoutBuffer: Buffer.alloc(0),
    stderrBuffer: Buffer.alloc(0),
    exitCode: 0,
  };

  beforeEach(() => {
    vi.resetAllMocks();

    getRepoContextMock.mockResolvedValue({
      mode: "git",
      repoRoot: "/repo",
      repoName: "repo",
      branch: "main",
    });

    execGitMock.mockResolvedValue(emptyGitResult);
    statMock.mockResolvedValue({ size: 24, mtimeMs: 1700000000000 } as never);
  });

  it("includes untracked text file line counts in stats", async () => {
    getStatusEntriesMock.mockResolvedValue([
      {
        path: "src/new-file.ts",
        staged: false,
        unstaged: false,
        untracked: true,
      },
    ]);

    toChangedFilesMock.mockReturnValue([
      {
        path: "src/new-file.ts",
        status: "untracked",
      },
    ]);

    readFileMock.mockResolvedValue(Buffer.from("line one\nline two\nline three\n"));

    const files = await getChangedFiles();

    expect(files).toHaveLength(1);
    expect(files[0]?.path).toBe("src/new-file.ts");
    expect(files[0]?.stats).toEqual({ additions: 3, deletions: 0 });
  });

  it("returns placeholder stats for untracked binary files", async () => {
    getStatusEntriesMock.mockResolvedValue([
      {
        path: "src/new-binary.bin",
        staged: false,
        unstaged: false,
        untracked: true,
      },
    ]);

    toChangedFilesMock.mockReturnValue([
      {
        path: "src/new-binary.bin",
        status: "untracked",
      },
    ]);

    readFileMock.mockResolvedValue(Buffer.from([0, 1, 2, 3]));

    const files = await getChangedFiles();

    expect(files).toHaveLength(1);
    expect(files[0]?.path).toBe("src/new-binary.bin");
    expect(files[0]?.stats).toEqual({ additions: null, deletions: null });
  });
});
