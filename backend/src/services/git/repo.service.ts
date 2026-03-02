import type { RepoSummary } from "@diffx/contracts";
import { getRepoContext } from "./repo-context.service.js";
import { getRemoteHash } from "./revision-hash.service.js";
import { getStatusEntries } from "./status.service.js";

export async function getRepoSummary(): Promise<RepoSummary> {
  const context = await getRepoContext();

  if (context.mode === "non-git") {
    return {
      mode: "non-git",
      repoName: context.repoName,
      branch: null,
      stagedCount: 0,
      unstagedCount: 0,
      untrackedCount: 0,
      remoteHash: "non-git",
    };
  }

  const entries = await getStatusEntries(context.repoRoot);
  const remoteHash = await getRemoteHash(context.repoRoot, context.branch);
  let stagedCount = 0;
  let unstagedCount = 0;
  let untrackedCount = 0;

  for (const entry of entries) {
    if (entry.staged) stagedCount += 1;
    if (entry.unstaged) unstagedCount += 1;
    if (entry.untracked) untrackedCount += 1;
  }

  return {
    mode: "git",
    repoName: context.repoName,
    branch: context.branch,
    stagedCount,
    unstagedCount,
    untrackedCount,
    remoteHash,
  };
}
