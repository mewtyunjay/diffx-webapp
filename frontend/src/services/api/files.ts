import type { ChangedFile } from "@diffx/contracts";
import { fetchJson } from "./client";

export async function getChangedFiles(): Promise<ChangedFile[]> {
  return await fetchJson<ChangedFile[]>("/api/files");
}
