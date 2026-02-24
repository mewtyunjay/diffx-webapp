import type {
  CodeReviewSession,
  CodeReviewSseEvent,
  CreateCodeReviewSessionRequest,
} from "@diffx/contracts";
import { fetchJson } from "./client";

export async function createCodeReviewSession(
  body: CreateCodeReviewSessionRequest = {},
): Promise<CodeReviewSession> {
  return await fetchJson<CodeReviewSession>("/api/code-review/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function getCodeReviewSession(sessionId: string): Promise<CodeReviewSession> {
  return await fetchJson<CodeReviewSession>(`/api/code-review/sessions/${encodeURIComponent(sessionId)}`);
}

export async function cancelCodeReviewSession(sessionId: string): Promise<CodeReviewSession> {
  return await fetchJson<CodeReviewSession>(
    `/api/code-review/sessions/${encodeURIComponent(sessionId)}/cancel`,
    {
      method: "POST",
    },
  );
}

type CodeReviewStreamHandlers = {
  onEvent: (event: CodeReviewSseEvent) => void;
  onError: (error: Error) => void;
};

function parseCodeReviewSseEvent(data: string): CodeReviewSseEvent | null {
  try {
    return JSON.parse(data) as CodeReviewSseEvent;
  } catch {
    return null;
  }
}

export function openCodeReviewSessionStream(
  sessionId: string,
  handlers: CodeReviewStreamHandlers,
): () => void {
  const source = new EventSource(`/api/code-review/sessions/${encodeURIComponent(sessionId)}/stream`);

  const handleMessage = (event: MessageEvent<string>) => {
    const payload = parseCodeReviewSseEvent(event.data);
    if (!payload) {
      handlers.onError(new Error("Invalid code review stream payload received."));
      return;
    }

    handlers.onEvent(payload);
  };

  const eventTypes: Array<CodeReviewSseEvent["type"]> = [
    "session_status",
    "finding",
    "session_error",
    "session_complete",
  ];

  for (const type of eventTypes) {
    source.addEventListener(type, (event) => handleMessage(event as MessageEvent<string>));
  }

  source.onerror = () => {
    handlers.onError(new Error("Code review stream disconnected."));
  };

  return () => {
    source.close();
  };
}
