import type { BranchesResponse } from "@diffx/contracts";
import { execGit, toGitApiError } from "./git-client.js";
import { getRepoContext } from "./repo-context.service.js";

export async function getBranches(): Promise<BranchesResponse> {
  const context = await getRepoContext();

  if (context.mode === "non-git") {
    return {
      mode: "non-git",
      branches: [],
    };
  }

  try {
    const result = await execGit([
      "-C",
      context.repoRoot,
      "for-each-ref",
      "--format=%(refname:short)|%(HEAD)",
      "refs/heads",
    ]);

    const branches = result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, marker] = line.split("|");
        return {
          name,
          current: marker?.trim() === "*",
        };
      });

    return {
      mode: "git",
      branches,
    };
  } catch (error) {
    throw toGitApiError(error, "Unable to list repository branches.");
  }
}
