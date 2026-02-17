import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import type {
  CreateQuizSessionRequest,
  QuizSession,
  QuizSseEvent,
  QuizValidationResult,
  SubmitQuizAnswersRequest,
  ValidateQuizSessionRequest,
} from "@diffx/contracts";
import { ApiRouteError } from "../../domain/api-route-error.js";
import { getSettings } from "../settings/settings.service.js";
import { getQuizGeneratorProvider } from "./codex-sdk.provider.js";
import {
  buildQuizPromptContext,
  getCurrentQuizSourceFingerprint,
} from "./quiz-prompt.builder.js";
import { validateQuizPayload } from "./quiz-schema.validator.js";
import { evaluateQuizValidation, normalizeQuizAnswers } from "./quiz-validation.service.js";

const GENERATION_TIMEOUT_MS = 15_000;
const SESSION_TTL_MS = 60 * 60 * 1000;
const MAX_SESSION_COUNT = 200;

const sessions = new Map<string, QuizSession>();
const events = new EventEmitter();

function sessionEventKey(sessionId: string): string {
  return `session:${sessionId}`;
}

function cloneSession(session: QuizSession): QuizSession {
  return {
    id: session.id,
    status: session.status,
    sourceFingerprint: session.sourceFingerprint,
    commitMessageDraft: session.commitMessageDraft,
    selectedPath: session.selectedPath,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    progress: {
      phase: session.progress.phase,
      percent: session.progress.percent,
      message: session.progress.message,
    },
    quiz: session.quiz
      ? {
          title: session.quiz.title,
          generatedAt: session.quiz.generatedAt,
          questions: session.quiz.questions.map((question) => ({
            id: question.id,
            prompt: question.prompt,
            snippet: question.snippet,
            options: [...question.options] as [string, string, string, string],
            correctOptionIndex: question.correctOptionIndex,
            explanation: question.explanation,
            tags: [...question.tags],
          })),
        }
      : null,
    answers: { ...session.answers },
    validation: session.validation
      ? {
          ...session.validation,
        }
      : null,
    failure: session.failure
      ? {
          message: session.failure.message,
          retryable: session.failure.retryable,
        }
      : null,
  };
}

function getSessionOrThrow(sessionId: string): QuizSession {
  const session = sessions.get(sessionId);

  if (!session) {
    throw new ApiRouteError(404, "QUIZ_SESSION_NOT_FOUND", "Quiz session was not found.");
  }

  return session;
}

function emitSessionEvent(sessionId: string, event: QuizSseEvent) {
  events.emit(sessionEventKey(sessionId), event);
}

function publishStatus(session: QuizSession) {
  emitSessionEvent(session.id, {
    type: "session_status",
    session: cloneSession(session),
  });
}

function publishReady(session: QuizSession) {
  if (!session.quiz) {
    return;
  }

  emitSessionEvent(session.id, {
    type: "quiz_ready",
    session: cloneSession(session),
    quiz: cloneSession(session).quiz!,
  });
}

function publishError(session: QuizSession) {
  emitSessionEvent(session.id, {
    type: "session_error",
    session: cloneSession(session),
    retryable: session.failure?.retryable ?? false,
    message: session.failure?.message ?? "Quiz generation failed.",
  });
}

function publishComplete(session: QuizSession) {
  emitSessionEvent(session.id, {
    type: "session_complete",
    session: cloneSession(session),
  });
}

function touchSession(
  sessionId: string,
  updater: (current: QuizSession) => QuizSession,
): QuizSession {
  const current = getSessionOrThrow(sessionId);
  const next = updater(current);
  sessions.set(sessionId, next);
  return next;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => {
          reject(
            new ApiRouteError(
              504,
              "QUIZ_GENERATION_FAILED",
              "Quiz generation timed out before completion.",
            ),
          );
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function mapGenerationError(error: unknown): QuizSession["failure"] {
  if (error instanceof ApiRouteError) {
    return {
      message: error.message,
      retryable: error.code === "QUIZ_GENERATION_FAILED" || error.code === "INTERNAL_ERROR",
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      retryable: false,
    };
  }

  return {
    message: "Quiz generation failed.",
    retryable: false,
  };
}

function sanitizeCommitMessage(messageInput: unknown): string {
  if (typeof messageInput !== "string") {
    throw new ApiRouteError(400, "INVALID_COMMIT_MESSAGE", "Body `commitMessage` is required.");
  }

  const trimmed = messageInput.trim();

  if (!trimmed) {
    throw new ApiRouteError(400, "INVALID_COMMIT_MESSAGE", "Body `commitMessage` is required.");
  }

  return trimmed;
}

function validateSessionId(sessionId: string) {
  if (sessionId.trim().length === 0) {
    throw new ApiRouteError(400, "INVALID_QUIZ_SESSION", "Session id is required.");
  }
}

function pruneSessions() {
  const now = Date.now();

  for (const [sessionId, session] of sessions) {
    const updatedAt = Date.parse(session.updatedAt);
    if (!Number.isFinite(updatedAt) || now - updatedAt > SESSION_TTL_MS) {
      sessions.delete(sessionId);
      events.removeAllListeners(sessionEventKey(sessionId));
    }
  }

  if (sessions.size <= MAX_SESSION_COUNT) {
    return;
  }

  const oldestFirst = [...sessions.values()].sort((left, right) => {
    return Date.parse(left.updatedAt) - Date.parse(right.updatedAt);
  });

  for (const stale of oldestFirst.slice(0, sessions.size - MAX_SESSION_COUNT)) {
    sessions.delete(stale.id);
    events.removeAllListeners(sessionEventKey(stale.id));
  }
}

async function runGeneration(
  sessionId: string,
  input: {
    questionCount: number;
    commitMessage: string;
    focusFiles: string[];
    promptContext: string;
  },
) {
  touchSession(sessionId, (current) => ({
    ...current,
    status: "streaming",
    updatedAt: new Date().toISOString(),
    progress: {
      phase: "generating",
      percent: 20,
      message: "Generating quiz questions...",
    },
    failure: null,
  }));

  publishStatus(getSessionOrThrow(sessionId));

  try {
    const provider = getQuizGeneratorProvider();
    const rawPayload = await withTimeout(provider.generateQuiz(input), GENERATION_TIMEOUT_MS);
    const payload = validateQuizPayload(rawPayload);

    const readySession = touchSession(sessionId, (current) => ({
      ...current,
      status: "ready",
      updatedAt: new Date().toISOString(),
      progress: {
        phase: "generating",
        percent: 100,
        message: "Quiz is ready.",
      },
      quiz: payload,
      failure: null,
    }));

    publishStatus(readySession);
    publishReady(readySession);
    publishComplete(readySession);
  } catch (error) {
    const failure = mapGenerationError(error);
    const failedSession = touchSession(sessionId, (current) => ({
      ...current,
      status: "failed",
      updatedAt: new Date().toISOString(),
      progress: {
        phase: "generating",
        percent: 100,
        message: "Quiz generation failed.",
      },
      failure,
      quiz: null,
      validation: null,
    }));

    publishStatus(failedSession);
    publishError(failedSession);
    publishComplete(failedSession);
  }
}

function toInitialEvents(session: QuizSession): QuizSseEvent[] {
  const statusEvent: QuizSseEvent = {
    type: "session_status",
    session: cloneSession(session),
  };

  if (session.status === "ready" && session.quiz) {
    return [
      statusEvent,
      {
        type: "quiz_ready",
        session: cloneSession(session),
        quiz: cloneSession(session).quiz!,
      },
      {
        type: "session_complete",
        session: cloneSession(session),
      },
    ];
  }

  if (session.status === "failed") {
    return [
      statusEvent,
      {
        type: "session_error",
        session: cloneSession(session),
        retryable: session.failure?.retryable ?? false,
        message: session.failure?.message ?? "Quiz generation failed.",
      },
      {
        type: "session_complete",
        session: cloneSession(session),
      },
    ];
  }

  if (session.status === "validated") {
    return [
      statusEvent,
      {
        type: "session_complete",
        session: cloneSession(session),
      },
    ];
  }

  return [statusEvent];
}

export async function createQuizSession(input: CreateQuizSessionRequest): Promise<QuizSession> {
  pruneSessions();

  const commitMessage = sanitizeCommitMessage(input.commitMessage);
  const selectedPath = typeof input.selectedPath === "string" ? input.selectedPath : null;
  const settings = getSettings();
  const promptContext = await buildQuizPromptContext(settings.quiz, selectedPath);
  const createdAt = new Date().toISOString();

  const session: QuizSession = {
    id: randomUUID(),
    status: "queued",
    sourceFingerprint: promptContext.sourceFingerprint,
    commitMessageDraft: commitMessage,
    selectedPath,
    createdAt,
    updatedAt: createdAt,
    progress: {
      phase: "queued",
      percent: 0,
      message: "Session queued.",
    },
    quiz: null,
    answers: {},
    validation: null,
    failure: null,
  };

  sessions.set(session.id, session);
  publishStatus(session);

  void runGeneration(session.id, {
    questionCount: settings.quiz.questionCount,
    commitMessage,
    focusFiles: promptContext.focusFiles,
    promptContext: promptContext.promptContext,
  });

  return cloneSession(session);
}

export function getQuizSession(sessionId: string): QuizSession {
  validateSessionId(sessionId);
  return cloneSession(getSessionOrThrow(sessionId));
}

export function subscribeToQuizSession(
  sessionId: string,
  listener: (event: QuizSseEvent) => void,
): () => void {
  validateSessionId(sessionId);
  const session = getSessionOrThrow(sessionId);
  const key = sessionEventKey(session.id);

  events.on(key, listener);

  return () => {
    events.off(key, listener);
  };
}

export function getQuizSessionInitialEvents(sessionId: string): QuizSseEvent[] {
  validateSessionId(sessionId);
  return toInitialEvents(getSessionOrThrow(sessionId));
}

export function submitQuizAnswers(
  sessionId: string,
  request: SubmitQuizAnswersRequest,
): QuizSession {
  validateSessionId(sessionId);

  if (typeof request !== "object" || request === null || typeof request.answers !== "object") {
    throw new ApiRouteError(
      400,
      "INVALID_QUIZ_ANSWER",
      "Body `answers` is required and must be an object.",
    );
  }

  const current = getSessionOrThrow(sessionId);

  if (current.status === "queued" || current.status === "streaming") {
    throw new ApiRouteError(
      409,
      "QUIZ_SESSION_NOT_READY",
      "Quiz session is still generating questions.",
    );
  }

  if (current.status === "failed") {
    throw new ApiRouteError(409, "QUIZ_SESSION_FAILED", "Quiz session failed to generate.");
  }

  if (!current.quiz) {
    throw new ApiRouteError(409, "QUIZ_SESSION_NOT_READY", "Quiz questions are not ready yet.");
  }

  const normalizedAnswers = normalizeQuizAnswers(current.quiz, request.answers);

  const next = touchSession(sessionId, (session) => ({
    ...session,
    status: session.status === "validated" ? "ready" : session.status,
    updatedAt: new Date().toISOString(),
    answers: normalizedAnswers,
    validation: session.status === "validated" ? null : session.validation,
    progress: {
      phase: "validating",
      percent: 0,
      message: "Answers updated.",
    },
  }));

  publishStatus(next);

  return cloneSession(next);
}

export async function validateQuizSession(
  sessionId: string,
  request: ValidateQuizSessionRequest,
): Promise<QuizSession> {
  validateSessionId(sessionId);

  if (
    typeof request !== "object" ||
    request === null ||
    typeof request.sourceFingerprint !== "string" ||
    request.sourceFingerprint.trim().length === 0
  ) {
    throw new ApiRouteError(
      400,
      "INVALID_QUIZ_SESSION",
      "Body `sourceFingerprint` is required.",
    );
  }

  const session = getSessionOrThrow(sessionId);

  if (session.status === "queued" || session.status === "streaming") {
    throw new ApiRouteError(
      409,
      "QUIZ_SESSION_NOT_READY",
      "Quiz session is still generating questions.",
    );
  }

  if (session.status === "failed") {
    throw new ApiRouteError(409, "QUIZ_SESSION_FAILED", "Quiz session failed to generate.");
  }

  if (!session.quiz) {
    throw new ApiRouteError(409, "QUIZ_SESSION_NOT_READY", "Quiz questions are not ready yet.");
  }

  const currentSourceFingerprint = await getCurrentQuizSourceFingerprint();

  if (
    request.sourceFingerprint !== session.sourceFingerprint ||
    currentSourceFingerprint !== session.sourceFingerprint
  ) {
    throw new ApiRouteError(
      409,
      "QUIZ_REPO_STATE_CHANGED",
      "Repository state changed. Regenerate quiz before validating.",
    );
  }

  const settings = getSettings();
  const result: QuizValidationResult = evaluateQuizValidation(
    session.quiz,
    session.answers,
    settings.quiz,
  );

  const next = touchSession(sessionId, (current) => ({
    ...current,
    status: result.passed ? "validated" : "ready",
    updatedAt: new Date().toISOString(),
    validation: result,
    progress: {
      phase: "validating",
      percent: 100,
      message: result.passed ? "Validation passed." : "Validation did not pass yet.",
    },
  }));

  publishStatus(next);

  if (result.passed) {
    publishComplete(next);
  }

  return cloneSession(next);
}

export function resetQuizSessionsForTests() {
  sessions.clear();
  events.removeAllListeners();
}
