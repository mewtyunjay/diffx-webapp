import type {
  ActionResponse,
  CommitRequest,
  GenerateCommitMessageRequest,
  PushRequest,
  StageManyRequest,
  StageFileRequest,
  UnstageManyRequest,
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

export async function stageManyFiles(body: StageManyRequest): Promise<ActionResponse> {
  return await fetchJson<ActionResponse>("/api/actions/stage-many", {
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

export async function unstageManyFiles(body: UnstageManyRequest): Promise<ActionResponse> {
  return await fetchJson<ActionResponse>("/api/actions/unstage-many", {
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

export async function generateCommitMessage(
  body: GenerateCommitMessageRequest = {},
): Promise<ActionResponse> {
  return await fetchJson<ActionResponse>("/api/actions/commit-message", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function pushChanges(body: PushRequest = {}): Promise<ActionResponse> {
  return await fetchJson<ActionResponse>("/api/actions/push", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
