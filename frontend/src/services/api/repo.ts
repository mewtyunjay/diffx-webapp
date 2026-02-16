import type { RepoSummary } from "@diffx/contracts";
import { fetchJson } from "./client";

export async function getRepoSummary(): Promise<RepoSummary> {
  return await fetchJson<RepoSummary>("/api/repo");
}
