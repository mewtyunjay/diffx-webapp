import type { FileContentsQuery, FileContentsResponse } from "@diffx/contracts";
import { fetchJson } from "./client";

function toFileContentsQueryString(query: FileContentsQuery): string {
  const params = new URLSearchParams();
  params.set("path", query.path);
  params.set("scope", query.scope);
  params.set("side", query.side);
  return params.toString();
}

export async function getLazyFileContents(
  query: FileContentsQuery,
): Promise<FileContentsResponse> {
  const qs = toFileContentsQueryString(query);
  return await fetchJson<FileContentsResponse>(`/api/file-contents?${qs}`);
}
