import type { DiffDetailQuery, DiffDetailResponse } from "@diffx/contracts";
import { fetchJson } from "./client";

type RequestOptions = {
  signal?: AbortSignal;
};

function toDiffQueryString(query: DiffDetailQuery): string {
  const params = new URLSearchParams();
  params.set("path", query.path);
  params.set("scope", query.scope);

  if (query.contextLines !== undefined) {
    params.set("contextLines", String(query.contextLines));
  }

  return params.toString();
}

export async function getDiffDetail(
  query: DiffDetailQuery,
  options?: RequestOptions,
): Promise<DiffDetailResponse> {
  const qs = toDiffQueryString(query);
  return await fetchJson<DiffDetailResponse>(`/api/diff-detail?${qs}`, { signal: options?.signal });
}
