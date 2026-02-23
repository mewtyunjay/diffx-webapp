import type {
  DiffDetailQuery,
  DiffDetailResponse,
  DiffQuery,
  DiffSummaryResponse,
  FileContentsQuery,
  FileContentsResponse,
} from "@diffx/contracts";
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

function toFileContentsQueryString(query: FileContentsQuery): string {
  const params = new URLSearchParams();
  params.set("path", query.path);
  params.set("scope", query.scope);
  params.set("side", query.side);

  return params.toString();
}

export async function getDiffSummary(
  query: DiffQuery,
  options?: RequestOptions,
): Promise<DiffSummaryResponse> {
  const qs = toDiffQueryString(query);
  return await fetchJson<DiffSummaryResponse>(`/api/diff?${qs}`, { signal: options?.signal });
}

export async function getFileContents(
  query: FileContentsQuery,
  options?: RequestOptions,
): Promise<FileContentsResponse> {
  const qs = toFileContentsQueryString(query);
  return await fetchJson<FileContentsResponse>(`/api/file-contents?${qs}`, {
    signal: options?.signal,
  });
}

export async function getDiffDetail(
  query: DiffDetailQuery,
  options?: RequestOptions,
): Promise<DiffDetailResponse> {
  const qs = toDiffQueryString(query);
  return await fetchJson<DiffDetailResponse>(`/api/diff-detail?${qs}`, { signal: options?.signal });
}
