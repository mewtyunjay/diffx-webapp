import type {
  GetSettingsResponse,
  PutSettingsRequest,
  PutSettingsResponse,
} from "@diffx/contracts";
import { fetchJson } from "./client";

export async function getSettings(): Promise<GetSettingsResponse> {
  return await fetchJson<GetSettingsResponse>("/api/settings");
}

export async function putSettings(body: PutSettingsRequest): Promise<PutSettingsResponse> {
  return await fetchJson<PutSettingsResponse>("/api/settings", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
