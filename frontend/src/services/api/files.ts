import type { ChangedFile } from "@diffx/contracts";
import { fetchJson } from "./client";

type RequestOptions = {
  signal?: AbortSignal;
};

export async function getChangedFiles(options?: RequestOptions): Promise<ChangedFile[]> {
  return await fetchJson<ChangedFile[]>("/api/files", { signal: options?.signal });
}
