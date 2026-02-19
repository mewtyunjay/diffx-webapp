import type {
  CreateQuizSessionRequest,
  GetQuizProvidersResponse,
  QuizSession,
  QuizSseEvent,
  SubmitQuizAnswersRequest,
  ValidateQuizSessionRequest,
} from "@diffx/contracts";
import { fetchJson } from "./client";

export async function createQuizSession(body: CreateQuizSessionRequest): Promise<QuizSession> {
  return await fetchJson<QuizSession>("/api/quiz/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function getQuizSession(sessionId: string): Promise<QuizSession> {
  return await fetchJson<QuizSession>(`/api/quiz/sessions/${encodeURIComponent(sessionId)}`);
}

export async function submitQuizAnswers(
  sessionId: string,
  body: SubmitQuizAnswersRequest,
): Promise<QuizSession> {
  return await fetchJson<QuizSession>(`/api/quiz/sessions/${encodeURIComponent(sessionId)}/answers`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function validateQuizSession(
  sessionId: string,
  body: ValidateQuizSessionRequest,
): Promise<QuizSession> {
  return await fetchJson<QuizSession>(`/api/quiz/sessions/${encodeURIComponent(sessionId)}/validate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function getQuizProviders(): Promise<GetQuizProvidersResponse> {
  return await fetchJson<GetQuizProvidersResponse>("/api/quiz/providers");
}

type QuizStreamHandlers = {
  onEvent: (event: QuizSseEvent) => void;
  onError: (error: Error) => void;
};

function parseQuizSseEvent(data: string): QuizSseEvent | null {
  try {
    return JSON.parse(data) as QuizSseEvent;
  } catch {
    return null;
  }
}

export function openQuizSessionStream(
  sessionId: string,
  handlers: QuizStreamHandlers,
): () => void {
  const source = new EventSource(`/api/quiz/sessions/${encodeURIComponent(sessionId)}/stream`);

  const handleMessage = (event: MessageEvent<string>) => {
    const payload = parseQuizSseEvent(event.data);
    if (!payload) {
      handlers.onError(new Error("Invalid quiz stream payload received."));
      return;
    }

    handlers.onEvent(payload);
  };

  const eventTypes: Array<QuizSseEvent["type"]> = [
    "session_status",
    "session_error",
    "quiz_ready",
    "session_complete",
  ];

  for (const type of eventTypes) {
    source.addEventListener(type, (event) => handleMessage(event as MessageEvent<string>));
  }

  source.onerror = () => {
    handlers.onError(new Error("Quiz progress stream disconnected."));
  };

  return () => {
    source.close();
  };
}
