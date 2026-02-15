import type { DiffScope } from "@diffx/contracts";
import { execGit, toGitApiError } from "./git-client.js";
import type { GitStatusEntry } from "./status.service.js";

export async function getPatchForPath(
  repoRoot: string,
  relativePath: string,
  scope: DiffScope,
  contextLines: number,
  statusEntry: GitStatusEntry | undefined,
): Promise<string> {
  const args = [
    "-C",
    repoRoot,
    "diff",
    "--no-color",
    "--no-ext-diff",
    `--unified=${contextLines}`,
  ];

  if (scope === "staged") {
    args.push("--cached");
  }

  args.push("--", relativePath);

  try {
    const result = await execGit(args);
    if (result.stdout.trim().length > 0) {
      return result.stdout;
    }
  } catch (error) {
    throw toGitApiError(error, "Unable to generate diff patch.");
  }

  if (scope !== "unstaged" || !statusEntry?.untracked) {
    return "";
  }

  try {
    const untrackedPatchResult = await execGit(
      [
        "-C",
        repoRoot,
        "diff",
        "--no-index",
        "--no-color",
        "--no-ext-diff",
        `--unified=${contextLines}`,
        "--",
        "/dev/null",
        relativePath,
      ],
      { allowExitCodes: [0, 1] },
    );

    return untrackedPatchResult.stdout;
  } catch (error) {
    throw toGitApiError(error, "Unable to generate patch for untracked file.");
  }
}
