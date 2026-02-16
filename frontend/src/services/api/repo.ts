import type { RepoSummary } from "@diffx/contracts";
import { fetchJson } from "./client";

type RequestOptions = {
  signal?: AbortSignal;
};

export async function getRepoSummary(options?: RequestOptions): Promise<RepoSummary> {
  return await fetchJson<RepoSummary>("/api/repo", { signal: options?.signal });
}
