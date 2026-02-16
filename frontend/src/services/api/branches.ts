import type { BranchesResponse } from "@diffx/contracts";
import { fetchJson } from "./client";

export async function getBranches(): Promise<BranchesResponse> {
  return await fetchJson<BranchesResponse>("/api/branches");
}
