import type { HealthResponse } from "@diffx/contracts";
import { fetchJson } from "./client";

export async function getHealth(): Promise<HealthResponse> {
  return await fetchJson<HealthResponse>("/api/health");
}
