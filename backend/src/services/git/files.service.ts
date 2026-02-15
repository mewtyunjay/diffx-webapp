import type { ChangedFile } from "@diffx/contracts";
import { getRepoContext } from "./repo-context.service.js";
import { getStatusEntries, toChangedFiles } from "./status.service.js";

export async function getChangedFiles(): Promise<ChangedFile[]> {
  const context = await getRepoContext();

  if (context.mode === "non-git") {
    return [];
  }

  const entries = await getStatusEntries(context.repoRoot);
  return toChangedFiles(entries);
}
