import { randomUUID, createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import type {
  CodeReviewFinding,
  CodeReviewSession,
  CodeReviewSseEvent,
  CreateCodeReviewSessionRequest,
} from "@diffx/contracts";
import { ApiRouteError } from "../../domain/api-route-error.js";
import { logBackendEvent } from "../../logging/logger.js";
import { mergeCodeReviewFindings } from "./code-review-merge.js";
import { validateCodeReviewFindings, type NormalizedFinding } from "./code-review-schema.validator.js";
import { buildCodeReviewPromptContext } from "./code-review-context.builder.js";
import {
  getCodeReviewProvider,
  resetCodeReviewProviderForTests,
} from "./provider-registry.js";
import { CODE_REVIEW_SPECIALISTS, type CodeReviewSpecialistId } from "./specialists.js";

const GENERATION_TIMEOUT_ENV_KEY = "DIFFX_CODE_REVIEW_TIMEOUT_MS";
const DEFAULT_GENERATION_TIMEOUT_MS = 45_000;
const MIN_GENERATION_TIMEOUT_MS = 5_000;
const MAX_GENERATION_TIMEOUT_MS = 300_000;
const SESSION_TTL_MS = 60 * 60 * 1000;
const MAX_SESSION_COUNT = 200;

const sessions = new Map<string, CodeReviewSession>();
const events = new EventEmitter();

let activeRun:
  | {
      sessionId: string;
      abortController: AbortController;
    }
  | null = null;

function sessionEventKey(sessionId: string): string {
  return `code-review:${sessionId}`;
}

function logCodeReview(
  message: string,
  details?: Record<string, unknown>,
  level: "debug" | "info" | "warn" | "error" = "info",
) {
  logBackendEvent("quiz", level, `code-review:${message}`, details);
}

function cloneSession(session: CodeReviewSession): CodeReviewSession {
  return {
    id: session.id,
    status: session.status,
    sourceFingerprint: session.sourceFingerprint,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    progress: {
      phase: session.progress.phase,
      percent: session.progress.percent,
      message: session.progress.message,
    },
    findings: session.findings.map((finding) => ({
      id: finding.id,
      severity: finding.severity,
      type: finding.type,
      title: finding.title,
      summary: finding.summary,
      path: finding.path,
      lineStart: finding.lineStart,
      lineEnd: finding.lineEnd,
      agent: finding.agent,
    })),
    failure: session.failure
      ? {
          message: session.failure.message,
          retryable: session.failure.retryable,
        }
      : null,
  };
}

function getSessionOrThrow(sessionId: string): CodeReviewSession {
  const session = sessions.get(sessionId);

  if (!session) {
    throw new ApiRouteError(404, "REVIEW_SESSION_NOT_FOUND", "Code review session was not found.");
  }

  return session;
}

function touchSession(
  sessionId: string,
  updater: (current: CodeReviewSession) => CodeReviewSession,
): CodeReviewSession {
  const current = getSessionOrThrow(sessionId);
  const next = updater(current);
  sessions.set(sessionId, next);
  return next;
}

function emitSessionEvent(sessionId: string, event: CodeReviewSseEvent) {
  events.emit(sessionEventKey(sessionId), event);
}

function publishStatus(session: CodeReviewSession) {
  emitSessionEvent(session.id, {
    type: "session_status",
    session: cloneSession(session),
  });
}

function publishFinding(session: CodeReviewSession, finding: CodeReviewFinding) {
  emitSessionEvent(session.id, {
    type: "finding",
    session: cloneSession(session),
    finding: {
      ...finding,
    },
  });
}

function publishError(session: CodeReviewSession) {
  emitSessionEvent(session.id, {
    type: "session_error",
    session: cloneSession(session),
    retryable: session.failure?.retryable ?? false,
    message: session.failure?.message ?? "Code review generation failed.",
  });
}

function publishComplete(session: CodeReviewSession) {
  emitSessionEvent(session.id, {
    type: "session_complete",
    session: cloneSession(session),
  });
}

function validateSessionId(sessionId: string) {
  if (sessionId.trim().length === 0) {
    throw new ApiRouteError(400, "INVALID_REVIEW_SESSION", "Session id is required.");
  }
}

function isTerminal(session: CodeReviewSession): boolean {
  return session.status === "ready" || session.status === "failed" || session.status === "cancelled";
}

function isCancelled(sessionId: string): boolean {
  const session = sessions.get(sessionId);
  return session?.status === "cancelled";
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

  const oldestFirst = [...sessions.values()].sort(
    (left, right) => Date.parse(left.updatedAt) - Date.parse(right.updatedAt),
  );

  for (const stale of oldestFirst.slice(0, sessions.size - MAX_SESSION_COUNT)) {
    sessions.delete(stale.id);
    events.removeAllListeners(sessionEventKey(stale.id));
  }
}

function toFailure(error: unknown): NonNullable<CodeReviewSession["failure"]> {
  if (error instanceof ApiRouteError) {
    return {
      message: error.message,
      retryable: error.code === "REVIEW_GENERATION_FAILED" || error.code === "INTERNAL_ERROR",
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message.trim().length > 0 ? error.message : "Code review generation failed.",
      retryable: false,
    };
  }

  return {
    message: "Code review generation failed.",
    retryable: false,
  };
}

function getGenerationTimeoutMs(): number {
  const rawTimeout = process.env[GENERATION_TIMEOUT_ENV_KEY]?.trim();
  if (!rawTimeout) {
    return DEFAULT_GENERATION_TIMEOUT_MS;
  }

  const parsed = Number(rawTimeout);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_GENERATION_TIMEOUT_MS;
  }

  const normalized = Math.trunc(parsed);
  if (normalized < MIN_GENERATION_TIMEOUT_MS || normalized > MAX_GENERATION_TIMEOUT_MS) {
    return DEFAULT_GENERATION_TIMEOUT_MS;
  }

  return normalized;
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
              "REVIEW_GENERATION_FAILED",
              `Code review timed out after ${Math.ceil(timeoutMs / 1000)}s.`,
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

function toFindingId(sessionId: string, finding: NormalizedFinding, agent: CodeReviewSpecialistId, index: number): string {
  const key = [
    sessionId,
    agent,
    finding.path,
    String(finding.lineStart ?? "none"),
    String(finding.lineEnd ?? "none"),
    finding.severity,
    finding.type,
    finding.title,
    String(index),
  ].join("|");

  return createHash("sha256").update(key).digest("hex").slice(0, 16);
}

function toCodeReviewFinding(
  sessionId: string,
  finding: NormalizedFinding,
  agent: CodeReviewSpecialistId,
  index: number,
): CodeReviewFinding {
  return {
    id: toFindingId(sessionId, finding, agent, index),
    severity: finding.severity,
    type: finding.type,
    title: finding.title,
    summary: finding.summary,
    path: finding.path,
    lineStart: finding.lineStart,
    lineEnd: finding.lineEnd,
    agent,
  };
}

function updateProgress(
  sessionId: string,
  message: string,
  percent: number,
): CodeReviewSession {
  const next = touchSession(sessionId, (current) => ({
    ...current,
    status: "running",
    updatedAt: new Date().toISOString(),
    progress: {
      phase: "analyzing",
      percent,
      message,
    },
    failure: null,
  }));

  publishStatus(next);
  return next;
}

function cancelSessionInternal(sessionId: string, message: string): CodeReviewSession | null {
  const current = sessions.get(sessionId);
  if (!current) {
    return null;
  }

  if (isTerminal(current)) {
    return current;
  }

  const cancelled = touchSession(sessionId, (session) => ({
    ...session,
    status: "cancelled",
    updatedAt: new Date().toISOString(),
    progress: {
      phase: "finalizing",
      percent: 100,
      message,
    },
    failure: null,
  }));

  publishStatus(cancelled);
  publishComplete(cancelled);
  return cancelled;
}

async function runCodeReview(sessionId: string, signal: AbortSignal) {
  const timeoutMs = getGenerationTimeoutMs();

  updateProgress(sessionId, "Collecting changed-file context...", 10);

  try {
    const context = await withTimeout(buildCodeReviewPromptContext(), timeoutMs);

    if (signal.aborted || isCancelled(sessionId)) {
      return;
    }

    const prepared = touchSession(sessionId, (current) => ({
      ...current,
      status: "running",
      sourceFingerprint: context.sourceFingerprint,
      updatedAt: new Date().toISOString(),
      progress: {
        phase: "preparing",
        percent: 20,
        message: "Preparing parallel review agents...",
      },
      failure: null,
    }));
    publishStatus(prepared);

    if (context.focusFiles.length === 0) {
      const readyEmpty = touchSession(sessionId, (current) => ({
        ...current,
        status: "ready",
        updatedAt: new Date().toISOString(),
        progress: {
          phase: "finalizing",
          percent: 100,
          message: "No changed files to review.",
        },
        findings: [],
        failure: null,
      }));

      publishStatus(readyEmpty);
      publishComplete(readyEmpty);
      return;
    }

    const provider = await withTimeout(getCodeReviewProvider(), timeoutMs);
    const agentConfig = provider.getAgentConfig();

    logCodeReview("run-started", {
      sessionId,
      provider: agentConfig.provider,
      model: agentConfig.model,
      reasoningEffort: agentConfig.reasoningEffort,
      files: context.focusFiles.length,
      specialists: CODE_REVIEW_SPECIALISTS.length,
      timeoutMs,
    });

    let completedSpecialists = 0;
    let failedSpecialists = 0;

    await Promise.all(
      CODE_REVIEW_SPECIALISTS.map(async (specialist) => {
        try {
          const rawPayload = await withTimeout(
            provider.runSpecialist({
              specialist,
              focusFiles: context.focusFiles,
              promptContext: context.promptContext,
              signal,
            }),
            timeoutMs,
          );

          if (signal.aborted || isCancelled(sessionId)) {
            return;
          }

          const normalized = validateCodeReviewFindings(rawPayload, specialist);
          const findings = normalized.map((finding, index) =>
            toCodeReviewFinding(sessionId, finding, specialist.id, index)
          );

          const updated = touchSession(sessionId, (current) => ({
            ...current,
            updatedAt: new Date().toISOString(),
            findings: mergeCodeReviewFindings(current.findings, findings),
          }));

          for (const finding of findings) {
            publishFinding(updated, finding);
          }
        } catch (error) {
          failedSpecialists += 1;

          logCodeReview(
            "specialist-failed",
            {
              sessionId,
              specialist: specialist.id,
              message: toFailure(error).message,
            },
            "warn",
          );
        } finally {
          completedSpecialists += 1;

          if (signal.aborted || isCancelled(sessionId)) {
            return;
          }

          const percent = 20 + Math.round((completedSpecialists / CODE_REVIEW_SPECIALISTS.length) * 70);
          updateProgress(
            sessionId,
            `Specialist ${completedSpecialists}/${CODE_REVIEW_SPECIALISTS.length} completed.`,
            Math.min(90, percent),
          );
        }
      }),
    );

    if (signal.aborted || isCancelled(sessionId)) {
      return;
    }

    const current = getSessionOrThrow(sessionId);
    const noAgentSucceeded = failedSpecialists === CODE_REVIEW_SPECIALISTS.length;

    if (noAgentSucceeded && current.findings.length === 0) {
      const failed = touchSession(sessionId, (session) => ({
        ...session,
        status: "failed",
        updatedAt: new Date().toISOString(),
        progress: {
          phase: "finalizing",
          percent: 100,
          message: "All code review agents failed.",
        },
        failure: {
          message: "All review agents failed. Verify Codex availability and retry.",
          retryable: true,
        },
      }));

      publishStatus(failed);
      publishError(failed);
      publishComplete(failed);
      return;
    }

    const ready = touchSession(sessionId, (session) => ({
      ...session,
      status: "ready",
      updatedAt: new Date().toISOString(),
      progress: {
        phase: "finalizing",
        percent: 100,
        message: "Code review complete.",
      },
      failure: null,
    }));

    publishStatus(ready);
    publishComplete(ready);

    logCodeReview("run-completed", {
      sessionId,
      findings: ready.findings.length,
      failedSpecialists,
    });
  } catch (error) {
    if (signal.aborted || isCancelled(sessionId)) {
      return;
    }

    const failure = toFailure(error);

    const failed = touchSession(sessionId, (session) => ({
      ...session,
      status: "failed",
      updatedAt: new Date().toISOString(),
      progress: {
        phase: "finalizing",
        percent: 100,
        message: "Code review failed.",
      },
      failure,
    }));

    publishStatus(failed);
    publishError(failed);
    publishComplete(failed);
  }
}

function toInitialEvents(session: CodeReviewSession): CodeReviewSseEvent[] {
  const statusEvent: CodeReviewSseEvent = {
    type: "session_status",
    session: cloneSession(session),
  };

  if (session.status === "failed") {
    return [
      statusEvent,
      {
        type: "session_error",
        session: cloneSession(session),
        retryable: session.failure?.retryable ?? false,
        message: session.failure?.message ?? "Code review generation failed.",
      },
      {
        type: "session_complete",
        session: cloneSession(session),
      },
    ];
  }

  if (session.status === "ready" || session.status === "cancelled") {
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

export async function createCodeReviewSession(
  input: CreateCodeReviewSessionRequest = {},
): Promise<CodeReviewSession> {
  pruneSessions();

  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new ApiRouteError(400, "INVALID_REVIEW_SESSION", "Invalid code review session payload.");
  }

  if (activeRun) {
    cancelSessionInternal(activeRun.sessionId, "Cancelled by a newer code review run.");
    activeRun.abortController.abort();
    activeRun = null;
  }

  const createdAt = new Date().toISOString();
  const session: CodeReviewSession = {
    id: randomUUID(),
    status: "queued",
    sourceFingerprint: "",
    createdAt,
    updatedAt: createdAt,
    progress: {
      phase: "queued",
      percent: 0,
      message: "Code review queued.",
    },
    findings: [],
    failure: null,
  };

  sessions.set(session.id, session);
  publishStatus(session);

  const abortController = new AbortController();
  activeRun = {
    sessionId: session.id,
    abortController,
  };

  void runCodeReview(session.id, abortController.signal).finally(() => {
    if (activeRun?.sessionId === session.id) {
      activeRun = null;
    }
  });

  return cloneSession(session);
}

export function getCodeReviewSession(sessionId: string): CodeReviewSession {
  validateSessionId(sessionId);
  return cloneSession(getSessionOrThrow(sessionId));
}

export function subscribeToCodeReviewSession(
  sessionId: string,
  listener: (event: CodeReviewSseEvent) => void,
): () => void {
  validateSessionId(sessionId);
  const session = getSessionOrThrow(sessionId);
  const key = sessionEventKey(session.id);
  events.on(key, listener);

  return () => {
    events.off(key, listener);
  };
}

export function getCodeReviewSessionInitialEvents(sessionId: string): CodeReviewSseEvent[] {
  validateSessionId(sessionId);
  return toInitialEvents(getSessionOrThrow(sessionId));
}

export function cancelCodeReviewSession(sessionId: string): CodeReviewSession {
  validateSessionId(sessionId);
  const current = getSessionOrThrow(sessionId);

  if (isTerminal(current)) {
    return cloneSession(current);
  }

  const cancelled = cancelSessionInternal(sessionId, "Code review cancelled by user.");
  if (!cancelled) {
    throw new ApiRouteError(404, "REVIEW_SESSION_NOT_FOUND", "Code review session was not found.");
  }

  if (activeRun?.sessionId === sessionId) {
    activeRun.abortController.abort();
    activeRun = null;
  }

  return cloneSession(cancelled);
}

export function resetCodeReviewSessionsForTests() {
  if (activeRun) {
    activeRun.abortController.abort();
    activeRun = null;
  }

  sessions.clear();
  events.removeAllListeners();
  resetCodeReviewProviderForTests();
}
