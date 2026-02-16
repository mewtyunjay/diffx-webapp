import type { HealthResponse } from "@diffx/contracts";
import { fetchJson } from "./client";

type RequestOptions = {
  signal?: AbortSignal;
};

export async function getHealth(options?: RequestOptions): Promise<HealthResponse> {
  return await fetchJson<HealthResponse>("/api/health", { signal: options?.signal });
}
