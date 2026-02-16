import type { DiffQuery, DiffSummaryResponse } from "@diffx/contracts";
import { fetchJson } from "./client";

type RequestOptions = {
  signal?: AbortSignal;
};

function toDiffQueryString(query: DiffQuery): string {
  const params = new URLSearchParams();
  params.set("path", query.path);
  params.set("scope", query.scope);

  if (query.contextLines !== undefined) {
    params.set("contextLines", String(query.contextLines));
  }

  return params.toString();
}

export async function getDiffSummary(
  query: DiffQuery,
  options?: RequestOptions,
): Promise<DiffSummaryResponse> {
  const qs = toDiffQueryString(query);
  return await fetchJson<DiffSummaryResponse>(`/api/diff?${qs}`, { signal: options?.signal });
}
