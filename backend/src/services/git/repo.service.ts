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

  return {
    mode: "git",
    repoName: context.repoName,
    branch: context.branch,
    stagedCount: entries.filter((entry) => entry.staged).length,
    unstagedCount: entries.filter((entry) => entry.unstaged).length,
    untrackedCount: entries.filter((entry) => entry.untracked).length,
    remoteHash,
  };
}
