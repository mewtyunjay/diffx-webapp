import type {
  GetWorkspaceResponse,
  SetWorkspaceRequest,
  SetWorkspaceResponse,
} from "@diffx/contracts";
import { fetchJson } from "./client";

export async function getWorkspace(): Promise<GetWorkspaceResponse> {
  return await fetchJson<GetWorkspaceResponse>("/api/workspace");
}

export async function setWorkspace(body: SetWorkspaceRequest): Promise<SetWorkspaceResponse> {
  return await fetchJson<SetWorkspaceResponse>("/api/workspace", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function pickWorkspace(): Promise<SetWorkspaceResponse> {
  return await fetchJson<SetWorkspaceResponse>("/api/workspace/pick", {
    method: "POST",
  });
}
