import type {
  ActionResponse,
  CommitRequest,
  StageFileRequest,
  UnstageFileRequest,
} from "@diffx/contracts";
import { fetchJson } from "./client";

export async function stageFile(body: StageFileRequest): Promise<ActionResponse> {
  return await fetchJson<ActionResponse>("/api/actions/stage", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function unstageFile(body: UnstageFileRequest): Promise<ActionResponse> {
  return await fetchJson<ActionResponse>("/api/actions/unstage", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function commitChanges(body: CommitRequest): Promise<ActionResponse> {
  return await fetchJson<ActionResponse>("/api/actions/commit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
